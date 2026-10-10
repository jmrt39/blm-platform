import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { DEFAULT_CLOSING, DEFAULT_OPENING, onboardingPlan } from "../../shared/domain";
import { addDays, businessDate, dueAtFor } from "./time";

export async function insertChunked<T extends Record<string, unknown>>(table: any, rows: T[], size = 80) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

export async function seedTemplates(storeId: string) {
  const rows = [
    ...DEFAULT_OPENING.map((l, i) => ({ storeId, type: "opening" as const, area: l.area, title: l.title, sort: i })),
    ...DEFAULT_CLOSING.map((l, i) => ({ storeId, type: "closing" as const, area: l.area, title: l.title, sort: i })),
  ];
  await insertChunked(s.checklistTemplateItems, rows);
}

/** Build the onboarding rows for a new colleague. */
export function onboardingRows(memberId: string, role: string, hireDate: string) {
  return onboardingPlan(role).map((item, i) => ({
    id: crypto.randomUUID(),
    memberId,
    phase: item.phase,
    title: item.title,
    detail: item.detail,
    dueDate: addDays(hireDate, item.phase),
    sort: i,
  }));
}

/** Ensure today's (or a given day's) opening and closing checklists exist for a store. */
export async function ensureChecklists(store: typeof s.stores.$inferSelect, date?: string) {
  const day = date ?? businessDate(store.timezone);
  const existing = await db
    .select()
    .from(s.checklists)
    .where(and(eq(s.checklists.storeId, store.id), eq(s.checklists.businessDate, day)));
  const have = new Set(existing.map((c) => c.type));
  const missing = (["opening", "closing"] as const).filter((t) => !have.has(t));
  if (missing.length) {
    const tmpl = await db
      .select()
      .from(s.checklistTemplateItems)
      .where(and(eq(s.checklistTemplateItems.storeId, store.id), inArray(s.checklistTemplateItems.type, missing)));
    for (const type of missing) {
      const cid = crypto.randomUUID();
      try {
        await db.insert(s.checklists).values({
          id: cid,
          storeId: store.id,
          type,
          businessDate: day,
          dueAt: dueAtFor(store.timezone, type, day, store.openingDueBy, store.closingDueBy),
        });
      } catch {
        continue; // created concurrently
      }
      const lines = tmpl
        .filter((t) => t.type === type)
        .sort((a, b) => a.sort - b.sort)
        .map((t) => ({ checklistId: cid, area: t.area, title: t.title, sort: t.sort }));
      if (lines.length) await insertChunked(s.checklistLines, lines);
    }
  }
  return db
    .select()
    .from(s.checklists)
    .where(and(eq(s.checklists.storeId, store.id), eq(s.checklists.businessDate, day)));
}
