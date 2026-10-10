import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { rewardsBoard } from "../lib/program";
import { TZ, viewerName } from "../lib/program-access";
import { surveyStats } from "../lib/surveys";
import { addDays } from "../lib/time";
import { gte } from "drizzle-orm";
import { REWARD_KEYS } from "../../shared/library/rewards";
import { loadLibrary } from "../lib/library";
import { perfLines, rollingFrom } from "../lib/perf";
import { quarterOf } from "../../shared/program";
import { RAMP_DAYS } from "../../shared/metrics";
import { rolesList } from "../../shared/domain";

export const rewards = {
  /** The eight incentives, with who is eligible or leading for each this period. */
  board: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const store = await loadStore(v, input.storeId);
    const today = businessDate(store.timezone);
    const boards = await rewardsBoard(await loadLibrary(v.orgId), store, today);
    const history = await db
      .select()
      .from(s.rewardAwards)
      .where(eq(s.rewardAwards.storeId, store.id))
      .orderBy(desc(s.rewardAwards.awardedAt))
      .limit(40);
    return {
      store: { id: store.id, name: store.name, ticketTarget: store.ticketTarget },
      today,
      boards,
      history: history.map((h) => ({ ...h, awardedAt: h.awardedAt.getTime() })),
      canAward: v.level !== "staff",
      meId: v.member?.id ?? null,
    };
  }),

  /** One colleague's standing against every reward: awarded, eligible now, can still earn, or out for the period, with why. */
  mine: viewerBase.input(z.object({ memberId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const id = input.memberId ?? v.member?.id;
    if (!id) throw new ORPCError("BAD_REQUEST", { message: "Sign in with your PIN to see your rewards." });
    if (v.level === "staff" && id !== v.member?.id) throw new ORPCError("FORBIDDEN", { message: "You can only see your own rewards." });
    const [m] = await db.select().from(s.members).where(eq(s.members.id, id));
    if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
    const store = await loadStore(v, m.storeId);
    const today = businessDate(store.timezone);
    const lib = await loadLibrary(v.orgId);
    const q = quarterOf(today);
    const since = [m.hireDate, q.start, rollingFrom(today)].sort()[0]!;
    const [boards, awards, feedback, lines] = await Promise.all([
      rewardsBoard(lib, store, today),
      db.select().from(s.rewardAwards).where(eq(s.rewardAwards.memberId, m.id)).orderBy(desc(s.rewardAwards.awardedAt)),
      db
        .select({ memberIds: s.guestFeedback.memberIds, rating: s.guestFeedback.rating, receivedOn: s.guestFeedback.receivedOn })
        .from(s.guestFeedback)
        .where(and(eq(s.guestFeedback.storeId, store.id), gte(s.guestFeedback.receivedOn, addDays(businessDate(TZ), -365)))),
      perfLines([store.id], since, today),
    ]);
    // The shifts behind every number on the page, so nobody wonders where a percentage came from.
    const own = lines.filter((l) => l.memberId === m.id).sort((a, b) => a.date.localeCompare(b.date));
    const solo = own.filter((l) => l.counted);
    const from30 = rollingFrom(today);
    const rampEnds = addDays(m.hireDate, RAMP_DAYS);
    const shifts = {
      logged: own.filter((l) => l.date >= m.hireDate).length,
      solo30: solo.filter((l) => l.date >= from30).length,
      soloQuarter: solo.filter((l) => l.date >= q.start).length,
      quarterLabel: q.label,
      notCounted: own.filter((l) => !l.counted && l.date >= m.hireDate).length,
      firstSolo: solo[0]?.date ?? null,
      last: own[own.length - 1]?.date ?? null,
      rampingUntil: today < rampEnds ? rampEnds : null,
    };
    const mine = boards.map((b) => {
      const e = b.entries.find((x) => x.memberId === m.id) ?? null;
      const awarded = b.awarded.find((a) => a.memberId === m.id) ?? null;
      const leaders = b.entries.filter((x) => x.eligible).map((x) => x.name);
      // Awarded beats everything; a closed period that paid shows as eligible until it is given; otherwise the
      // period still running decides (this month, for the rewards paid on last month).
      const state: "awarded" | "eligible" | "can_earn" | "ineligible" | "not_open" = awarded
        ? "awarded"
        : !e
          ? "not_open"
          : e.status === "eligible"
            ? "eligible"
            : (e.upcoming?.status ?? e.status ?? "can_earn");
      const why = !e
        ? `Not your role: open to ${rolesList(b.openTo)}`
        : state === "eligible" || state === "awarded"
          ? e.why
          : e.upcoming && e.status !== "eligible"
            ? e.upcoming.why
            : e.why;
      return { key: b.key, period: b.period, basis: b.basis, ends: b.ends, closed: b.closed, openTo: b.openTo, criteria: b.criteria, entry: e, awarded, state, why, leaders: leaders.filter((n) => n !== m.name).slice(0, 3) };
    });
    const year = today.slice(0, 4);
    return {
      member: { id: m.id, name: m.name, role: m.role, hireDate: m.hireDate },
      isSelf: v.member?.id === m.id,
      store: { id: store.id, name: store.name, trainingRate: store.trainingRate },
      today,
      boards: mine,
      surveys: surveyStats(feedback, m.id, today),
      shifts,
      awards: awards.map((a) => ({ id: a.id, reward: a.reward, period: a.period, amount: a.amount, note: a.note, awardedByName: a.awardedByName, awardedAt: a.awardedAt.getTime() })),
      earnedThisYear: awards.filter((a) => a.awardedAt.toISOString().startsWith(year)).reduce((t, a) => t + (a.amount ?? 0), 0),
    };
  }),

  award: managerBase
    .input(
      z.object({
        storeId: z.string(),
        memberId: z.string(),
        reward: z.enum(REWARD_KEYS),
        period: z.string().min(4).max(20),
        amount: z.number().min(0).max(10000).nullish(),
        note: z.string().max(500).default(""),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const [m] = await db.select().from(s.members).where(and(eq(s.members.id, input.memberId), eq(s.members.storeId, store.id)));
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
      try {
        await db.insert(s.rewardAwards).values({
          orgId: store.orgId,
          storeId: store.id,
          memberId: m.id,
          memberName: m.name,
          reward: input.reward,
          period: input.period,
          amount: input.amount ?? null,
          note: input.note,
          awardedByName: viewerName(v).name,
          awardedAt: new Date(),
        });
      } catch {
        throw new ORPCError("CONFLICT", { message: `${m.name} has already been awarded this for the period.` });
      }
      return { ok: true };
    }),

  revoke: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(s.rewardAwards).where(eq(s.rewardAwards.id, input.id));
    if (!a) throw new ORPCError("NOT_FOUND");
    await loadStore(context.viewer, a.storeId);
    await db.delete(s.rewardAwards).where(eq(s.rewardAwards.id, a.id));
    return { ok: true };
  }),
};
