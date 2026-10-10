import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, loadStore, managerBase, type Viewer } from "../lib/access";
import { addDays, businessDate } from "../lib/time";
import { currentStep, evaluateLadder, isStrike, memberFrom, windowEvents, windowStart } from "../lib/conduct";
import { isManagementRole } from "../../shared/domain";
import {
  ARRIVALS,
  DEFAULT_CALL,
  SHIFTS,
  UNIFORM_ITEMS,
  infractionsFor,
  minutesBetween,
} from "../../shared/conduct";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const sig = z.string().min(10).max(20000);

async function loadLineup(v: Viewer, id: string) {
  const [l] = await db.select().from(s.lineups).where(eq(s.lineups.id, id));
  if (!l) throw new ORPCError("NOT_FOUND", { message: "Line up not found." });
  assertStore(v, l.storeId);
  return l;
}
async function loadOpenEntry(v: Viewer, entryId: string) {
  const [e] = await db.select().from(s.lineupEntries).where(eq(s.lineupEntries.id, entryId));
  if (!e) throw new ORPCError("NOT_FOUND");
  const l = await loadLineup(v, e.lineupId);
  if (l.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "This line up is already signed." });
  return { e, l };
}

async function rosterOf(storeId: string) {
  const r = await db
    .select({ id: s.members.id, name: s.members.name, initials: s.members.initials, role: s.members.role })
    .from(s.members)
    .where(and(eq(s.members.storeId, storeId), eq(s.members.status, "active")));
  return r.sort((a, b) => a.name.localeCompare(b.name));
}

