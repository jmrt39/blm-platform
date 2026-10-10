// Spend per ticket performance: only solo serving shifts count, each measured against the target that applied to it.
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays } from "./time";
import { BLOCKING_STEPS, STEP_SHORT, STRIKE_WINDOW_DAYS } from "../../shared/conduct";
import { CASH_OVER, MIN_SHIFTS, ROLLING_DAYS, isCounted, targetFor, targetGrid, type Employment } from "../../shared/metrics";

type Action = typeof s.disciplinaryActions.$inferSelect;

export type PerfLine = {
  memberId: string | null;
  storeId: string;
  date: string;
  shift: "lunch" | "dinner";
  kind: string;
  role: string;
  sales: number;
  checks: number;
  covers: number;
  /** The target that applied: frozen on the line, or worked out from today's grid for older lines. */
  target: number;
  counted: boolean;
};

export type Perf = {
  sales: number;
  checks: number;
  /** Counted (solo serving) shifts. */
  shifts: number;
  /** Shifts worked that don't count: training, other work, events, cut short. */
  uncounted: number;
  spt: number | null;
  /** Ticket weighted target across the counted shifts. */
  target: number | null;
  /** spt ÷ target, 1 = on target. */
  pct: number | null;
};

export const rollingFrom = (to: string) => addDays(to, -(ROLLING_DAYS - 1));

type GridStore = { id: string; ticketTarget: number; dinnerPartTarget: number | null; lunchTarget: number | null; lunchPartTarget: number | null };
type TargetMember = { id: string; role: string; employment: Employment; targetAdjust: number | null };

/** The target a person would be held to on one shift at one store, today. */
export function lineTarget(store: GridStore, m: Pick<TargetMember, "employment" | "targetAdjust"> | null | undefined, role: string, shift: "lunch" | "dinner") {
  return targetFor(targetGrid(store), { role, employment: m?.employment ?? "full_time", targetAdjust: m?.targetAdjust ?? null }, shift);
}

/** Every server line in the range, with the target that applied to it. */
export async function perfLines(storeIds: string[], from: string, to: string): Promise<PerfLine[]> {
  if (!storeIds.length) return [];
  const rows = await db
    .select({
      memberId: s.shiftReportLines.memberId,
      role: s.shiftReportLines.role,
      sales: s.shiftReportLines.netSales,
      checks: s.shiftReportLines.checks,
      covers: s.shiftReportLines.covers,
      shift: s.shiftReportLines.shift,
      kind: s.shiftReportLines.kind,
      target: s.shiftReportLines.target,
      storeId: s.shiftReports.storeId,
      date: s.shiftReports.businessDate,
    })
    .from(s.shiftReportLines)
    .innerJoin(s.shiftReports, eq(s.shiftReports.id, s.shiftReportLines.reportId))
    .where(and(inArray(s.shiftReports.storeId, storeIds), gte(s.shiftReports.businessDate, from), lte(s.shiftReports.businessDate, to)));
  const stores = new Map((await db.select().from(s.stores).where(inArray(s.stores.id, storeIds))).map((x) => [x.id, x]));
  const ids = [...new Set(rows.map((r) => r.memberId).filter((x): x is string => !!x))];
  const members = new Map<string, TargetMember>();
  for (let i = 0; i < ids.length; i += 400)
    for (const m of await db
      .select({ id: s.members.id, role: s.members.role, employment: s.members.employment, targetAdjust: s.members.targetAdjust })
      .from(s.members)
      .where(inArray(s.members.id, ids.slice(i, i + 400))))
      members.set(m.id, m);
  return rows.map((r) => ({
    ...r,
    target: r.target ?? lineTarget(stores.get(r.storeId)!, r.memberId ? members.get(r.memberId) : null, r.role, r.shift),
    counted: isCounted(r.kind),
  }));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function perfOf(lines: PerfLine[]): Perf {
  let sales = 0,
    checks = 0,
    shifts = 0,
    uncounted = 0,
    tw = 0;
  for (const l of lines) {
    if (!l.counted) {
      uncounted += 1;
      continue;
    }
    sales += l.sales;
    checks += l.checks;
    shifts += 1;
    tw += l.target * l.checks;
  }
  const spt = checks ? sales / checks : null;
  const target = checks ? r2(tw / checks) : null;
  return { sales, checks, shifts, uncounted, spt, target, pct: spt != null && target ? spt / target : null };
}

/** Per person, for the lines between from and to (inclusive). */
export function perfBy(lines: PerfLine[], from = "0000", to = "9999") {
  const g = new Map<string, PerfLine[]>();
  for (const l of lines) {
    if (!l.memberId || l.date < from || l.date > to) continue;
    const a = g.get(l.memberId) ?? [];
    a.push(l);
    g.set(l.memberId, a);
  }
  return new Map([...g].map(([k, v]) => [k, perfOf(v)]));
}

export type Standing = Perf & {
  enough: boolean;
  atTarget: boolean;
  cash: boolean;
  need: number;
};
/** Where a person stands against the reward rules (before any conduct block). */
export function standing(p: Perf | undefined, minShifts = MIN_SHIFTS): Standing {
  const base = p ?? { sales: 0, checks: 0, shifts: 0, uncounted: 0, spt: null, target: null, pct: null };
  const enough = base.shifts >= minShifts;
  const pct = base.pct ?? 0;
  return { ...base, enough, atTarget: enough && pct >= 1, cash: enough && pct >= 1 + CASH_OVER - 1e-9, need: Math.max(0, minShifts - base.shifts) };
}

/* ── Conduct blocks ───────────────────────────────────────────────────────────────────── */

/** The days a blocking write up was live: a written warning for its 90 days, a plan until graduation, a termination for good. */
export function activeSpan(a: Action, resetOn: string | null): { from: string; to: string } | null {
  if (!BLOCKING_STEPS.includes(a.step) || a.status === "void" || a.status === "declined") return null;
  let to = a.step === "written" ? addDays(a.businessDate, STRIKE_WINDOW_DAYS - 1) : a.step === "plan" ? (a.graduatedOn ?? "9999-12-31") : "9999-12-31";
  if (resetOn && resetOn >= a.businessDate && resetOn < to) to = resetOn;
  return { from: a.businessDate, to };
}

export type Block = { step: string; from: string; to: string; reason: string } | null;

/** The first blocking write up live on any day of the period, if any. */
export function blockIn(acts: Action[], resetOn: string | null, from: string, to: string): Block {
  for (const a of acts) {
    const sp = activeSpan(a, resetOn);
    if (!sp || sp.from > to || sp.to < from) continue;
    const open = sp.to >= "9999";
    const what = STEP_SHORT[a.step];
    return {
      step: a.step,
      from: sp.from,
      to: sp.to,
      reason: open ? `${what} since ${sp.from}. No rewards while it stands.` : `${what} live ${sp.from} to ${sp.to}. No rewards for this period.`,
    };
  }
  return null;
}

/** Blocking write ups for these people, grouped by person. */
export async function blockingActions(memberIds: string[]) {
  const out = new Map<string, Action[]>();
  for (let i = 0; i < memberIds.length; i += 400) {
    const rows = await db
      .select()
      .from(s.disciplinaryActions)
      .where(and(inArray(s.disciplinaryActions.memberId, memberIds.slice(i, i + 400)), inArray(s.disciplinaryActions.step, [...BLOCKING_STEPS])));
    for (const r of rows) out.set(r.memberId, [...(out.get(r.memberId) ?? []), r]);
  }
  return out;
}
