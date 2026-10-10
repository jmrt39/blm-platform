// Training, certifications and rewards — computed state shared by several routes.
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays, daysBetween } from "./time";
import { computeRatings } from "./conduct";
import { CERT_KINDS, GRADE_PASS, moduleNeeds, monthOf, quarterOf, requiredCerts, type CertKind, type ModuleStatus } from "../../shared/program";
import type { RewardKey } from "../../shared/library/rewards";
import type { LibraryIndex } from "../../shared/library/standard";
import { isManagementRole } from "../../shared/domain";
import { CASH_BONUS, CASH_OVER, MIN_SHIFTS, RAMP_DAYS, ROLLING_DAYS, cashBonus } from "../../shared/metrics";
import { blockIn, blockingActions, perfBy, perfLines, rollingFrom, standing, type Standing } from "./perf";

type Member = typeof s.members.$inferSelect;

export type ModuleState = {
  slug: string;
  status: ModuleStatus;
  needs: string[];
  read: boolean;
  quizBest: number | null;
  gradeBest: number | null;
  signedOffAt: number | null;
  signedOffByName: string | null;
};

export type ProgramSummary = {
  modules: ModuleState[];
  total: number;
  done: number;
  ready: number;
  pct: number;
  floorAvg: number | null;
  lastGradeOn: string | null;
};

async function chunked<T>(ids: string[], f: (slice: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 400) out.push(...(await f(ids.slice(i, i + 400))));
  return out;
}

/** Required modules and where each person stands. Managers aren't tracked against modules. */
export async function programFor(lib: LibraryIndex, members: Pick<Member, "id" | "role">[]) {
  const out = new Map<string, ProgramSummary>();
  const ids = members.map((m) => m.id);
  if (!ids.length) return out;
  const [progress, attempts, grades] = await Promise.all([
    chunked(ids, (x) => db.select().from(s.trainingProgress).where(inArray(s.trainingProgress.memberId, x))),
    chunked(ids, (x) =>
      db
        .select({ memberId: s.quizAttempts.memberId, quiz: s.quizAttempts.quiz, score: s.quizAttempts.score })
        .from(s.quizAttempts)
        .where(inArray(s.quizAttempts.memberId, x)),
    ),
    chunked(ids, (x) =>
      db
        .select({ memberId: s.grades.memberId, rubric: s.grades.rubric, average: s.grades.average, businessDate: s.grades.businessDate })
        .from(s.grades)
        .where(inArray(s.grades.memberId, x)),
    ),
  ]);
  for (const m of members) {
    const mods = isManagementRole(m.role) ? [] : lib.modulesFor(m.role);
    const mine = progress.filter((p) => p.memberId === m.id);
    const myQ = attempts.filter((a) => a.memberId === m.id);
    const myG = grades.filter((g) => g.memberId === m.id);
    const states = mods.map((mod): ModuleState => {
      const p = mine.find((x) => x.module === mod.slug);
      const qs = mod.quiz ? myQ.filter((a) => a.quiz === mod.quiz).map((a) => a.score) : [];
      const gs = mod.rubric ? myG.filter((g) => g.rubric === mod.rubric).map((g) => g.average) : [];
      const quizBest = qs.length ? Math.max(...qs) : null;
      const gradeBest = gs.length ? Math.max(...gs) : null;
      const { status, needs } = moduleNeeds(mod, { read: !!p?.readAt, quizBest, gradeBest, signedOff: !!p?.signedOffAt });
      return {
        slug: mod.slug,
        status,
        needs,
        read: !!p?.readAt,
        quizBest,
        gradeBest,
        signedOffAt: p?.signedOffAt?.getTime() ?? null,
        signedOffByName: p?.signedOffByName ?? null,
      };
    });
    const floor = myG.filter((g) => g.rubric === (lib.floorRubric?.slug ?? "floor-service")).sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    const done = states.filter((x) => x.status === "signed_off").length;
    out.set(m.id, {
      modules: states,
      total: states.length,
      done,
      ready: states.filter((x) => x.status === "ready").length,
      pct: states.length ? done / states.length : 1,
      floorAvg: floor.length ? Math.round((floor.slice(0, 3).reduce((a, g) => a + g.average, 0) / Math.min(3, floor.length)) * 100) / 100 : null,
      lastGradeOn: floor[0]?.businessDate ?? null,
    });
  }
  return out;
}

export type CertState = {
  id: string | null;
  kind: CertKind;
  label: string;
  required: boolean;
  status: "ok" | "expiring" | "expired" | "missing";
  issuer: string;
  number: string;
  issuedOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
};

export const CERT_ALERT_DAYS = 30;

