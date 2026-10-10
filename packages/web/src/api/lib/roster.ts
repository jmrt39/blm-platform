// Adding people in bulk: the roster CSV on the team page and the Studio intake sheet both land here.
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { uniqueMemberPin } from "./access";
import { onboardingRows } from "./core";
import { businessDate, daysBetween } from "./time";
import { TZ } from "./program-access";
import { initialsOf, isManagementRole, ROLE_LABEL, STORE_ROLES, type StoreRole } from "../../shared/domain";

/** Accepts "server", "Server", "Food Runner", "food runner", "GM"… */
export function roleFrom(raw: string): StoreRole | null {
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((STORE_ROLES as readonly string[]).includes(k)) return k as StoreRole;
  const byLabel = Object.entries(ROLE_LABEL).find(([, l]) => l.toLowerCase() === raw.trim().toLowerCase());
  if (byLabel && (STORE_ROLES as readonly string[]).includes(byLabel[0])) return byLabel[0] as StoreRole;
  const alias: Record<string, StoreRole> = {
    general_manager: "gm",
    assistant_gm: "agm",
    assistant_general_manager: "agm",
    manager: "floor_manager",
    runner: "food_runner",
    somm: "sommelier",
    bar: "bartender",
    hostess: "host",
    bus: "busser",
    server_assistant: "busser",
  };
  return alias[k] ?? null;
}

export type RosterRow = {
  name: string;
  role: string;
  hireDate: string;
  email: string;
  phone: string;
  isTrainer: boolean;
  employment: "full_time" | "part_time";
};

/** Existing names at the store are skipped, so it is safe to run twice. */
export async function addRoster(orgId: string, storeId: string, rows: RosterRow[], opts: { canAddManagers: boolean }) {
  const existing = await db.select({ name: s.members.name }).from(s.members).where(eq(s.members.storeId, storeId));
  const have = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const today = businessDate(TZ);
  const errors: { line: number; message: string }[] = [];
  const created: { name: string; role: StoreRole; pin: string }[] = [];
  let skipped = 0;
  for (const [i, r] of rows.entries()) {
    const role = roleFrom(r.role);
    if (!role) {
      errors.push({ line: i + 1, message: `${r.name}: "${r.role}" is not a front of house role. Use ${STORE_ROLES.map((x) => ROLE_LABEL[x]).join(", ")}` });
      continue;
    }
    if (isManagementRole(role) && !opts.canAddManagers) {
      errors.push({ line: i + 1, message: `${r.name}: only the GM or owner can add managers` });
      continue;
    }
    if (have.has(r.name.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    const id = crypto.randomUUID();
    const pin = await uniqueMemberPin(storeId);
    await db.insert(s.members).values({
      id,
      orgId,
      storeId,
      name: r.name.trim(),
      initials: initialsOf(r.name),
      role,
      isTrainer: r.isTrainer,
      email: r.email ? r.email.toLowerCase() : null,
      phone: r.phone || null,
      pin,
      hireDate: r.hireDate,
      employment: r.employment,
    });
    // Only people still inside their first 90 days get a 30/60/90 plan.
    if (daysBetween(r.hireDate, today) < 90) await db.insert(s.onboardingItems).values(onboardingRows(id, role, r.hireDate));
    have.add(r.name.trim().toLowerCase());
    created.push({ name: r.name.trim(), role, pin });
  }
  return { created, skipped, errors };
}