export const lineups = {
  /** The line-up for a store, date and shift (null until a manager starts it). */
  get: managerBase
    .input(z.object({ storeId: z.string(), shift: z.enum(SHIFTS), date: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const store = await loadStore(context.viewer, input.storeId);
      const date = input.date ?? businessDate(store.timezone);
      const [l] = await db
        .select()
        .from(s.lineups)
        .where(and(eq(s.lineups.storeId, store.id), eq(s.lineups.businessDate, date), eq(s.lineups.shift, input.shift)));
      const entries = l
        ? (await db.select().from(s.lineupEntries).where(eq(s.lineupEntries.lineupId, l.id))).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        : [];
      const roster = await rosterOf(store.id);
      const swaps = await db
        .select()
        .from(s.shiftSwaps)
        .where(and(eq(s.shiftSwaps.storeId, store.id), eq(s.shiftSwaps.businessDate, date), eq(s.shiftSwaps.shift, input.shift)));
      const pending = await db
        .select()
        .from(s.conductEvents)
        .where(and(eq(s.conductEvents.storeId, store.id), eq(s.conductEvents.status, "pending")))
        .orderBy(desc(s.conductEvents.businessDate));
      // Strike counts for everyone at this store, so the manager sees who's close to a step.
      const ids = roster.map((r) => r.id);
      const from = windowStart();
      const ev = await windowEvents(ids, from);
      const resets = ids.length ? await db.select({ id: s.members.id, conductResetOn: s.members.conductResetOn }).from(s.members).where(inArray(s.members.id, ids)) : [];
      const fromOf = new Map(resets.map((r) => [r.id, memberFrom(r, from)]));
      const acts = ids.length ? await db.select().from(s.disciplinaryActions).where(inArray(s.disciplinaryActions.memberId, ids)) : [];
      const standing = Object.fromEntries(
        ids.map((id) => [
          id,
          {
            strikes: ev.filter((e) => e.memberId === id && isStrike(e, fromOf.get(id) ?? from)).length,
            step: currentStep(acts.filter((a) => a.memberId === id), fromOf.get(id) ?? from),
          },
        ]),
      );
      const recent = await db
        .select()
        .from(s.lineups)
        .where(and(eq(s.lineups.storeId, store.id), gte(s.lineups.businessDate, addDays(date, -14))))
        .orderBy(desc(s.lineups.businessDate));
      const events = l ? await db.select().from(s.conductEvents).where(eq(s.conductEvents.lineupId, l.id)) : [];
      // Write-ups this line-up's strikes opened.
      const eventIds = new Set(events.map((e) => e.id));
      const actions = eventIds.size
        ? (
            await db
              .select({ id: s.disciplinaryActions.id, memberName: s.disciplinaryActions.memberName, step: s.disciplinaryActions.step, status: s.disciplinaryActions.status, eventIds: s.disciplinaryActions.eventIds })
              .from(s.disciplinaryActions)
              .where(and(eq(s.disciplinaryActions.storeId, store.id), inArray(s.disciplinaryActions.memberId, [...new Set(events.map((e) => e.memberId))])))
          )
            .filter((a) => a.eventIds.some((id) => eventIds.has(id)))
            .map(({ eventIds: _e, ...a }) => a)
        : [];
      return {
        store: { id: store.id, name: store.name, number: store.number, timezone: store.timezone },
        events,
        actions,
        date,
        isToday: date === businessDate(store.timezone),
        lineup: l ?? null,
        entries,
        roster,
        swaps,
        pending,
        standing,
        recent: recent.map((r) => ({ id: r.id, date: r.businessDate, shift: r.shift, status: r.status, runByName: r.runByName })),
        uniformItems: UNIFORM_ITEMS,
      };
    }),

  start: managerBase
    .input(z.object({ storeId: z.string(), shift: z.enum(SHIFTS), callTime: hhmm.optional(), date: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const date = input.date ?? businessDate(store.timezone);
      const callTime = input.callTime ?? DEFAULT_CALL[input.shift];
      const id = crypto.randomUUID();
      try {
        await db.insert(s.lineups).values({ id, storeId: store.id, businessDate: date, shift: input.shift, callTime });
      } catch {
        throw new ORPCError("CONFLICT", { message: "This line up has already been started." });
      }
      const roster = (await rosterOf(store.id)).filter((r) => !isManagementRole(r.role));
      const swaps = await db
        .select()
        .from(s.shiftSwaps)
        .where(
          and(
            eq(s.shiftSwaps.storeId, store.id),
            eq(s.shiftSwaps.businessDate, date),
            eq(s.shiftSwaps.shift, input.shift),
            eq(s.shiftSwaps.status, "approved"),
          ),
        );
      const rows: (typeof s.lineupEntries.$inferInsert)[] = roster.map((r, i) => {
        const out = swaps.find((x) => x.fromMemberId === r.id);
        return {
          lineupId: id,
          memberId: r.id,
          name: r.name,
          role: r.role,
          scheduledStart: callTime,
          sort: i,
          ...(out ? { arrival: "swapped_out" as const, swapId: out.id, coverName: out.toName } : {}),
        };
      });
      for (const sw of swaps) {
        const row = rows.find((r) => r.memberId === sw.toMemberId);
        if (row) {
          row.scheduledStart = sw.startTime;
          row.swapId = sw.id;
        }
      }
      if (rows.length) await db.insert(s.lineupEntries).values(rows);
      return { id };
    }),

  setLineup: managerBase
    .input(
      z.object({
        id: z.string(),
        topics: z.string().max(2000).optional(),
        specials: z.string().max(2000).optional(),
        eightySix: z.string().max(1000).optional(),
        vips: z.string().max(2000).optional(),
        callTime: hhmm.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const l = await loadLineup(context.viewer, input.id);
      if (l.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Already signed." });
      const patch: Partial<typeof s.lineups.$inferInsert> = {};
      if (input.topics !== undefined) patch.topics = input.topics;
      if (input.specials !== undefined) patch.specials = input.specials;
      if (input.eightySix !== undefined) patch.eightySix = input.eightySix;
      if (input.vips !== undefined) patch.vips = input.vips;
      if (input.callTime) {
        patch.callTime = input.callTime;
        // Move everyone still on the old call time.
        await db
          .update(s.lineupEntries)
          .set({ scheduledStart: input.callTime })
          .where(and(eq(s.lineupEntries.lineupId, l.id), eq(s.lineupEntries.scheduledStart, l.callTime)));
      }
      if (Object.keys(patch).length) await db.update(s.lineups).set(patch).where(eq(s.lineups.id, l.id));
      return { ok: true };
    }),

  setEntry: managerBase
    .input(
      z.object({
        entryId: z.string(),
        arrival: z.enum(ARRIVALS).optional(),
        arrivedAt: hhmm.nullish(),
        scheduledStart: hhmm.optional(),
        uniformOk: z.boolean().nullish(),
        uniformMissing: z.array(z.string().max(60)).max(12).optional(),
        coverName: z.string().max(80).nullish(),
        note: z.string().max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { e } = await loadOpenEntry(context.viewer, input.entryId);
      if (e.arrival === "swapped_out" && input.arrival && input.arrival !== "swapped_out")
        throw new ORPCError("BAD_REQUEST", { message: "This shift was swapped out with an approved swap." });
      const next = { ...e, ...Object.fromEntries(Object.entries(input).filter(([, val]) => val !== undefined)) } as typeof e;
      if (next.arrival === "late") {
        if (!next.arrivedAt) next.arrivedAt = next.scheduledStart;
        next.minutesLate = Math.max(0, minutesBetween(next.scheduledStart, next.arrivedAt));
      } else if (next.arrival !== "on_time") {
        next.arrivedAt = null;
        next.minutesLate = null;
      } else next.minutesLate = null;
      if (next.arrival === "no_show" || next.arrival === "swap_unapproved" || next.arrival === "swapped_out") {
        next.uniformOk = null;
        next.uniformMissing = [];
      }
      if (next.uniformOk !== false) next.uniformMissing = [];
      if (next.arrival !== "swap_unapproved" && next.arrival !== "swapped_out") next.coverName = null;
      await db
        .update(s.lineupEntries)
        .set({
          arrival: next.arrival,
          arrivedAt: next.arrivedAt,
          minutesLate: next.minutesLate,
          scheduledStart: next.scheduledStart,
          uniformOk: next.uniformOk,
          uniformMissing: next.uniformMissing,
          coverName: next.coverName,
          note: next.note,
        })
        .where(eq(s.lineupEntries.id, e.id));
      return { ok: true };
    }),

  /** Mark everyone still unmarked as on time and in uniform. */
  markRest: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const l = await loadLineup(context.viewer, input.id);
    if (l.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Already signed." });
    const entries = await db.select().from(s.lineupEntries).where(eq(s.lineupEntries.lineupId, l.id));
    for (const e of entries) {
      const patch: Partial<typeof e> = {};
      if (e.arrival === "pending") patch.arrival = "on_time";
      if ((e.arrival === "pending" || e.arrival === "on_time" || e.arrival === "late") && e.uniformOk == null) patch.uniformOk = true;
      if (Object.keys(patch).length) await db.update(s.lineupEntries).set(patch).where(eq(s.lineupEntries.id, e.id));
    }
    return { ok: true };
  }),

  addEntry: managerBase.input(z.object({ lineupId: z.string(), memberId: z.string() })).handler(async ({ input, context }) => {
    const l = await loadLineup(context.viewer, input.lineupId);
    if (l.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Already signed." });
    const [m] = await db.select().from(s.members).where(eq(s.members.id, input.memberId));
    if (!m || m.storeId !== l.storeId) throw new ORPCError("NOT_FOUND", { message: "Not on this store's team." });
    const [dupe] = await db
      .select({ id: s.lineupEntries.id })
      .from(s.lineupEntries)
      .where(and(eq(s.lineupEntries.lineupId, l.id), eq(s.lineupEntries.memberId, m.id)));
    if (dupe) throw new ORPCError("CONFLICT", { message: `${m.name} is already on this line up.` });
    await db.insert(s.lineupEntries).values({ lineupId: l.id, memberId: m.id, name: m.name, role: m.role, scheduledStart: l.callTime, sort: 999 });
    return { ok: true };
  }),

  removeEntry: managerBase.input(z.object({ entryId: z.string() })).handler(async ({ input, context }) => {
    const { e } = await loadOpenEntry(context.viewer, input.entryId);
    await db.delete(s.lineupEntries).where(eq(s.lineupEntries.id, e.id));
    return { ok: true };
  }),

  /**
   * Manager signs the line-up. Everyone present with an infraction acknowledges it with their
   * signature on this device (or it's recorded that they refused). Absent people acknowledge later.
   */
  close: managerBase
    .input(
      z.object({
        id: z.string(),
        signature: sig,
        acks: z.array(z.object({ entryId: z.string(), signature: sig.optional(), refused: z.boolean().optional() })).default([]),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const l = await loadLineup(v, input.id);
      if (l.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Already signed." });
      const entries = await db.select().from(s.lineupEntries).where(eq(s.lineupEntries.lineupId, l.id));
      if (!entries.length) throw new ORPCError("BAD_REQUEST", { message: "Add the people on this shift first." });
      const unmarked = entries.filter(
        (e) => e.arrival === "pending" || ((e.arrival === "on_time" || e.arrival === "late") && e.uniformOk == null),
      );
      if (unmarked.length)
        throw new ORPCError("BAD_REQUEST", {
          message: `Mark arrival and uniform for ${unmarked.map((e) => e.name.split(" ")[0]).join(", ")} first.`,
        });
      const now = new Date();
      const rows: (typeof s.conductEvents.$inferInsert)[] = [];
      for (const e of entries) {
        const inf = infractionsFor(e, l.shift);
        if (!inf.length) continue;
        const present = e.arrival === "on_time" || e.arrival === "late";
        const ack = input.acks.find((a) => a.entryId === e.id);
        if (present && !ack?.signature && !ack?.refused)
          throw new ORPCError("BAD_REQUEST", { message: `${e.name} needs to acknowledge and sign first.` });
        for (const i of inf) {
          rows.push({
            orgId: v.orgId,
            storeId: l.storeId,
            memberId: e.memberId,
            memberName: e.name,
            type: i.type,
            businessDate: l.businessDate,
            detail: i.detail,
            minutesLate: i.minutesLate ?? null,
            lineupId: l.id,
            entryId: e.id,
            status: !present ? "pending" : ack?.signature ? "acknowledged" : "refused",
            ackSignature: present ? (ack?.signature ?? null) : null,
            ackAt: present ? now : null,
            ackWitness: present && ack?.refused ? v.accessName : null,
            recordedByName: v.accessName,
          });
        }
      }
      if (rows.length) await db.insert(s.conductEvents).values(rows);
      await db
        .update(s.lineups)
        .set({
          status: "signed",
          runById: v.member?.id ?? null,
          runByName: v.accessName,
          runByRole: v.accessRole,
          signature: input.signature,
          signedAt: now,
        })
        .where(eq(s.lineups.id, l.id));
      const triggered: { id: string; memberName: string; step: string }[] = [];
      for (const mid of new Set(rows.map((r) => r.memberId))) {
        const a = await evaluateLadder(mid);
        if (a) triggered.push({ id: a.id, memberName: a.memberName, step: a.step });
      }
      return { ok: true, infractions: rows.length, triggered };
    }),
};