export async function certsFor(members: Pick<Member, "id" | "role">[], today: string) {
  const out = new Map<string, CertState[]>();
  const ids = members.map((m) => m.id);
  if (!ids.length) return out;
  const rows = await chunked(ids, (x) => db.select().from(s.certifications).where(inArray(s.certifications.memberId, x)));
  for (const m of members) {
    const req = requiredCerts(m.role);
    const mine = rows.filter((r) => r.memberId === m.id);
    const kinds = [...new Set<CertKind>([...req, ...(mine.map((r) => r.kind) as CertKind[])])].filter((k) => k in CERT_KINDS);
    out.set(
      m.id,
      kinds.map((kind) => {
        const latest = mine
          .filter((r) => r.kind === kind)
          .sort((a, b) => (b.expiresOn ?? "9999").localeCompare(a.expiresOn ?? "9999") || b.issuedOn.localeCompare(a.issuedOn))[0];
        const daysLeft = latest?.expiresOn ? daysBetween(today, latest.expiresOn) : null;
        const status: CertState["status"] = !latest
          ? "missing"
          : daysLeft == null
            ? "ok"
            : daysLeft < 0
              ? "expired"
              : daysLeft <= CERT_ALERT_DAYS
                ? "expiring"
                : "ok";
        return {
          id: latest?.id ?? null,
          kind,
          label: CERT_KINDS[kind],
          required: req.includes(kind),
          status,
          issuer: latest?.issuer ?? "",
          number: latest?.number ?? "",
          issuedOn: latest?.issuedOn ?? null,
          expiresOn: latest?.expiresOn ?? null,
          daysLeft,
        };
      }),
    );
  }
  return out;
}

export type RewardEntry = {
  memberId: string;
  name: string;
  role: string;
  metric: string;
  value: number | null;
  eligible: boolean;
  amount?: number;
  note?: string;
  /** Held back by a written warning, performance plan or termination in the period. */
  blocked?: boolean;
  /** How far along they are, 1 = there. Drives the ring on My rewards. */
  progress?: number | null;
  /** What it takes from here, in one line, written to the person. */
  next?: string;
  /** Place in the store among those not held back, 1 = leading. */
  rank?: number;
  /** For rewards decided on a closed period: how the current period is going. */
  live?: string;
  /** For milestone rewards, the period this person's award is recorded against (e.g. "named-10"). */
  period?: string;
  /** Every criterion for this reward, ticked or not, with this person's figure. */
  checks?: RewardCheck[];
  /** Eligible now, can still earn, or out for this period. */
  status?: RewardStatus;
  /** Why, in one line, leading with the reason: not enough shifts, ramping, conduct, behind, too late. */
  why?: string;
  /** For rewards judged on a closed period (last month): how the month now running stands. */
  upcoming?: { label: string; status: RewardStatus; why?: string; checks: RewardCheck[] };
  /** Internal while building: the period can no longer be won, and why. */
  lost?: string;
};

export type RewardStatus = "eligible" | "can_earn" | "ineligible";
export type RewardCheck = { short: string; label: string; met: boolean; value: string; /** The reason line when this is what is missing. */ miss?: string };

export type RewardBoard = {
  key: RewardKey;
  period: { key: string; label: string };
  /** The roles that can earn it, empty when everyone on the floor can. */
  openTo: string[];
  /** The criteria in order, the same list every person's checks follow. */
  criteria: { short: string; label: string }[];
  /** Last day of the period, or null for a milestone. */
  ends: string | null;
  /** True when the period is over and the board shows who earned it. */
  closed: boolean;
  /** How the period is judged, in one line. */
  basis: string;
  entries: RewardEntry[];
  awarded: { memberId: string; memberName: string; amount: number | null; awardedByName: string; awardedAt: number; note: string }[];
};

