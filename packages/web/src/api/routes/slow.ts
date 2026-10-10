import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, managerBase, viewerBase } from "../lib/access";
import { addDays, businessDate } from "../lib/time";
import { viewerName } from "../lib/program-access";
import { isManagementRole } from "../../shared/domain";
import { COVERS_PER_BARTENDER, COVERS_PER_SERVER, SHIFT_HOURS, SLOW_ACTIONS, SLOW_ACTION_KEYS } from "../../shared/slow";
import { lineTarget, perfLines, perfOf } from "../lib/perf";

const SELL = new Set(["server", "sommelier", "bartender"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

function weekStart(date: string) {
  const dow = new Date(date + "T12:00:00Z").getUTCDay(); // 0 Sun
  return addDays(date, -((dow + 6) % 7)); // Monday
}

export const slow = {
  /** Everything a manager needs to decide a slow night fairly and profitably. */
  board: managerBase
    .input(z.object({ storeId: z.string(), shift: z.enum(["lunch", "dinner"]).default("dinner"), expectedCovers: z.number().int().min(0).max(2000).nullish() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const today = businessDate(store.timezone);
      const wk = weekStart(today);
      const from28 = addDays(today, -28);

      const members = (await db.select().from(s.members).where(and(eq(s.members.storeId, store.id), eq(s.members.status, "active")))).filter(
        (m) => !isManagementRole(m.role),
      );
      const ids = members.map((m) => m.id);

      // Forecast: same weekday, last four weeks.
      const sameDays = [7, 14, 21, 28].map((n) => addDays(today, -n));
      const past = await db
        .select({ d: s.shiftReports.businessDate, covers: s.shiftReports.covers })
        .from(s.shiftReports)
        .where(and(eq(s.shiftReports.storeId, store.id), inArray(s.shiftReports.businessDate, sameDays)));
      const forecast = past.length ? Math.round(past.reduce((a, r) => a + r.covers, 0) / past.length) : null;
      const expected = input.expectedCovers ?? forecast ?? 0;

      // Hours this week and spend per ticket over 28 days, from shift reports.
      // Every line carries the target for that shift, so a lunch part timer and a dinner closer compare fairly.
      const lines = ids.length ? (await perfLines([store.id], from28, today)).map((l) => ({ ...l, d: l.date })) : [];
      const goals = ids.length ? await db.select().from(s.hourGoals).where(inArray(s.hourGoals.memberId, ids)) : [];
      const actions = await db
        .select()
        .from(s.slowNightActions)
        .where(and(eq(s.slowNightActions.storeId, store.id), gte(s.slowNightActions.businessDate, from28)))
        .orderBy(desc(s.slowNightActions.createdAt));

      // Tonight's floor: the line up if one is started, otherwise the selling roster.
      const [lineup] = await db
        .select()
        .from(s.lineups)
        .where(and(eq(s.lineups.storeId, store.id), eq(s.lineups.businessDate, today), eq(s.lineups.shift, input.shift)));
      const entries = lineup ? await db.select().from(s.lineupEntries).where(eq(s.lineupEntries.lineupId, lineup.id)) : [];
      const onIds = new Set(
        lineup ? entries.filter((e) => !["no_show", "swapped_out"].includes(e.arrival)).map((e) => e.memberId) : members.filter((m) => SELL.has(m.role)).map((m) => m.id),
      );

      const tonight = actions.filter((a) => a.businessDate === today && a.shift === input.shift);
      const people = members.map((m) => {
        const mine = lines.filter((l) => l.memberId === m.id);
        const weekShifts = new Set(mine.filter((l) => l.d >= wk && l.d < today).map((l) => l.d)).size;
        // Spend per ticket from solo serving shifts only, against their own mix target; every shift still counts toward hours.
        const perf = perfOf(mine);
        const g = goals.find((x) => x.memberId === m.id);
        const goal = g?.weeklyHours ?? 32;
        const acts = actions.filter((a) => a.memberId === m.id);
        const lost = acts.filter((a) => !SLOW_ACTIONS[a.action].keepsPay).reduce((t, a) => t + a.hours, 0);
        const kept = acts.filter((a) => SLOW_ACTIONS[a.action].keepsPay).reduce((t, a) => t + a.hours, 0);
        const weekLost = acts.filter((a) => a.businessDate >= wk && !SLOW_ACTIONS[a.action].keepsPay).reduce((t, a) => t + a.hours, 0);
        const weekKept = acts.filter((a) => a.businessDate >= wk && a.action === "sister_store").reduce((t, a) => t + a.hours, 0);
        const weekHours = Math.max(0, weekShifts * SHIFT_HOURS - weekLost + weekKept);
        // Hours they'd have by Sunday if they work tonight and the rest of their usual pattern.
        const tenureDays = Math.round((Date.parse(today) - Date.parse(m.hireDate)) / 86400000);
        const decided = tonight.find((a) => a.memberId === m.id) ?? null;
        return {
          id: m.id,
          name: m.name,
          role: m.role,
          tenureDays,
          on: onIds.has(m.id),
          sells: SELL.has(m.role),
          weekHours,
          goal,
          surplus: weekHours + SHIFT_HOURS - goal,
          volunteerEarly: !!g?.volunteerEarly,
          crossStore: !!g?.crossStore,
          spt: perf.spt != null ? round2(perf.spt) : null,
          target: perf.target,
          vs: perf.pct,
          lost28: lost,
          kept28: kept,
          decided: decided ? { id: decided.id, action: decided.action, hours: decided.hours, toStoreName: decided.toStoreName, detail: decided.detail } : null,
        };
      });

      // Who goes first, if someone has to.
      const floor = people.filter((p) => p.on && p.sells && p.role !== "bartender");
      const bar = people.filter((p) => p.on && p.role === "bartender");
      const needServers = Math.max(1, Math.ceil(expected / COVERS_PER_SERVER));
      const needBar = Math.max(1, Math.ceil((expected * 0.14) / COVERS_PER_BARTENDER));
      // Percentage of their own target for everyone on the floor tonight, for the profit side of the decision.
      // Percent, not dollars: someone who mostly works lunch isn't penalised for lunch checks being smaller.
      const avgOf = (list: typeof people) => {
        const k = list.filter((p) => p.vs != null);
        return k.length ? k.reduce((a, p) => a + p.vs!, 0) / k.length : null;
      };
      const order = (list: typeof people) => {
        const avg = avgOf(list);
        const below = (p: (typeof people)[number]) => (avg != null && p.vs != null ? p.vs < avg : p.vs == null);
        return [...list]
          .map((p) => {
            const reasons: string[] = [];
            if (p.volunteerEarly) reasons.push("volunteered to go early");
            if (p.tenureDays < 30) reasons.push("ramping: needs floor time");
            else if (avg != null && p.vs != null)
              reasons.push(`${Math.round(p.vs * 100)}% of own target, ${p.vs < avg ? "below" : "above"} tonight's floor average of ${Math.round(avg * 100)}%`);
            if (p.surplus > 0) reasons.push(`${p.surplus}h over their ${p.goal}h goal if they stay`);
            else reasons.push(`${-p.surplus}h short of their ${p.goal}h goal`);
            if (p.lost28 > 0) reasons.push(`lost ${p.lost28}h to cuts in the last 4 weeks`);
            return { ...p, reasons };
          })
          .sort(
            (a, b) =>
              // Anyone already decided tonight drops to the bottom.
              Number(!!a.decided) - Number(!!b.decided) ||
              // 1. Volunteers first. 2. New hires last: they need the reps.
              Number(b.volunteerEarly) - Number(a.volunteerEarly) ||
              Number(a.tenureDays < 30) - Number(b.tenureDays < 30) ||
              // 3. Profit: below average sellers (against their own target) before above average ones.
              Number(below(b)) - Number(below(a)) ||
              // 4. Fairness within the band: most hours over goal, then fewest hours already lost.
              b.surplus - a.surplus ||
              a.lost28 - b.lost28 ||
              (a.vs ?? 0) - (b.vs ?? 0),
          );
      };
      const floorOrder = order(floor);
      const barOrder = order(bar);
      const extraServers = Math.max(0, floor.filter((p) => !p.decided).length - needServers);
      const extraBar = Math.max(0, bar.filter((p) => !p.decided).length - needBar);

      // Sister stores asking for help tonight.
      const sisters = await db
        .select({ id: s.stores.id, name: s.stores.name })
        .from(s.stores)
        .where(and(eq(s.stores.orgId, store.orgId), ne(s.stores.id, store.id)));
      const calls = sisters.length
        ? await db
            .select()
            .from(s.coverageCalls)
            .where(and(inArray(s.coverageCalls.storeId, sisters.map((x) => x.id)), gte(s.coverageCalls.businessDate, today), lte(s.coverageCalls.businessDate, addDays(today, 6))))
            .orderBy(s.coverageCalls.businessDate)
        : [];
      const myCalls = await db
        .select()
        .from(s.coverageCalls)
        .where(and(eq(s.coverageCalls.storeId, store.id), gte(s.coverageCalls.businessDate, today)))
        .orderBy(s.coverageCalls.businessDate);

      // Fairness ledger, last four weeks.
      const ledger = people
        .filter((p) => p.lost28 || p.kept28)
        .map((p) => ({ id: p.id, name: p.name, role: p.role, lost: p.lost28, kept: p.kept28 }))
        .sort((a, b) => b.lost - a.lost);
      const protectedHours = actions.filter((a) => SLOW_ACTIONS[a.action].keepsPay).reduce((t, a) => t + a.hours, 0);
      const cutHours = actions.filter((a) => !SLOW_ACTIONS[a.action].keepsPay).reduce((t, a) => t + a.hours, 0);

      // What the suggested plan is worth: who stays vs. the whole floor, as a percentage of their own targets,
      // priced at tonight's shift target per ticket.
      const staying = floorOrder.filter((p) => !p.decided).slice(extraServers);
      const keepAvg = avgOf(staying);
      const allAvg = avgOf(floor);
      const tonightTarget = lineTarget(store, null, "server", input.shift);
      const liftPerTicket = keepAvg != null && allAvg != null ? round2(Math.max(0, keepAvg - allAvg) * tonightTarget) : null;

      return {
        store: { id: store.id, name: store.name, ticketTarget: store.ticketTarget },
        today,
        shift: input.shift,
        lineupStarted: !!lineup,
        forecast,
        forecastFrom: sameDays.filter((d) => past.some((p) => p.d === d)),
        expected,
        needServers,
        needBar,
        extraServers,
        extraBar,
        floorOrder,
        barOrder,
        people: people.sort((a, b) => a.name.localeCompare(b.name)),
        calls: calls.map((c) => ({ ...c, storeName: sisters.find((x) => x.id === c.storeId)?.name ?? "", createdAt: c.createdAt.getTime() })),
        myCalls: myCalls.map((c) => ({ ...c, createdAt: c.createdAt.getTime() })),
        tonight: tonight.map((a) => ({ ...a, createdAt: a.createdAt.getTime() })),
        ledger,
        protectedHours,
        cutHours,
        keepAvg,
        keepCount: staying.length,
        allAvg,
        tonightTarget,
        liftPerTicket,
        recent: actions.slice(0, 20).map((a) => ({ ...a, createdAt: a.createdAt.getTime() })),
      };
    }),

  /** Record what happens to one person's shift. */
  decide: managerBase
    .input(
      z.object({
        storeId: z.string(),
        shift: z.enum(["lunch", "dinner"]),
        memberId: z.string(),
        action: z.enum(SLOW_ACTION_KEYS),
        hours: z.number().min(0.5).max(12),
        callId: z.string().nullish(),
        detail: z.string().max(500).default(""),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const today = businessDate(store.timezone);
      const [m] = await db.select().from(s.members).where(and(eq(s.members.id, input.memberId), eq(s.members.storeId, store.id)));
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
      let toStoreId: string | null = null;
      let toStoreName: string | null = null;
      if (input.action === "sister_store") {
        if (!input.callId) throw new ORPCError("BAD_REQUEST", { message: "Pick the sister store shift they're covering." });
        const [c] = await db.select().from(s.coverageCalls).where(eq(s.coverageCalls.id, input.callId));
        if (!c || c.orgId !== store.orgId || c.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "That cover request is no longer open." });
        const [to] = await db.select().from(s.stores).where(eq(s.stores.id, c.storeId));
        toStoreId = c.storeId;
        toStoreName = to?.name ?? null;
        await db.update(s.coverageCalls).set({ status: "filled", filledById: m.id, filledByName: m.name }).where(eq(s.coverageCalls.id, c.id));
      }
      // One decision per person per shift: replace any earlier one.
      const prior = await db
        .select()
        .from(s.slowNightActions)
        .where(and(eq(s.slowNightActions.memberId, m.id), eq(s.slowNightActions.businessDate, today), eq(s.slowNightActions.shift, input.shift)));
      for (const p of prior) await db.delete(s.slowNightActions).where(eq(s.slowNightActions.id, p.id));
      await db.insert(s.slowNightActions).values({
        orgId: store.orgId,
        storeId: store.id,
        businessDate: today,
        shift: input.shift,
        memberId: m.id,
        memberName: m.name,
        action: input.action,
        hours: input.hours,
        toStoreId,
        toStoreName,
        detail: input.detail,
        decidedByName: viewerName(v).name,
      });
      return { ok: true };
    }),

  undo: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(s.slowNightActions).where(eq(s.slowNightActions.id, input.id));
    if (!a) throw new ORPCError("NOT_FOUND");
    await loadStore(context.viewer, a.storeId);
    if (a.action === "sister_store")
      await db
        .update(s.coverageCalls)
        .set({ status: "open", filledById: null, filledByName: null })
        .where(and(eq(s.coverageCalls.filledById, a.memberId), eq(s.coverageCalls.businessDate, a.businessDate)));
    await db.delete(s.slowNightActions).where(eq(s.slowNightActions.id, a.id));
    return { ok: true };
  }),

  /** Ask sister stores for cover. */
  postCall: managerBase
    .input(z.object({ storeId: z.string(), shift: z.enum(["lunch", "dinner"]), role: z.string(), hours: z.number().min(1).max(12), date: z.string().optional(), note: z.string().max(300).default("") }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      await db.insert(s.coverageCalls).values({
        orgId: store.orgId,
        storeId: store.id,
        businessDate: input.date ?? businessDate(store.timezone),
        shift: input.shift,
        role: input.role,
        hours: input.hours,
        note: input.note,
        postedByName: viewerName(v).name,
      });
      return { ok: true };
    }),

  closeCall: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [c] = await db.select().from(s.coverageCalls).where(eq(s.coverageCalls.id, input.id));
    if (!c) throw new ORPCError("NOT_FOUND");
    await loadStore(context.viewer, c.storeId);
    await db.delete(s.coverageCalls).where(eq(s.coverageCalls.id, c.id));
    return { ok: true };
  }),

  /** Staff set their own weekly hours goal and preferences; managers can set anyone's. */
  myGoal: viewerBase.input(z.object({ memberId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const id = input.memberId ?? v.member?.id;
    if (!id) return null;
    if (v.level === "staff" && id !== v.member?.id) throw new ORPCError("FORBIDDEN");
    const [g] = await db.select().from(s.hourGoals).where(eq(s.hourGoals.memberId, id));
    return g ? { weeklyHours: g.weeklyHours, volunteerEarly: g.volunteerEarly, crossStore: g.crossStore } : { weeklyHours: 32, volunteerEarly: false, crossStore: false };
  }),

  setGoal: viewerBase
    .input(z.object({ memberId: z.string().nullish(), weeklyHours: z.number().int().min(0).max(60), volunteerEarly: z.boolean(), crossStore: z.boolean() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const id = input.memberId ?? v.member?.id;
      if (!id) throw new ORPCError("BAD_REQUEST", { message: "Sign in with your PIN to set your hours." });
      if (v.level === "staff" && id !== v.member?.id) throw new ORPCError("FORBIDDEN");
      const [m] = await db.select().from(s.members).where(eq(s.members.id, id));
      if (!m || !v.storeIds.includes(m.storeId)) throw new ORPCError("NOT_FOUND");
      const row = { weeklyHours: input.weeklyHours, volunteerEarly: input.volunteerEarly, crossStore: input.crossStore, updatedAt: new Date() };
      await db
        .insert(s.hourGoals)
        .values({ orgId: m.orgId, storeId: m.storeId, memberId: m.id, ...row })
        .onConflictDoUpdate({ target: s.hourGoals.memberId, set: row });
      return { ok: true };
    }),
};
