// Performance plans: shifts logged against a plan, progress by the manager's chosen mode, and graduation.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { PLAN_CHECKS, planProgress, type PlanChecks, type PlanMode } from "../../shared/conduct";
import { GRADE_PASS } from "../../shared/program";
import { isStrike } from "./conduct";

type Action = typeof s.disciplinaryActions.$inferSelect;
type PlanShift = typeof s.planShifts.$inferSelect;

export const isOpenPlan = (a: Action) => a.step === "plan" && !a.graduatedOn && (a.status === "awaiting_signatures" || a.status === "final");

export function normalizeChecks(c: Record<string, boolean | null | undefined>): PlanChecks {
  return Object.fromEntries(PLAN_CHECKS.map((k) => [k, c[k] ?? null])) as PlanChecks;
}

export function planView(a: Action, shifts: PlanShift[]) {
  const mode: PlanMode = a.planMode ?? "in_a_row";
  const sorted = [...shifts].sort((x, y) => x.businessDate.localeCompare(y.businessDate) || x.shift.localeCompare(y.shift));
  const progress = planProgress(mode, sorted.map((x) => ({ checks: normalizeChecks(x.checks) })));
  return {
    actionId: a.id,
    status: a.status,
    since: a.businessDate,
    mode,
    modeChosen: !!a.planMode,
    focus: a.planFocus,
    progress,
    graduatedOn: a.graduatedOn,
    graduatedByName: a.graduatedByName,
    shifts: sorted.map((x) => ({ ...x, checks: normalizeChecks(x.checks), createdAt: x.createdAt.getTime() })),
  };
}
export type PlanView = ReturnType<typeof planView>;

/** Each person's open performance plan, with progress. */
export async function planSummaries(memberIds: string[]) {
  const out = new Map<string, PlanView>();
  if (!memberIds.length) return out;
  const acts: Action[] = [];
  for (let i = 0; i < memberIds.length; i += 400)
    acts.push(
      ...(await db
        .select()
        .from(s.disciplinaryActions)
        .where(and(inArray(s.disciplinaryActions.memberId, memberIds.slice(i, i + 400)), eq(s.disciplinaryActions.step, "plan")))),
    );
  const open = acts.filter(isOpenPlan);
  if (!open.length) return out;
  const shifts = await db.select().from(s.planShifts).where(inArray(s.planShifts.actionId, open.map((a) => a.id)));
  for (const a of open.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime()))
    out.set(
      a.memberId,
      planView(
        a,
        shifts.filter((x) => x.actionId === a.id),
      ),
    );
  return out;
}

/**
 * What the platform already knows about one person's shift: on time and in uniform from the line up,
 * no new strike from the conduct record, duties from the checklists, and a floor grade if one was given.
 * The manager confirms or changes each before signing.
 */
export async function planPrefill(memberId: string, storeId: string, date: string, shift: "lunch" | "dinner") {
  const [lu] = await db
    .select()
    .from(s.lineups)
    .where(and(eq(s.lineups.storeId, storeId), eq(s.lineups.businessDate, date), eq(s.lineups.shift, shift)));
  const [entry] = lu
    ? await db
        .select()
        .from(s.lineupEntries)
        .where(and(eq(s.lineupEntries.lineupId, lu.id), eq(s.lineupEntries.memberId, memberId)))
    : [];
  const events = await db
    .select()
    .from(s.conductEvents)
    .where(and(eq(s.conductEvents.memberId, memberId), eq(s.conductEvents.businessDate, date)));
  const cls = await db
    .select({ id: s.checklists.id })
    .from(s.checklists)
    .where(and(eq(s.checklists.storeId, storeId), eq(s.checklists.businessDate, date)));
  const initialled = cls.length
    ? (
        await db
          .select({ id: s.checklistLines.id })
          .from(s.checklistLines)
          .where(and(inArray(s.checklistLines.checklistId, cls.map((c) => c.id)), eq(s.checklistLines.doneById, memberId)))
      ).length
    : 0;
  const grades = await db
    .select({ average: s.grades.average })
    .from(s.grades)
    .where(and(eq(s.grades.memberId, memberId), eq(s.grades.businessDate, date)));
  const grade = grades.length ? Math.max(...grades.map((g) => g.average)) : null;
  const strike = events.some((e) => isStrike(e, date));
  const onTime = entry ? (entry.arrival === "on_time" ? true : entry.arrival === "pending" ? null : false) : null;
  const dress = entry ? (entry.uniformOk == null ? null : entry.uniformOk) : null;
  return {
    checks: normalizeChecks({
      onTime: strike && events.some((e) => e.type === "late" || e.type === "no_show") ? false : onTime,
      dress: events.some((e) => e.type === "dress_code") ? false : dress,
      noStrike: !strike,
      duties: initialled > 0 ? true : null,
      grade: grade == null ? null : grade >= GRADE_PASS,
      standards: null,
      improvement: null,
    }),
    sources: {
      lineup: !!entry,
      arrival: entry?.arrival ?? null,
      minutesLate: entry?.minutesLate ?? null,
      uniformMissing: entry?.uniformMissing ?? [],
      strikes: events.filter((e) => e.status !== "excused").map((e) => e.detail),
      linesInitialled: initialled,
      grade,
    },
  };
}
