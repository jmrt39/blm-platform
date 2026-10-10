// Last year's daily totals, handed over before launch, compared like for like with this year's shift reports.
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays } from "./time";

/** Same weekday, 52 weeks back. */
export const LY_OFFSET = 364;
export const lyDate = (date: string) => addDays(date, -LY_OFFSET);

type Day = { sales: number; tickets: number; covers: number };
const sum = (xs: Day[]) => xs.reduce((a, x) => ({ sales: a.sales + x.sales, tickets: a.tickets + x.tickets, covers: a.covers + x.covers }), { sales: 0, tickets: 0, covers: 0 });
const spt = (d: Day) => (d.tickets ? Math.round((d.sales / d.tickets) * 100) / 100 : 0);
const change = (a: number, b: number) => (b ? a / b - 1 : null);

async function lastYearDays(storeIds: string[], from: string, to: string) {
  if (!storeIds.length) return [];
  return db
    .select()
    .from(s.historyDays)
    .where(and(inArray(s.historyDays.storeId, storeIds), gte(s.historyDays.date, lyDate(from)), lte(s.historyDays.date, lyDate(to))));
}

/**
 * This period against the same period last year. Only store days present in both years count,
 * so a missing report or a gap in the history never skews the comparison.
 */
export async function lastYearCompare(storeIds: string[], from: string, to: string) {
  const [ly, ty] = await Promise.all([
    lastYearDays(storeIds, from, to),
    db
      .select({ storeId: s.shiftReports.storeId, date: s.shiftReports.businessDate, sales: s.shiftReports.netSales, tickets: s.shiftReports.checks, covers: s.shiftReports.covers })
      .from(s.shiftReports)
      .where(and(inArray(s.shiftReports.storeId, storeIds), gte(s.shiftReports.businessDate, from), lte(s.shiftReports.businessDate, to))),
  ]);
  if (!ly.length) return null;
  const lyBy = new Map(ly.map((d) => [`${d.storeId}:${d.date}`, { sales: d.netSales, tickets: d.tickets, covers: d.covers }]));
  const thisYear: Day[] = [];
  const lastYear: Day[] = [];
  for (const r of ty) {
    const hit = lyBy.get(`${r.storeId}:${lyDate(r.date)}`);
    if (!hit) continue;
    thisYear.push(r);
    lastYear.push(hit);
  }
  if (!thisYear.length) return null;
  const a = sum(thisYear);
  const b = sum(lastYear);
  return {
    days: thisYear.length,
    thisYear: { ...a, spt: spt(a) },
    lastYear: { ...b, spt: spt(b) },
    salesChange: change(a.sales, b.sales),
    ticketsChange: change(a.tickets, b.tickets),
    sptChange: change(spt(a), spt(b)),
  };
}

/** What these stores did on this day last year: the night ahead's best forecast. */
export async function onThisDay(storeIds: string[], date: string) {
  const rows = await lastYearDays(storeIds, date, date);
  if (!rows.length) return null;
  const t = sum(rows.map((d) => ({ sales: d.netSales, tickets: d.tickets, covers: d.covers })));
  return { date: lyDate(date), stores: rows.length, ...t, spt: spt(t) };
}

/** How much history each store has, for the Studio and the setup checklist. */
export async function historyCoverage(storeIds: string[]) {
  type Cov = { days: number; from: string | null; to: string | null; avgTicket: number | null };
  if (!storeIds.length) return new Map<string, Cov>();
  const rows = await db
    .select({ storeId: s.historyDays.storeId, date: s.historyDays.date, netSales: s.historyDays.netSales, tickets: s.historyDays.tickets })
    .from(s.historyDays)
    .where(inArray(s.historyDays.storeId, storeIds));
  const out = new Map<string, Cov>();
  for (const id of storeIds) {
    const mine = rows.filter((r) => r.storeId === id).sort((a, b) => a.date.localeCompare(b.date));
    // Average ticket over the most recent 12 months on file: where a target starts.
    const last = mine.slice(-365);
    const tickets = last.reduce((a, r) => a + r.tickets, 0);
    const sales = last.reduce((a, r) => a + r.netSales, 0);
    out.set(id, { days: mine.length, from: mine[0]?.date ?? null, to: mine[mine.length - 1]?.date ?? null, avgTicket: tickets ? sales / tickets : null });
  }
  return out;
}

export type HistoryRow = { date: string; netSales: number; tickets: number; covers: number };

/** Upsert daily totals for one store. Re-importing a date replaces it. */
export async function upsertHistory(store: { id: string; orgId: string }, input: HistoryRow[]) {
  const rows = [...new Map(input.map((r) => [r.date, r])).values()];
  for (let i = 0; i < rows.length; i += 80) {
    await db
      .insert(s.historyDays)
      .values(rows.slice(i, i + 80).map((r) => ({ orgId: store.orgId, storeId: store.id, ...r })))
      .onConflictDoUpdate({
        target: [s.historyDays.storeId, s.historyDays.date],
        set: { netSales: sql`excluded.net_sales`, tickets: sql`excluded.tickets`, covers: sql`excluded.covers` },
      });
  }
  return rows.length;
}
