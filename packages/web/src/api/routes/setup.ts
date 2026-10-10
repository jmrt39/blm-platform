import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase } from "../lib/access";
import { addRoster } from "../lib/roster";
import { DEFAULT_TICKET_TARGET } from "../../shared/metrics";
import { isManagementRole } from "../../shared/domain";

const row = z.object({
  name: z.string().min(2).max(80),
  role: z.string().min(2).max(40),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be YYYY-MM-DD"),
  email: z.string().max(120).default(""),
  phone: z.string().max(40).default(""),
  isTrainer: z.boolean().default(false),
  employment: z.enum(["full_time", "part_time"]).default("full_time"),
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
      { key: "reviews", label: "Add each store's Google review page, so guest reviews can be answered in one tap", href: "/stores", done: stores.every((x) => !!x.reviewLinks?.Google) },
      { key: "managers", label: "Add your GM and managers", href: "/team/new", done: members.some((m) => isManagementRole(m.role)) },
      { key: "roster", label: "Import the front of house roster (CSV from your scheduler)", href: "/team/import", done: staff.length >= 5 },
      { key: "trainers", label: "Mark your trainers so they can sign off modules", href: "/team", done: members.some((m) => m.isTrainer) },
      { key: "checklist", label: "Run the first opening checklist", href: "/checklists", done: checklists[0]!.n > 0 },
      { key: "lineup", label: "Run the first line up", href: "/lineup", done: lineups[0]!.n > 0 },
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
      const { created, skipped, errors } = await addRoster(v.orgId, input.storeId, input.rows, { canAddManagers: !(v.level === "manager" && v.member?.role !== "gm") });
      if (!created.length && errors.length) throw new ORPCError("BAD_REQUEST", { message: errors.map((e) => e.message).join("; ") });
      return { created, skipped, errors };
    }),
};
