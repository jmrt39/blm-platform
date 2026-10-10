// Training, certifications and rewards — computed state shared by several routes.
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays, daysBetween } from "./time";
import { computeRatings } from "./conduct";
import { CERT_KINDS, GRADE_PASS, moduleNeeds, monthOf, quarterOf, requiredCerts, type CertKind, type ModuleStatus } from "../../shared/program";
import { MODULES, modulesFor } from "../../shared/library/modules";
import { REWARDS, type RewardKey } from "../../shared/library/rewards";
import { isManagementRole } from "../../shared/domain";

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
export async function programFor(members: Pick<Member, "id" | "role">[]) {
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
    const mods = isManagementRole(m.role) ? [] : modulesFor(m.role);
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
    const floor = myG.filter((g) => g.rubric === "floor-service").sort((a, b) => b.businessDate.localeCompare(a.businessDate));
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

/** Sales per member per date range, from shift report lines. */
async function salesBy(storeId: string, from: string, to: string) {
  const rows = await db
    .select({ memberId: s.shiftReportLines.memberId, sales: s.shiftReportLines.netSales, covers: s.shiftReportLines.covers, date: s.shiftReports.businessDate })
    .from(s.shiftReportLines)
    .innerJoin(s.shiftReports, eq(s.shiftReports.id, s.shiftReportLines.reportId))
    .where(and(eq(s.shiftReports.storeId, storeId), gte(s.shiftReports.businessDate, from)));
  const m = new Map<string, { sales: number; covers: number; shifts: number }>();
  for (const r of rows) {
    if (!r.memberId || r.date > to) continue;
    const p = m.get(r.memberId) ?? { sales: 0, covers: 0, shifts: 0 };
    p.sales += r.sales;
    p.covers += r.covers;
    p.shifts += 1;
    m.set(r.memberId, p);
  }
  return m;
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
};

export type RewardBoard = {
  key: RewardKey;
  period: { key: string; label: string };
  entries: RewardEntry[];
  awarded: { memberId: string; memberName: string; amount: number | null; awardedByName: string; awardedAt: number; note: string }[];
};

const SELLERS = ["server", "sommelier", "bartender"];
const targetFor = (role: string, target: number) => (role === "bartender" ? Math.round(target * 0.66) : target);
const ads = (p?: { sales: number; covers: number }) => (p && p.covers ? p.sales / p.covers : null);

/** Who is eligible — or leading — for each of the eight rewards at one store. */
export async function rewardsBoard(store: typeof s.stores.$inferSelect, today: string): Promise<RewardBoard[]> {
  const members = (
    await db.select().from(s.members).where(and(eq(s.members.storeId, store.id), eq(s.members.status, "active")))
  ).filter((m) => !isManagementRole(m.role));
  const q = quarterOf(today);
  const month = monthOf(today);
  const lastMonth = monthOf(addDays(month.start, -1));
  const year = { key: today.slice(0, 4), label: today.slice(0, 4), start: `${today.slice(0, 4)}-01-01` };

  const [qSales, lastSales, mtdSales, feedback, grades, program, ratings, awards, somm] = await Promise.all([
    salesBy(store.id, q.start, today),
    salesBy(store.id, lastMonth.start, addDays(month.start, -1)),
    salesBy(store.id, month.start, today),
    db.select().from(s.guestFeedback).where(and(eq(s.guestFeedback.storeId, store.id), gte(s.guestFeedback.receivedOn, q.start < lastMonth.start ? q.start : lastMonth.start))),
    db.select().from(s.grades).where(and(eq(s.grades.storeId, store.id), eq(s.grades.rubric, "floor-service"), gte(s.grades.businessDate, q.start))),
    programFor(members),
    computeRatings([store.id]),
    db.select().from(s.rewardAwards).where(eq(s.rewardAwards.storeId, store.id)),
    db
      .select({ memberId: s.quizAttempts.memberId, score: s.quizAttempts.score })
      .from(s.quizAttempts)
      .where(and(eq(s.quizAttempts.storeId, store.id), eq(s.quizAttempts.quiz, "q-somm-challenge"))),
  ]);
  const quotesIn = (id: string, from: string) => feedback.filter((f) => f.receivedOn >= from && f.memberIds.includes(id)).length;
  const sellers = members.filter((m) => SELLERS.includes(m.role));
  const T = store.ppaTarget;
  const fmt = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
  const allSigned = (id: string) => {
    const p = program.get(id);
    return !!p && p.total > 0 && p.done === p.total;
  };

  const board = (key: RewardKey, period: { key: string; label: string }, entries: RewardEntry[]): RewardBoard => ({
    key,
    period: { key: period.key, label: period.label },
    entries,
    awarded: awards
      .filter((a) => a.reward === key && a.period === period.key)
      .map((a) => ({ memberId: a.memberId, memberName: a.memberName, amount: a.amount, awardedByName: a.awardedByName, awardedAt: a.awardedAt.getTime(), note: a.note })),
  });
  const sortDesc = (e: RewardEntry[]) => e.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  const dayOff = sortDesc(
    sellers.map((m) => {
      const v = ads(qSales.get(m.id));
      const t = targetFor(m.role, T);
      return { memberId: m.id, name: m.name, role: m.role, value: v, metric: `${fmt(v)} vs $${t} target`, eligible: v != null && v >= t };
    }),
  );

  const quotes = sortDesc(
    members
      .map((m) => {
        const n = quotesIn(m.id, month.start);
        return { memberId: m.id, name: m.name, role: m.role, value: n, metric: `${n} guest quote${n === 1 ? "" : "s"} this month`, eligible: n > 0 };
      })
      .filter((e) => e.value > 0),
  );

  const bonus = sortDesc(
    sellers.map((m) => {
      const t = targetFor(m.role, T);
      const v = ads(lastSales.get(m.id));
      const live = ads(mtdSales.get(m.id));
      const amount = v == null ? 0 : v >= t + 10 ? 250 : v >= t + 5 ? 200 : v >= t ? 150 : 0;
      return {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: v,
        metric: `${fmt(v)} in ${lastMonth.label.split(" ")[0]} · ${fmt(live)} so far this month`,
        eligible: amount > 0,
        amount,
      };
    }),
  );

  const floorLeaders = sortDesc(
    sellers
      .filter((m) => m.role !== "bartender")
      .map((m) => {
        const v = ads(lastSales.get(m.id));
        return { memberId: m.id, name: m.name, role: m.role, value: v, metric: `${fmt(v)} spend per guest`, eligible: false };
      }),
  );
  if (floorLeaders[0]?.value != null) floorLeaders[0].eligible = true;

  const chef = sortDesc(
    sellers.map((m) => {
      const gs = grades.filter((g) => g.memberId === m.id);
      const v = gs.length ? Math.round((gs.reduce((a, g) => a + g.average, 0) / gs.length) * 100) / 100 : null;
      const signed = allSigned(m.id);
      return {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: v,
        metric: `${v == null ? "No floor grades" : `${v.toFixed(2)} stars`} · ${signed ? "all modules signed off" : `${program.get(m.id)?.done ?? 0}/${program.get(m.id)?.total ?? 0} modules`}`,
        eligible: false,
        note: signed ? undefined : "Needs every required module signed off",
      };
    }),
  );
  const chefTop = chef.find((e) => e.value != null && e.value >= 4.5 && allSigned(e.memberId));
  if (chefTop) chefTop.eligible = true;

  const cert = sortDesc(
    sellers.map((m) => {
      const p = program.get(m.id);
      const tenure = daysBetween(m.hireDate, today);
      const passed = somm.some((x) => x.memberId === m.id && x.score >= 0.8);
      const signed = allSigned(m.id);
      const missing = [!signed && "modules", !passed && "Sommelier's Table quiz", tenure < 180 && "six months"].filter(Boolean) as string[];
      return {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: (p?.pct ?? 0) * 100 + (passed ? 10 : 0),
        metric: `${p?.done ?? 0}/${p?.total ?? 0} modules · ${passed ? "quiz passed" : "quiz not passed"} · ${Math.floor(tenure / 30)} mo`,
        eligible: missing.length === 0,
        note: missing.length ? `Still needs: ${missing.join(", ")}` : undefined,
      };
    }),
  );

  const peer = sortDesc(
    sellers.map((m) => {
      const t = targetFor(m.role, T);
      const v = ads(qSales.get(m.id));
      const strikes = ratings.get(m.id)?.strikes ?? 0;
      const qq = quotesIn(m.id, q.start);
      const ok = v != null && v >= t && strikes === 0 && qq > 0;
      return {
        memberId: m.id,
        name: m.name,
        role: m.role,
        value: ok ? 100 + (v ?? 0) : (v ?? 0) / 10,
        metric: `${fmt(v)} · ${strikes} strike${strikes === 1 ? "" : "s"} · ${qq} quote${qq === 1 ? "" : "s"}`,
        eligible: ok,
      };
    }),
  );

  const top = sortDesc(
    members.map((m) => {
      const r = ratings.get(m.id)?.overall ?? null;
      return { memberId: m.id, name: m.name, role: m.role, value: r, metric: r == null ? "No rating yet" : `Rating ${r}`, eligible: false };
    }),
  );
  if (top[0]?.value != null) top[0].eligible = true;

  const boards: Record<RewardKey, RewardBoard> = {
    day_off: board("day_off", q, dayOff),
    guest_quote: board("guest_quote", month, quotes),
    ads_bonus: board("ads_bonus", lastMonth, bonus),
    first_pick: board("first_pick", lastMonth, floorLeaders),
    chefs_table: board("chefs_table", q, chef),
    certification: board("certification", year, cert),
    peer_dinner: board("peer_dinner", q, peer),
    winery_visit: board("winery_visit", year, top),
  };
  return REWARDS.map((r) => boards[r.key]);
}

export const LIBRARY_COUNT = MODULES.length;
export { GRADE_PASS };
