import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, uniqueMemberPin } from "../lib/access";
import { onboardingRows } from "../lib/core";
import { businessDate, daysBetween } from "../lib/time";
import { TZ } from "../lib/program-access";
import { DEFAULT_TICKET_TARGET } from "../../shared/metrics";
import { initialsOf, isManagementRole, ROLE_LABEL, STORE_ROLES, type StoreRole } from "../../shared/domain";

/** Accepts "server", "Server", "Food Runner", "food runner", "GM"… */
function roleFrom(raw: string): StoreRole | null {
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((STORE_ROLES as readonly string[]).includes(k)) return k as StoreRole;
  const byLabel = Object.entries(ROLE_LABEL).find(([, l]) => l.toLowerCase() === raw.trim().toLowerCase());
  if (byLabel && (STORE_ROLES as readonly string[]).includes(byLabel[0])) return byLabel[0] as StoreRole;
  const alias: Record<string, StoreRole> = { general_manager: "gm", assistant_gm: "agm", manager: "floor_manager", runner: "food_runner", somm: "sommelier", bar: "bartender" };
  return alias[k] ?? null;
}

const row = z.object({
  name: z.string().min(2).max(80),
  role: z.string().min(2).max(40),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be YYYY-MM-DD"),
  email: z.string().max(120).default(""),
  phone: z.string().max(40).default(""),
  isTrainer: z.boolean().default(false),
});

export const setup = {
  /** What a new group still has to do before the platform is useful. */
  status: managerBase.handler(async ({ context }) => {
    const v = context.viewer;
    const ids = v.storeIds;
    if (!ids.length) return null;
    const [stores, members, reports, lineups, checklists] = await Promise.all([
      db.select().from(s.stores).where(inArray(s.stores.id, ids)),
      db.select({ role: s.members.role, isTrainer: s.members.isTrainer }).from(s.members).where(and(inArray(s.members.storeId, ids), eq(s.members.status, "active"))),
      db.select({ n: count() }).from(s.shiftReports).where(inArray(s.shiftReports.storeId, ids)),
      db.select({ n: count() }).from(s.lineups).where(inArray(s.lineups.storeId, ids)),
      db.select({ n: count() }).from(s.checklists).where(and(inArray(s.checklists.storeId, ids), eq(s.checklists.status, "submitted"))),
    ]);
    const staff = members.filter((m) => !isManagementRole(m.role));
    const steps = [
      { key: "stores", label: "Add every store, with its PIN and spend per ticket target", href: "/stores", done: stores.length > 1 || stores.some((x) => x.ticketTarget !== DEFAULT_TICKET_TARGET) },
      { key: "managers", label: "Add your GM and managers", href: "/team/new", done: members.some((m) => isManagementRole(m.role)) },
      { key: "roster", label: "Import the front of house roster (CSV from your scheduler)", href: "/team/import", done: staff.length >= 5 },
      { key: "trainers", label: "Mark your trainers so they can sign off modules", href: "/team", done: members.some((m) => m.isTrainer) },
      { key: "checklist", label: "Run the first opening checklist", href: "/checklists", done: checklists[0]!.n > 0 },
      { key: "lineup", label: "Run the first line-up", href: "/lineup", done: lineups[0]!.n > 0 },
      { key: "report", label: "Enter the first shift report from the POS", href: "/shift-report", done: reports[0]!.n > 0 },
    ];
    return { steps, done: steps.filter((x) => x.done).length, total: steps.length };
  }),

  /** Bulk add a roster. Existing names at the store are skipped, so it is safe to run twice. */
  importRoster: managerBase
    .input(z.object({ storeId: z.string(), rows: z.array(row).min(1).max(250) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      const existing = await db.select({ name: s.members.name }).from(s.members).where(eq(s.members.storeId, input.storeId));
      const have = new Set(existing.map((e) => e.name.trim().toLowerCase()));
      const today = businessDate(TZ);
      const errors: { line: number; message: string }[] = [];
      const created: { name: string; role: StoreRole; pin: string }[] = [];
      let skipped = 0;
      for (const [i, r] of input.rows.entries()) {
        const role = roleFrom(r.role);
        if (!role) {
          errors.push({ line: i + 1, message: `${r.name}: unknown role "${r.role}"` });
          continue;
        }
        if (isManagementRole(role) && v.level === "manager" && v.member?.role !== "gm") {
          errors.push({ line: i + 1, message: `${r.name}: only the GM or owner can add managers` });
          continue;
        }
        if (have.has(r.name.trim().toLowerCase())) {
          skipped++;
          continue;
        }
        const id = crypto.randomUUID();
        const pin = await uniqueMemberPin(input.storeId);
        await db.insert(s.members).values({
          id,
          orgId: v.orgId,
          storeId: input.storeId,
          name: r.name.trim(),
          initials: initialsOf(r.name),
          role,
          isTrainer: r.isTrainer,
          email: r.email ? r.email.toLowerCase() : null,
          phone: r.phone || null,
          pin,
          hireDate: r.hireDate,
        });
        // Only people still inside their first 90 days get a 30/60/90 plan.
        if (daysBetween(r.hireDate, today) < 90) await db.insert(s.onboardingItems).values(onboardingRows(id, role, r.hireDate));
        have.add(r.name.trim().toLowerCase());
        created.push({ name: r.name.trim(), role, pin });
      }
      if (!created.length && errors.length) throw new ORPCError("BAD_REQUEST", { message: errors.map((e) => e.message).join("; ") });
      return { created, skipped, errors };
    }),
};
