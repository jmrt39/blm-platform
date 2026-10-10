import { targetForRole } from "../../shared/metrics";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays, businessDate } from "./time";
import { CONDUCT_WEIGHT, STRIKE_WINDOW_DAYS, stepForStrikes, stepRank, type Step } from "../../shared/conduct";
import { isManagementRole } from "../../shared/domain";

const TZ = "America/New_York";
export const today = () => businessDate(TZ);
/** First business date still inside the rolling strike window. */
export const windowStart = (day = today()) => addDays(day, -(STRIKE_WINDOW_DAYS - 1));

type Event = typeof s.conductEvents.$inferSelect;
type Action = typeof s.disciplinaryActions.$inferSelect;

export const isStrike = (e: Event, from = windowStart()) => e.status !== "excused" && e.businessDate >= from;

/** Events for these members inside the window (all statuses). */
export async function windowEvents(memberIds: string[], from = windowStart()) {
  if (!memberIds.length) return [] as Event[];
  return db
    .select()
    .from(s.conductEvents)
    .where(and(inArray(s.conductEvents.memberId, memberIds), gte(s.conductEvents.businessDate, from)));
}

/** Highest live step on record inside the window (void/declined don't count). */
export function currentStep(actions: Action[], from = windowStart()): Step | null {
  let best: Step | null = null;
  for (const a of actions) {
    if (a.status === "void" || a.status === "declined" || a.businessDate < from) continue;
    if (stepRank(a.step) > stepRank(best)) best = a.step;
  }
  return best;
}

/**
 * Re-check one person against the ladder after a strike is added or excused.
 * - A pending (unsigned) write-up that no longer applies, or is overtaken by a higher step, is voided.
 * - If their strikes call for a higher step than they already have, a new write-up is opened.
 * Returns the write-up that was opened, if any.
 */
export async function evaluateLadder(memberId: string): Promise<Action | null> {
  const [m] = await db.select().from(s.members).where(eq(s.members.id, memberId));
  if (!m) return null;
  const from = windowStart();
  const events = (await windowEvents([memberId], from)).filter((e) => isStrike(e, from));
  const strikes = events.length;
  const target = stepForStrikes(strikes);
  const actions = await db.select().from(s.disciplinaryActions).where(eq(s.disciplinaryActions.memberId, memberId));

  for (const a of actions) {
    if (a.status !== "awaiting_signatures") continue;
    if (stepRank(a.step) > stepRank(target)) {
      await db
        .update(s.disciplinaryActions)
        .set({ status: "void", voidReason: "A strike was excused, so this step no longer applies." })
        .where(eq(s.disciplinaryActions.id, a.id));
      a.status = "void";
    }
  }
  const have = currentStep(actions, from);
  if (!target || stepRank(target) <= stepRank(have)) return null;

  // A newer step supersedes any lower one still waiting for signatures.
  for (const a of actions) {
    if (a.status === "awaiting_signatures" && stepRank(a.step) < stepRank(target)) {
      await db
        .update(s.disciplinaryActions)
        .set({ status: "void", voidReason: `Superseded by the ${target === "plan" ? "performance plan" : target} step.` })
        .where(eq(s.disciplinaryActions.id, a.id));
    }
  }
  const row = {
    id: crypto.randomUUID(),
    orgId: m.orgId,
    storeId: m.storeId,
    memberId: m.id,
    memberName: m.name,
    step: target,
    strikeCount: strikes,
    eventIds: events.sort((a, b) => a.businessDate.localeCompare(b.businessDate)).map((e) => e.id),
    businessDate: today(),
  };
  await db.insert(s.disciplinaryActions).values(row);
  const [created] = await db.select().from(s.disciplinaryActions).where(eq(s.disciplinaryActions.id, row.id));
  return created ?? null;
}