const SELLERS = ["server", "sommelier", "bartender"];
const fmt = (n: number | null) => (n == null ? "none" : `$${n.toFixed(2)}`);
const pctOf = (p: { pct: number | null }) => (p.pct == null ? "" : ` (${Math.round(p.pct * 100)}%)`);
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Who is eligible, or leading, for each reward at one store. Only solo serving shifts count, each against its own target. */
export async function rewardsBoard(lib: LibraryIndex, store: typeof s.stores.$inferSelect, today: string): Promise<RewardBoard[]> {
  const members = (
    await db.select().from(s.members).where(and(eq(s.members.storeId, store.id), eq(s.members.status, "active")))
  ).filter((m) => !isManagementRole(m.role));
  const q = quarterOf(today);
  const month = monthOf(today);
  const lastEnd = addDays(month.start, -1);
  const lastMonth = monthOf(lastEnd);
  const year = { key: today.slice(0, 4), label: today.slice(0, 4), start: `${today.slice(0, 4)}-01-01` };
  const lastFrom = rollingFrom(lastEnd);
  const nowFrom = rollingFrom(today);
  const linesFrom = [q.start, lastFrom, lastMonth.start].sort()[0]!;

  const [lines, feedback, grades, program, ratings, awards, somm, blocking] = await Promise.all([
    perfLines([store.id], linesFrom, today),
    db.select().from(s.guestFeedback).where(and(eq(s.guestFeedback.storeId, store.id), gte(s.guestFeedback.receivedOn, q.start < lastMonth.start ? q.start : lastMonth.start))),
    db.select().from(s.grades).where(and(eq(s.grades.storeId, store.id), eq(s.grades.rubric, lib.floorRubric?.slug ?? "floor-service"), gte(s.grades.businessDate, q.start))),
    programFor(lib, members),
    computeRatings([store.id]),
    db.select().from(s.rewardAwards).where(eq(s.rewardAwards.storeId, store.id)),
    db
      .select({ memberId: s.quizAttempts.memberId, score: s.quizAttempts.score })
      .from(s.quizAttempts)
      .where(and(eq(s.quizAttempts.storeId, store.id), eq(s.quizAttempts.quiz, "q-somm-challenge"))),
    blockingActions(members.map((m) => m.id)),
  ]);
  const qPerf = perfBy(lines, q.start, today);
  const lastPerf = perfBy(lines, lastFrom, lastEnd);
  const nowPerf = perfBy(lines, nowFrom, today);
  // The quarter needs the 8 shift minimum for each month it has run so far.
  const qMonths = Number(today.slice(5, 7)) - Number(q.start.slice(5, 7)) + 1;
  const qMin = MIN_SHIFTS * qMonths;

  const quotesIn = (id: string, from: string) => feedback.filter((f) => f.receivedOn >= from && f.memberIds.includes(id)).length;
  const sellers = members.filter((m) => SELLERS.includes(m.role));
  const allSigned = (id: string) => {
    const p = program.get(id);
    return !!p && p.total > 0 && p.done === p.total;
  };
  const blockOf = (m: (typeof members)[number], from: string, to: string) => blockIn(blocking.get(m.id) ?? [], m.conductResetOn, from, to);
  /** Apply the conduct block: nobody blocked is eligible, whatever the numbers say. */
  const gate = (m: (typeof members)[number], e: RewardEntry, from: string, to: string): RewardEntry => {
    const b = blockOf(m, from, to);
    return b ? { ...e, eligible: false, amount: 0, blocked: true, note: b.reason } : e;
  };
  const shiftsNote = (st: Standing, min: number) => (st.shifts >= min ? undefined : `${st.shifts} of ${min} solo shifts so far`);
  /**
   * How far along someone really is: the lower of their shifts against what the reward needs and their
   * spend per ticket against the bar. A strong first week is a strong first week, not 98% of a quarter.
   */
  const along = (st: Standing, shiftsNeeded: number, bar = 1) => {
    if (!st.shifts || st.pct == null) return 0;
    return Math.max(0, Math.min(1, st.shifts / shiftsNeeded, st.pct / bar));
  };
  /** Inside the first 30 days on the date given: shown, never ranked against people with a full month on the floor. */
  const rampingOn = (m: (typeof members)[number], date: string) => daysBetween(m.hireDate, date) < RAMP_DAYS;
  const rampNote = (m: (typeof members)[number]) => `Ramping: ranks from ${short(addDays(m.hireDate, RAMP_DAYS))}, after a full month on the floor`;
  /** The whole quarter's shift minimum, so progress builds through the quarter instead of starting near full. */
  const qFull = MIN_SHIFTS * 3;
  const lmName = lastMonth.label.split(" ")[0];
  const thisName = month.label.split(" ")[0]!;
  const monthEnd = addDays(monthOf(addDays(month.start, 32)).start, -1);
  const qEnd = addDays(quarterOf(addDays(q.start, 95)).start, -1);
  const yearEnd = `${year.key}-12-31`;
  /** Days still to work in a period, today included. */
  const daysLeft = (end: string) => Math.max(0, daysBetween(today, end) + 1);
  const winFrom = rollingFrom(monthEnd);
  const winPerf = perfBy(lines, winFrom, today);
  const pc = (x: number | null | undefined) => (x == null ? "none" : `${Math.round(x * 100)}%`);
  const ck = (short: string, label: string, met: boolean, value: string, miss?: string): RewardCheck => ({ short, label, met, value, ...(met || !miss ? {} : { miss }) });
  const shiftsCk = (have: number, need: number, by: string) => ck("Shifts", `${need} solo shifts ${by}`, have >= need, have >= need ? String(have) : `${have} of ${need}`);
  const targetCk = (st: Standing, bar = 1, span = "on solo shifts") =>
    ck(
      bar > 1 ? `${Math.round(bar * 100)}%` : "Target",
      `${bar > 1 ? `${Math.round((bar - 1) * 100)}% over` : "At or above"} their own spend per ticket target ${span}`,
      st.pct != null && st.pct >= bar - 1e-9,
      pc(st.pct),
    );
  const rampCk = (m: (typeof members)[number], on: string) =>
    ck("Full month", "A full month on the floor", !rampingOn(m, on), rampingOn(m, on) ? `from ${short(addDays(m.hireDate, RAMP_DAYS))}` : "yes");
  /** Out of reach for the period on shifts alone: what is left of it can't cover what is still needed. */
  const shiftsLost = (have: number, need: number, end: string, label: string) => {
    const left = daysLeft(end);
    return need - have > left ? `Too late for ${label}: ${need - have} more solo shifts needed and only ${left} day${left === 1 ? "" : "s"} left` : undefined;
  };
  /** The first thing missing, shifts and ramping first: they rule a period out before any figure does. */
  const firstMiss = (c: RewardCheck[]) => c.find((x) => !x.met && (x.short === "Shifts" || x.short === "Full month")) ?? c.find((x) => !x.met);
  const missWhy = (c: RewardCheck | undefined, closed = false) =>
    !c
      ? undefined
      : c.miss
        ? c.miss
        : c.short === "Shifts"
        ? `Not enough shifts${closed ? "" : " yet"}: ${c.value} solo shifts`
        : c.short === "Full month"
          ? `Ramping: ranks ${c.value}, after a full month on the floor`
          : c.short === "Target" || c.short.endsWith("%")
            ? `Behind: ${c.value} of target, needs ${c.short === "Target" ? "100%" : c.short}`
            : `Still needed: ${c.label} (${c.value})`;

  /**
   * Turn checks into a status once every eligibility flag is set. Conduct always comes last and always wins;
   * on a closed period anything short of eligible is out, on an open one it can still be earned unless lost.
   */
  const settle = (entries: RewardEntry[], span: string, closed = false) => {
    for (const e of entries) {
      e.checks = [...(e.checks ?? []), ck("Conduct", `No written warning, plan or termination ${span}`, !e.blocked, e.blocked ? "held back" : "clear")];
      if (e.blocked) {
        e.status = "ineligible";
        e.why = `Conduct: ${e.note ?? "held back for this period"}`;
      } else if (e.eligible) {
        e.status = "eligible";
        e.why = undefined;
      } else if (e.lost) {
        e.status = "ineligible";
        e.why = e.lost;
      } else {
        e.status = closed ? "ineligible" : "can_earn";
        e.why = e.why ?? missWhy(firstMiss(e.checks), closed);
      }
      delete e.lost;
    }
    return entries;
  };
  /** This month, for rewards paid on last month. */
  const upcomingFor = (m: (typeof members)[number], checks: RewardCheck[], lost: string | undefined): RewardEntry["upcoming"] => {
    const b = blockOf(m, month.start, today);
    const all = [...checks, ck("Conduct", `No written warning, plan or termination in ${thisName}`, !b, b ? "held back" : "clear")];
    const miss = firstMiss(all);
    if (b) return { label: thisName, status: "ineligible", why: `Conduct: ${b.reason}`, checks: all };
    if (lost) return { label: thisName, status: "ineligible", why: lost, checks: all };
    return { label: thisName, status: miss ? "can_earn" : "eligible", why: missWhy(miss), checks: all };
  };

  const board = (
    key: RewardKey,
    period: { key: string; label: string },
    basis: string,
    entries: RewardEntry[],
    o: { openTo: string[]; ends: string | null; closed?: boolean },
  ): RewardBoard => ({
    key,
    period: { key: period.key, label: period.label },
    basis,
    openTo: o.openTo,
    ends: o.ends,
    closed: !!o.closed,
    criteria: (entries[0]?.checks ?? []).map((c) => ({ short: c.short, label: c.label })),
    entries: ranked(entries),
    awarded: awards
      .filter((a) => a.reward === key && a.period === period.key)
      .map((a) => ({ memberId: a.memberId, memberName: a.memberName, amount: a.amount, awardedByName: a.awardedByName, awardedAt: a.awardedAt.getTime(), note: a.note })),
  });
  /** Rank by value among those not held back; ties share a place. */
  const ranked = (e: RewardEntry[]) => {
    const open = e.filter((x) => !x.blocked && x.value != null);
    return e.map((x) => (x.blocked || x.value == null ? x : { ...x, rank: 1 + open.filter((o) => (o.value ?? 0) > (x.value ?? 0)).length }));
  };
  const toGo = (st: Standing) => (st.spt != null && st.target != null && st.spt < st.target ? `$${(st.target - st.spt).toFixed(2)} a ticket more to reach your target` : null);
  const sortDesc = (e: RewardEntry[]) => e.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || (b.value ?? -1) - (a.value ?? -1));
  const vs = (p: Standing) => `${fmt(p.spt)} vs ${fmt(p.target)}${pctOf(p)} · ${p.shifts} solo shift${p.shifts === 1 ? "" : "s"}`;
  const qWord = `in ${q.label}`;

  const dayOff = sortDesc(
    sellers.map((m) => {
      const st = standing(qPerf.get(m.id), qMin);
      const next = st.atTarget
        ? `On target so far. ${Math.max(0, qFull - st.shifts)} more solo shifts at target to finish the quarter.`
        : (toGo(st) ?? `${Math.max(0, qMin - st.shifts)} more solo shifts to count`);
      const e: RewardEntry = {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: st.pct,
        metric: vs(st),
        eligible: st.atTarget,
        note: shiftsNote(st, qMin),
        progress: along(st, qFull),
        next,
        checks: [
          targetCk(st, 1, `on solo shifts ${qWord}`),
          ck("Shifts", `${MIN_SHIFTS} solo shifts each month: ${qMin} by the end of ${thisName}, ${qFull} by ${short(qEnd)}`, st.shifts >= qMin, st.shifts >= qMin ? String(st.shifts) : `${st.shifts} of ${qMin}`),
        ],
        lost: shiftsLost(st.shifts, qFull, qEnd, q.label),
      };
      return gate(m, e, q.start, today);
    }),
  );

  const quotes = sortDesc(
    members.map((m) => {
      const n = quotesIn(m.id, month.start);
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: n,
          metric: `${n} guest quote${n === 1 ? "" : "s"} this month`,
          eligible: n > 0,
          progress: n > 0 ? 1 : 0,
          next: n > 0 ? "Your quote can be read aloud at line up." : "Be the name a guest remembers this month.",
          checks: [ck("Named", `Named by a guest in ${thisName}`, n > 0, String(n))],
          why: n > 0 ? undefined : `No guest has named them in ${thisName} yet`,
        },
        month.start,
        today,
      );
    }),
  );

  const payBy = addDays(lastEnd, 30);
  const bar = 1 + CASH_OVER;
  const bonus = sortDesc(
    sellers.map((m) => {
      const st = standing(lastPerf.get(m.id));
      const live = standing(nowPerf.get(m.id));
      const win = standing(winPerf.get(m.id));
      const amount = st.enough && st.spt != null && st.target ? cashBonus(st.spt, st.target) : 0;
      const e: RewardEntry = {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: st.pct,
        metric: `${vs(st)} · last 30 days now ${fmt(live.spt)}${pctOf(live)}`,
        eligible: amount > 0,
        amount,
        note:
          amount > 0
            ? `Pay on the first payday after ${short(lastEnd)}, by ${short(payBy)} at the latest`
            : st.shifts < MIN_SHIFTS
              ? `${lmName}: ${st.shifts} of ${MIN_SHIFTS} solo shifts, so ${lmName} doesn't pay`
              : undefined,
        progress: along(live, MIN_SHIFTS, bar),
        next:
          live.spt != null && live.target != null
            ? live.pct! >= bar
              ? `Over ${Math.round(bar * 100)}% on the last 30 days. Hold it to the end of the month.`
              : `${thisName}: $${(live.target * bar - live.spt).toFixed(2)} a ticket more to reach ${Math.round(bar * 100)}% and $${CASH_BONUS}${live.shifts < MIN_SHIFTS ? `, and ${MIN_SHIFTS - live.shifts} more solo shifts` : ""}`
            : `Work ${MIN_SHIFTS} solo shifts this month to count`,
        live: `Last 30 days: ${fmt(live.spt)}${pctOf(live)} · ${live.shifts} solo shift${live.shifts === 1 ? "" : "s"}`,
        checks: [targetCk(st, bar, `on the ${ROLLING_DAYS} days to ${short(lastEnd)}`), shiftsCk(st.shifts, MIN_SHIFTS, `in those ${ROLLING_DAYS} days`)],
        upcoming: upcomingFor(
          m,
          [targetCk(live, bar, `on the ${ROLLING_DAYS} days to ${short(monthEnd)} (last 30 days so far)`), shiftsCk(win.shifts, MIN_SHIFTS, `${short(winFrom)} to ${short(monthEnd)}`)],
          shiftsLost(win.shifts, MIN_SHIFTS, monthEnd, thisName),
        ),
      };
      return gate(m, e, lastFrom < lastMonth.start ? lastFrom : lastMonth.start, lastEnd);
    }),
  );

  const floorLeaders = sortDesc(
    sellers
      .filter((m) => m.role !== "bartender")
      .map((m) => {
        const st = standing(lastPerf.get(m.id));
        const win = standing(winPerf.get(m.id));
        const live = standing(nowPerf.get(m.id));
        const ramp = rampingOn(m, lastEnd);
        const rampNow = rampingOn(m, monthEnd);
        return gate(
          m,
          {
            memberId: m.id,
            name: m.name,
            role: m.role,
            value: st.enough && !ramp ? st.pct : null,
            metric: vs(st),
            eligible: false,
            note: ramp ? rampNote(m) : st.shifts < MIN_SHIFTS ? `${lmName}: ${st.shifts} of ${MIN_SHIFTS} solo shifts` : undefined,
            progress: ramp ? 0 : along(st, MIN_SHIFTS),
            next: "Highest share of their own target wins, at target or better.",
            checks: [targetCk(st, 1, `in the ${ROLLING_DAYS} days to ${short(lastEnd)}`), shiftsCk(st.shifts, MIN_SHIFTS, `in those ${ROLLING_DAYS} days`), rampCk(m, lastEnd)],
            lost: ramp ? `Ramping: hired ${short(m.hireDate)}, so ${lmName} doesn't rank` : undefined,
            upcoming: upcomingFor(
              m,
              [targetCk(live, 1, "on the last 30 days"), shiftsCk(win.shifts, MIN_SHIFTS, `${short(winFrom)} to ${short(monthEnd)}`), rampCk(m, monthEnd)],
              rampNow ? `Ramping: ranks from ${short(addDays(m.hireDate, RAMP_DAYS))}, after ${thisName} ends` : shiftsLost(win.shifts, MIN_SHIFTS, monthEnd, thisName),
            ),
          },
          lastFrom < lastMonth.start ? lastFrom : lastMonth.start,
          lastEnd,
        );
      }),
  );
  const fp = floorLeaders.find((e) => !e.blocked && e.value != null && e.value >= 1);
  if (fp) fp.eligible = true;
  for (const e of floorLeaders) {
    e.checks!.push(ck("Highest", "Highest share of their own target in the store", !!e.eligible, e.eligible ? "yes" : fp ? `${fp.name.split(" ")[0]} ${pc(fp.value)}` : "nobody at target"));
    if (!e.eligible && fp && !e.lost && !e.blocked && e.value != null && e.value >= 1) e.why = `Behind: ${fp.name} had the higher share (${pc(fp.value)} to ${pc(e.value)})`;
  }

  const chef = sortDesc(
    sellers.map((m) => {
      const gs = grades.filter((g) => g.memberId === m.id);
      const v = gs.length ? Math.round((gs.reduce((a, g) => a + g.average, 0) / gs.length) * 100) / 100 : null;
      const signed = allSigned(m.id);
      const pr = program.get(m.id);
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: v,
          metric: `${v == null ? "No floor grades" : `${v.toFixed(2)} stars`} · ${signed ? "all modules signed off" : `${pr?.done ?? 0}/${pr?.total ?? 0} modules`}`,
          eligible: false,
          note: signed ? undefined : "Needs every required module signed off",
          // The lower of the grade against 4.5 stars and the share of required modules signed off.
          progress: v == null ? 0 : Math.min(1, v / 4.5, signed ? 1 : (pr?.done ?? 0) / Math.max(1, pr?.total ?? 1)),
          next: !signed ? "Get every required module signed off" : v == null ? "Ask for a floor grade this quarter" : v >= 4.5 ? "4.5 stars or better. The highest average wins." : `${(4.5 - v).toFixed(2)} stars to reach 4.5`,
          checks: [
            ck("Modules", "Every required module signed off", signed, `${pr?.done ?? 0} of ${pr?.total ?? 0}`, `Modules: ${pr?.done ?? 0} of ${pr?.total ?? 0} signed off`),
            ck(
              "4.5 stars",
              `Floor grade average of 4.5 stars or better ${qWord}`,
              v != null && v >= 4.5,
              v == null ? "no grades" : v.toFixed(2),
              v == null ? `No floor grade yet ${qWord}` : `Behind: ${v.toFixed(2)} stars, needs 4.5`,
            ),
          ],
        },
        q.start,
        today,
      );
    }),
  );
  const chefTop = chef.find((e) => !e.blocked && e.value != null && e.value >= 4.5 && allSigned(e.memberId));
  if (chefTop) chefTop.eligible = true;
  for (const e of chef)
    e.checks!.push(
      ck(
        "Highest",
        "Highest floor grade average in the store",
        !!e.eligible,
        e.eligible ? "yes" : chefTop ? `${chefTop.name.split(" ")[0]} ${chefTop.value?.toFixed(2)}` : "nobody yet",
        chefTop ? `Behind: ${chefTop.name} leads at ${chefTop.value?.toFixed(2)} stars` : undefined,
      ),
    );

  const cert = sortDesc(
    sellers.map((m) => {
      const p = program.get(m.id);
      const tenure = daysBetween(m.hireDate, today);
      const passed = somm.some((x) => x.memberId === m.id && x.score >= 0.8);
      const signed = allSigned(m.id);
      const sixOn = addDays(m.hireDate, 180);
      const missing = [!signed && "modules", !passed && "Sommelier's Table quiz", tenure < 180 && "six months"].filter(Boolean) as string[];
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: (p?.pct ?? 0) * 100 + (passed ? 10 : 0),
          metric: `${p?.done ?? 0}/${p?.total ?? 0} modules · ${passed ? "quiz passed" : "quiz not passed"} · ${Math.floor(tenure / 30)} mo`,
          eligible: missing.length === 0,
          note: missing.length ? `Still needs: ${missing.join(", ")}` : undefined,
          progress: (p?.pct ?? 0) * 0.6 + (passed ? 0.2 : 0) + Math.min(1, tenure / 180) * 0.2,
          next: missing.length ? `Still to do: ${missing.join(", ")}` : "Everything done. Your manager books the course.",
          checks: [
            ck("Modules", "Every required module signed off", signed, `${p?.done ?? 0} of ${p?.total ?? 0}`, `Modules: ${p?.done ?? 0} of ${p?.total ?? 0} signed off`),
            ck("Quiz", "Sommelier's Table quiz passed (80% or better)", passed, passed ? "passed" : "not yet", "Sommelier's Table quiz not passed yet"),
            ck("6 months", "Six months on the team", tenure >= 180, tenure >= 180 ? `${Math.floor(tenure / 30)} months` : `on ${short(sixOn)}`, `Six months on the team comes on ${short(sixOn)}`),
          ],
          lost: sixOn > yearEnd ? `Too late for ${year.label}: six months on the team comes on ${short(sixOn)}, after the year ends` : undefined,
        },
        year.start,
        today,
      );
    }),
  );

  const peer = sortDesc(
    sellers.map((m) => {
      const st = standing(qPerf.get(m.id), qMin);
      const strikes = ratings.get(m.id)?.strikes ?? 0;
      const qq = quotesIn(m.id, q.start);
      const ok = st.atTarget && strikes === 0 && qq > 0;
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: ok ? 100 + (st.pct ?? 0) : (st.pct ?? 0) / 10,
          metric: `${fmt(st.spt)}${pctOf(st)} · ${strikes} strike${strikes === 1 ? "" : "s"} · ${qq} quote${qq === 1 ? "" : "s"}`,
          eligible: ok,
          note: shiftsNote(st, qMin),
          progress: along(st, qFull) * (strikes === 0 ? 1 : 0.8) * (qq > 0 ? 1 : 0.85),
          next: ok
            ? "All three in hand: target, no strikes and a guest naming you."
            : [toGo(st), strikes ? "no strikes in the last 90 days" : null, qq ? null : "a guest naming you"].filter(Boolean).join(" · ") || "Hold your target to the end of the quarter",
          checks: [
            targetCk(st, 1, `on solo shifts ${qWord}`),
            ck("Shifts", `${MIN_SHIFTS} solo shifts each month: ${qMin} by the end of ${thisName}`, st.shifts >= qMin, st.shifts >= qMin ? String(st.shifts) : `${st.shifts} of ${qMin}`),
            ck("No strikes", "No strikes in the last 90 days", strikes === 0, String(strikes), `${strikes} strike${strikes === 1 ? "" : "s"} in the last 90 days`),
            ck("Named", `Named by a guest ${qWord}`, qq > 0, String(qq), `No guest has named them ${qWord} yet`),
          ],
          lost: shiftsLost(st.shifts, qFull, qEnd, q.label),
        },
        q.start,
        today,
      );
    }),
  );

  const top = sortDesc(
    members.map((m) => {
      const r = ratings.get(m.id)?.overall ?? null;
      const ramp = rampingOn(m, today);
      const rampEnd = addDays(m.hireDate, RAMP_DAYS);
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: ramp ? null : r,
          metric: r == null ? "No rating yet" : `Rating ${r}`,
          eligible: false,
          note: ramp ? rampNote(m) : undefined,
          checks: [rampCk(m, today)],
          lost: rampEnd > yearEnd ? `Ramping: ranks from ${short(rampEnd)}, after ${year.label} ends` : undefined,
        },
        year.start,
        today,
      );
    }),
  );
  const tp = top.find((e) => !e.blocked && e.value != null);
  if (tp) tp.eligible = true;
  const topRating = tp?.value ?? null;
  for (const e of top) {
    e.progress = e.value == null || !topRating ? 0 : e.value / topRating;
    e.checks!.push(ck("Highest", `Highest overall rating in the store in ${year.label}`, !!e.eligible, e.value == null ? "no rating" : String(e.value), e.value == null ? "No rating yet: it starts with the first shifts" : undefined));
    e.next = e.eligible
      ? "Highest overall rating in the store so far this year."
      : e.note?.startsWith("Ramping")
        ? "Your rating joins the ranking after your first month."
        : e.value == null
          ? "Your rating starts with your first shifts."
          : `${(topRating! - e.value).toFixed(1)} points behind the leader`;
    if (!e.eligible && e.value != null && topRating != null && tp) e.why = `Behind: ${(topRating - e.value).toFixed(1)} points behind ${tp.name}`;
  }

  // Guest surveys: every review or survey a colleague is tagged in.
  const surveysIn = (id: string, from: string) => feedback.filter((f) => f.receivedOn >= from && f.memberIds.includes(id));
  const surveyCounts = members.map((m) => surveysIn(m.id, month.start).length);
  const mostN = Math.max(0, ...surveyCounts);
  const surveys = sortDesc(
    members.map((m, i) => {
      const n = surveyCounts[i]!;
      const lead = n > 0 && n === mostN;
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: n,
          metric: `${n} survey${n === 1 ? "" : "s"} this month`,
          eligible: false,
          progress: mostN ? n / mostN : 0,
          next: lead ? "Most in the store this month. Ties share it." : mostN ? `${mostN - n} more to share the lead, ${mostN - n + 1} to take it outright` : "First guest survey of the month takes the lead",
        },
        month.start,
        today,
      );
    }),
  );
  const surveyTop = Math.max(0, ...surveys.filter((e) => !e.blocked).map((e) => e.value ?? 0));
  for (const e of surveys) {
    if (!e.blocked && surveyTop > 0 && e.value === surveyTop) e.eligible = true;
    e.checks = [ck("Most", `Most guest reviews and surveys naming them in ${thisName} (ties share it)`, !!e.eligible, `${e.value ?? 0}, top is ${surveyTop}`)];
    if (!e.eligible) e.why = surveyTop ? `Behind: ${surveyTop - (e.value ?? 0)} fewer than the leader, ${daysLeft(monthEnd)} days left` : `Nobody has one yet in ${thisName}`;
  }

  const dayPay = 8 * (store.trainingRate ?? 15);
  const marked = (id: string) => feedback.filter((f) => f.receivedOn >= q.start && f.aboveBeyond && f.memberIds.includes(id));
  const abN = members.map((m) => marked(m.id).length);
  const abTop = Math.max(0, ...abN);
  const above = sortDesc(
    members.map((m, i) => {
      const n = abN[i]!;
      const stars = surveysIn(m.id, q.start).filter((f) => f.rating != null);
      const avg = stars.length ? stars.reduce((a, f) => a + f.rating!, 0) / stars.length : 0;
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: n ? n + avg / 10 : 0,
          metric: `${n} above and beyond review${n === 1 ? "" : "s"} this quarter${stars.length ? ` · ${avg.toFixed(1)} stars` : ""}`,
          eligible: false,
          amount: 500 + dayPay,
          progress: abTop ? n / abTop : 0,
          next: n ? (n === abTop ? "Leading the quarter. The most marked reviews wins." : `${abTop - n} behind the leader`) : "A guest describing you going above and beyond, marked by a manager",
          checks: [ck("Marked", `A review marked above and beyond by a manager ${qWord}`, n > 0, String(n), `No review marked above and beyond yet ${qWord}`)],
        },
        q.start,
        today,
      );
    }),
  );
  const abLead = above.find((e) => !e.blocked && (e.value ?? 0) >= 1);
  if (abLead) abLead.eligible = true;
  for (const e of above) {
    if (!e.eligible) e.amount = 0;
    const n = Math.floor(e.value ?? 0);
    e.checks!.push(ck("Most", "The most marked reviews in the store this quarter", !!e.eligible, abLead ? `${n}, top is ${Math.floor(abLead.value ?? 0)}` : "nobody yet"));
    if (!e.eligible && n > 0 && abLead) e.why = `Behind: ${Math.floor(abLead.value ?? 0) - n} fewer than ${abLead.name}`;
  }

  // Every 10 reviews where the guest used their name. All time, at this store. The name has to be in the guest's
  // words (found by the platform), so a review a manager tagged by hand without the name in it doesn't count.
  const allFeedback = await db
    .select({ memberIds: s.guestFeedback.memberIds, matches: s.guestFeedback.matches, quote: s.guestFeedback.quote })
    .from(s.guestFeedback)
    .where(eq(s.guestFeedback.storeId, store.id));
  const namedBy = (m: (typeof members)[number]) => {
    const first = m.name.split(" ")[0]!.toLowerCase();
    const word = new RegExp(`\\b${first.replace(/[^a-z]/g, "")}\\b`, "i");
    return allFeedback.filter((f) => f.memberIds.includes(m.id) && (f.matches.some((x) => x.memberId === m.id) || word.test(f.quote))).length;
  };
  const named = sortDesc(
    members.map((m) => {
      const n = namedBy(m);
      const reached = Math.floor(n / 10) * 10;
      const period = `named-${Math.max(10, reached)}`;
      const toNext = 10 - (n % 10);
      const has = awards.some((a) => a.reward === "named_ten" && a.memberId === m.id && a.period === period);
      const due = reached >= 10 && !has;
      return gate(
        m,
        {
          memberId: m.id,
          name: m.name,
          role: m.role,
          value: n,
          metric: `${n} review${n === 1 ? "" : "s"} naming them${reached >= 10 ? ` · ${reached / 10} reward${reached === 10 ? "" : "s"} reached` : ""}`,
          // Stays listed once awarded, so the board shows it as given until the next ten.
          eligible: reached >= 10,
          period,
          progress: due ? 1 : (n % 10) / 10,
          next: due ? `${reached} guests have used your name. Pick your prize: a Friday or Saturday section, a shift with no side work, or $50 to spend here.` : `${toNext} more guest${toNext === 1 ? "" : "s"} using your name to reach ${reached + 10}`,
          checks: [ck("Named", "Ten guests using their name in a review or survey (the count never resets)", reached >= 10, due || reached === 0 ? String(n) : `${n}, next at ${reached + 10}`)],
          why: due ? undefined : `${toNext} more guest${toNext === 1 ? "" : "s"} using their name to reach ${reached + 10}`,
        },
        // Conduct holds a milestone back while it is active, never wipes the count.
        addDays(today, -30),
        today,
      );
    }),
  );

  settle(dayOff, qWord);
  settle(quotes, `in ${thisName}`);
  settle(bonus, `in ${lmName}`, true);
  settle(floorLeaders, `in ${lmName}`, true);
  settle(chef, qWord);
  settle(cert, `in ${year.label}`);
  settle(peer, qWord);
  settle(top, `in ${year.label}`);
  settle(surveys, `in ${thisName}`);
  settle(above, qWord);
  settle(named, "in the last 30 days");

  const quarterBasis = `Solo serving shifts ${short(q.start)} to today, at least ${MIN_SHIFTS} a month (${qMin} so far).`;
  const lastBasis = `The ${ROLLING_DAYS} days ${short(lastFrom)} to ${short(lastEnd)}, at least ${MIN_SHIFTS} solo serving shifts.`;
  const sellOnly = { openTo: SELLERS };
  const everyone = { openTo: [] as string[] };
  const boards: Record<RewardKey, RewardBoard> = {
    day_off: board("day_off", q, quarterBasis, dayOff, { ...sellOnly, ends: qEnd }),
    guest_quote: board("guest_quote", month, "Guest reviews and comment cards this month.", quotes, { ...everyone, ends: monthEnd }),
    ads_bonus: board("ads_bonus", lastMonth, `${lastBasis} ${Math.round(CASH_OVER * 100)}% over target pays $${CASH_BONUS}.`, bonus, { ...sellOnly, ends: lastEnd, closed: true }),
    first_pick: board("first_pick", lastMonth, `${lastBasis} Highest share of their own target, at target or better.`, floorLeaders, {
      openTo: ["server", "sommelier"],
      ends: lastEnd,
      closed: true,
    }),
    chefs_table: board("chefs_table", q, "Floor grades this quarter.", chef, { ...sellOnly, ends: qEnd }),
    certification: board("certification", year, "Modules, the Sommelier's Table quiz and tenure.", cert, { ...sellOnly, ends: yearEnd }),
    peer_dinner: board("peer_dinner", q, quarterBasis, peer, { ...sellOnly, ends: qEnd }),
    winery_visit: board("winery_visit", year, "Overall rating this year.", top, { ...everyone, ends: yearEnd }),
    most_surveys: board("most_surveys", month, "Guest reviews and surveys tagged to each colleague this month.", surveys, { ...everyone, ends: monthEnd }),
    above_beyond: board(
      "above_beyond",
      q,
      `Reviews a manager marked above and beyond this quarter. $500 cash plus a paid day off: 8 hours × $${(store.trainingRate ?? 15).toFixed(2)} training rate = $${dayPay.toFixed(0)}.`,
      above,
      { ...everyone, ends: qEnd },
    ),
    named_ten: {
      ...board("named_ten", { key: "milestone", label: "All time" }, "Reviews and surveys where the guest used their name, all time at this store.", named, { ...everyone, ends: null }),
      awarded: awards
        .filter((a) => a.reward === "named_ten" && named.some((e) => e.memberId === a.memberId && e.period === a.period))
        .map((a) => ({ memberId: a.memberId, memberName: a.memberName, amount: a.amount, awardedByName: a.awardedByName, awardedAt: a.awardedAt.getTime(), note: a.note })),
    },
  };
  return lib.lib.rewards.map((r) => boards[r.key]).filter(Boolean);
}
export { GRADE_PASS };