export type Rating = {
  overall: number | null;
  performance: number | null;
  conduct: number;
  strikes: number;
  parts: { checkAvg: number | null; sales: number | null; checklists: number };
  spt30: number | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const SELLERS = ["server", "sommelier", "bartender"];

/**
 * Overall rating, 0–100: 75% performance, 25% conduct.
 * Performance (sellers): check average vs store target 50%, sales per shift vs peers 25%, checklists 25%.
 * Performance (support staff): checklists. Managers: store's on-time checklist rate.
 * Conduct: 100, minus 20 for each strike in the last 90 days.
 */
export async function computeRatings(storeIds: string[]) {
  const out = new Map<string, Rating>();
  if (!storeIds.length) return out;
  const day = today();
  const since = addDays(day, -30);
  const members = await db
    .select()
    .from(s.members)
    .where(and(inArray(s.members.storeId, storeIds), eq(s.members.status, "active")));
  if (!members.length) return out;
  const stores = await db.select().from(s.stores).where(inArray(s.stores.id, storeIds));
  const target = new Map(stores.map((x) => [x.id, x.ticketTarget]));

  const lines = await db
    .select({ memberId: s.shiftReportLines.memberId, role: s.shiftReportLines.role, sales: s.shiftReportLines.netSales, checks: s.shiftReportLines.checks, storeId: s.shiftReports.storeId })
    .from(s.shiftReportLines)
    .innerJoin(s.shiftReports, eq(s.shiftReports.id, s.shiftReportLines.reportId))
    .where(and(inArray(s.shiftReports.storeId, storeIds), gte(s.shiftReports.businessDate, since)));
  const perf = new Map<string, { sales: number; checks: number; shifts: number }>();
  const peer = new Map<string, { sales: number; shifts: number }>(); // store|bar-or-floor
  for (const l of lines) {
    const k = `${l.storeId}|${l.role === "bartender" ? "bar" : "floor"}`;
    const pp = peer.get(k) ?? { sales: 0, shifts: 0 };
    pp.sales += l.sales;
    pp.shifts += 1;
    peer.set(k, pp);
    if (!l.memberId) continue;
    const p = perf.get(l.memberId) ?? { sales: 0, checks: 0, shifts: 0 };
    p.sales += l.sales;
    p.checks += l.checks;
    p.shifts += 1;
    perf.set(l.memberId, p);
  }

  const cls = await db
    .select({ id: s.checklists.id, storeId: s.checklists.storeId, status: s.checklists.status, dueAt: s.checklists.dueAt, submittedAt: s.checklists.submittedAt })
    .from(s.checklists)
    .where(and(inArray(s.checklists.storeId, storeIds), gte(s.checklists.businessDate, since), lt(s.checklists.businessDate, day)));
  const onTime = new Map<string, { ok: number; n: number }>();
  for (const c of cls) {
    const o = onTime.get(c.storeId) ?? { ok: 0, n: 0 };
    o.n += 1;
    if (c.status === "submitted" && c.submittedAt && c.submittedAt.getTime() <= c.dueAt.getTime()) o.ok += 1;
    onTime.set(c.storeId, o);
  }
  const initialled = new Map<string, number>();
  if (cls.length) {
    const ids = cls.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 400) {
      const rows = await db
        .select({ by: s.checklistLines.doneById })
        .from(s.checklistLines)
        .where(inArray(s.checklistLines.checklistId, ids.slice(i, i + 400)));
      for (const r of rows) if (r.by) initialled.set(r.by, (initialled.get(r.by) ?? 0) + 1);
    }
  }

  const from = windowStart(day);
  const ev = await db
    .select({ memberId: s.conductEvents.memberId })
    .from(s.conductEvents)
    .where(
      and(
        inArray(s.conductEvents.storeId, storeIds),
        gte(s.conductEvents.businessDate, from),
        ne(s.conductEvents.status, "excused"),
      ),
    );
  const strikes = new Map<string, number>();
  for (const e of ev) strikes.set(e.memberId, (strikes.get(e.memberId) ?? 0) + 1);

  for (const m of members) {
    const st = strikes.get(m.id) ?? 0;
    const conduct = clamp(100 - 20 * st);
    let checkAvg: number | null = null;
    let sales: number | null = null;
    let checklists: number;
    let performance: number | null;
    const p = perf.get(m.id);
    if (isManagementRole(m.role)) {
      const o = onTime.get(m.storeId);
      checklists = o && o.n ? Math.round((o.ok / o.n) * 100) : 80;
      performance = checklists;
    } else {
      checklists = clamp(70 + 3 * (initialled.get(m.id) ?? 0));
      if (SELLERS.includes(m.role) && p && p.checks) {
        const t = target.get(m.storeId) ?? 190;
        const ratio = p.sales / p.checks / targetForRole(m.role, t);
        checkAvg = clamp(80 + (ratio - 1) * 250);
        const pr = peer.get(`${m.storeId}|${m.role === "bartender" ? "bar" : "floor"}`);
        const peerAvg = pr && pr.shifts ? pr.sales / pr.shifts : 0;
        sales = peerAvg ? clamp(80 + (p.sales / p.shifts / peerAvg - 1) * 100) : 80;
        performance = 0.5 * checkAvg + 0.25 * sales + 0.25 * checklists;
      } else performance = SELLERS.includes(m.role) ? null : checklists;
    }
    const overall = performance == null ? null : Math.round((1 - CONDUCT_WEIGHT) * performance + CONDUCT_WEIGHT * conduct);
    out.set(m.id, {
      overall,
      performance: performance == null ? null : Math.round(performance),
      conduct,
      strikes: st,
      parts: { checkAvg: checkAvg == null ? null : Math.round(checkAvg), sales: sales == null ? null : Math.round(sales), checklists: Math.round(checklists) },
      spt30: p && p.checks ? p.sales / p.checks : null,
    });
  }
  return out;
}

/** Live (not void) write-ups for these members, newest first. */
export async function actionsFor(memberIds: string[]) {
  if (!memberIds.length) return [] as Action[];
  const rows = await db.select().from(s.disciplinaryActions).where(inArray(s.disciplinaryActions.memberId, memberIds));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

