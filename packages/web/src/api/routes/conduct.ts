import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, loadStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { addDays, businessDate } from "../lib/time";
import { actionsFor, computeRatings, currentStep, evaluateLadder, isStrike, memberFrom, today, windowEvents, windowStart } from "../lib/conduct";
import { planSummaries } from "../lib/plans";
import { presignPut, screenshotUrl } from "../lib/s3";
import { demoShot } from "../lib/demo-shot";
import { SHIFTS, SHIFT_LABEL, STEP_LABEL, clock12, nextOnLadder } from "../../shared/conduct";
import { isManagementRole } from "../../shared/domain";

const sig = z.string().min(10).max(20000);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Swap = typeof s.shiftSwaps.$inferSelect;
type Action = typeof s.disciplinaryActions.$inferSelect;

async function withUrl(sw: Swap) {
  /** Only a swap whose shift has already happened can earn a protocol strike. */
  const worked = sw.businessDate <= today();
  if (sw.screenshotKey.startsWith("demo:")) return { ...sw, worked, screenshotUrl: demoShot(sw.screenshotKey.slice(5), sw) };
  return { ...sw, worked, screenshotUrl: await screenshotUrl(sw.screenshotKey).catch(() => null) };
}

function scopeIds(v: Viewer, storeId: string | null | undefined) {
  const ids = storeId ? [storeId] : v.storeIds;
  for (const id of ids) assertStore(v, id);
  return ids;
}

/** Staff may only open their own record; managers anyone at their stores. */
function assertCanSee(v: Viewer, memberId: string, storeId: string) {
  assertStore(v, storeId);
  if (v.level === "staff" && v.member?.id !== memberId) throw new ORPCError("FORBIDDEN", { message: "You can only see your own record." });
}

async function loadAction(v: Viewer, id: string) {
  const [a] = await db.select().from(s.disciplinaryActions).where(eq(s.disciplinaryActions.id, id));
  if (!a) throw new ORPCError("NOT_FOUND", { message: "Write up not found." });
  assertCanSee(v, a.memberId, a.storeId);
  return a;
}

const publicAction = (a: Action) => ({ ...a, stepLabel: STEP_LABEL[a.step] });

export const conduct = {
  /** Store (or combined) view: everyone's strikes, step and rating, plus what needs attention. */
  overview: managerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const storeIds = scopeIds(v, input.storeId);
    if (!storeIds.length) return null;
    const stores = await db.select().from(s.stores).where(inArray(s.stores.id, storeIds));
    const members = await db
      .select()
      .from(s.members)
      .where(and(inArray(s.members.storeId, storeIds), eq(s.members.status, "active")));
    const ids = members.map((m) => m.id);
    const from = windowStart();
    const events = await windowEvents(ids, from);
    const plans = await planSummaries(ids);
    const acts = await actionsFor(ids);
    const ratings = await computeRatings(storeIds);
    const people = members
      .map((m) => {
        const mf = memberFrom(m, from);
        const ev = events.filter((e) => e.memberId === m.id && e.businessDate >= mf);
        const strikes = ev.filter((e) => isStrike(e, mf));
        const count = (t: string) => strikes.filter((e) => e.type === t).length;
        const late = strikes.filter((e) => e.type === "late");
        const mine = acts.filter((a) => a.memberId === m.id);
        const step = currentStep(mine, mf);
        const r = ratings.get(m.id) ?? null;
        const last = strikes.sort((a, b) => b.businessDate.localeCompare(a.businessDate))[0];
        return {
          id: m.id,
          storeId: m.storeId,
          name: m.name,
          initials: m.initials,
          role: m.role,
          isManager: isManagementRole(m.role),
          strikes: strikes.length,
          late: late.length,
          avgLate: late.length ? Math.round(late.reduce((n, e) => n + (e.minutesLate ?? 0), 0) / late.length) : null,
          dress: count("dress_code"),
          noShow: count("no_show"),
          swap: count("swap_protocol"),
          excused: ev.filter((e) => e.status === "excused").length,
          pending: ev.filter((e) => e.status === "pending").length,
          step,
          next: nextOnLadder(strikes.length, step),
          lastStrike: last?.businessDate ?? null,
          /** When the oldest strike drops off, so the manager can say "clean by…". */
          rollsOff: strikes.length ? addDays(strikes.reduce((a, e) => (e.businessDate < a ? e.businessDate : a), "9999"), 90) : null,
          rating: r,
          plan: plans.get(m.id) ?? null,
          resetOn: m.conductResetOn,
        };
      })
      .sort((a, b) => b.strikes - a.strikes || a.name.localeCompare(b.name));

    const pendingAcks = events
      .filter((e) => e.status === "pending")
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    const openActions = acts.filter((a) => a.status === "awaiting_signatures" || a.status === "awaiting_owner").map(publicAction);
    const recentActions = acts
      .filter((a) => (a.status === "final" || a.status === "declined") && a.businessDate >= from)
      .slice(0, 20)
      .map(publicAction);
    const swaps = await db
      .select()
      .from(s.shiftSwaps)
      .where(and(inArray(s.shiftSwaps.storeId, storeIds), gte(s.shiftSwaps.businessDate, addDays(today(), -30))))
      .orderBy(desc(s.shiftSwaps.createdAt));
    const recent = events
      .filter((e) => e.businessDate >= addDays(today(), -30))
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 40);
    const totals = {
      strikes: people.reduce((n, p) => n + p.strikes, 0),
      late: people.reduce((n, p) => n + p.late, 0),
      dress: people.reduce((n, p) => n + p.dress, 0),
      noShow: people.reduce((n, p) => n + p.noShow, 0),
      swap: people.reduce((n, p) => n + p.swap, 0),
      atStep: people.filter((p) => p.step).length,
    };
    return {
      stores: stores.map((x) => ({ id: x.id, name: x.name, number: x.number })),
      windowFrom: from,
      people,
      totals,
      pendingAcks,
      openActions,
      recentActions,
      swaps: await Promise.all(swaps.map(withUrl)),
      recent,
      canDecide: v.level === "owner",
    };
  }),

  /** One person's record: strikes, write-ups, swaps and rating. Staff can open their own. */
  member: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [m] = await db.select().from(s.members).where(eq(s.members.id, input.id));
    if (!m) throw new ORPCError("NOT_FOUND");
    assertCanSee(v, m.id, m.storeId);
    const from = memberFrom(m, windowStart());
    const events = (
      await db
        .select()
        .from(s.conductEvents)
        .where(and(eq(s.conductEvents.memberId, m.id), gte(s.conductEvents.businessDate, addDays(from, -90))))
    ).sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.getTime() - a.createdAt.getTime());
    const acts = await actionsFor([m.id]);
    const strikes = events.filter((e) => isStrike(e, from));
    const ratings = await computeRatings([m.storeId]);
    const swaps = await db
      .select()
      .from(s.shiftSwaps)
      .where(or(eq(s.shiftSwaps.fromMemberId, m.id), eq(s.shiftSwaps.toMemberId, m.id)))
      .orderBy(desc(s.shiftSwaps.createdAt));
    const lineups = await db
      .select({ arrival: s.lineupEntries.arrival, uniformOk: s.lineupEntries.uniformOk, date: s.lineups.businessDate })
      .from(s.lineupEntries)
      .innerJoin(s.lineups, eq(s.lineups.id, s.lineupEntries.lineupId))
      .where(and(eq(s.lineupEntries.memberId, m.id), eq(s.lineups.status, "signed"), gte(s.lineups.businessDate, from)));
    const attended = lineups.filter((l) => l.arrival === "on_time" || l.arrival === "late");
    return {
      member: { id: m.id, name: m.name, role: m.role, storeId: m.storeId },
      windowFrom: from,
      strikes: strikes.length,
      step: currentStep(acts, from),
      next: nextOnLadder(strikes.length, currentStep(acts, from)),
      events: events.map((e) => ({ ...e, counts: isStrike(e, from), inWindow: e.businessDate >= from })),
      actions: acts.filter((a) => a.status !== "void" || a.businessDate >= from).map(publicAction),
      swaps: await Promise.all(swaps.slice(0, 12).map(withUrl)),
      lineups: {
        total: lineups.length,
        onTime: lineups.filter((l) => l.arrival === "on_time").length,
        late: lineups.filter((l) => l.arrival === "late").length,
        inUniform: attended.filter((l) => l.uniformOk).length,
        attended: attended.length,
      },
      rating: ratings.get(m.id) ?? null,
    };
  }),

  /** Manager excuses a strike (doctor's note, transit outage…). It no longer counts. */
  excuse: managerBase.input(z.object({ id: z.string(), reason: z.string().min(3).max(500) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [e] = await db.select().from(s.conductEvents).where(eq(s.conductEvents.id, input.id));
    if (!e) throw new ORPCError("NOT_FOUND");
    assertStore(v, e.storeId);
    if (v.member?.id === e.memberId) throw new ORPCError("FORBIDDEN", { message: "You can't excuse your own strike." });
    if (e.status === "excused") return { ok: true, voided: 0 };
    await db
      .update(s.conductEvents)
      .set({ status: "excused", excusedByName: v.accessName, excusedReason: input.reason.trim(), excusedAt: new Date() })
      .where(eq(s.conductEvents.id, e.id));
    const before = (await actionsFor([e.memberId])).filter((a) => a.status === "awaiting_signatures").length;
    await evaluateLadder(e.memberId);
    const after = (await actionsFor([e.memberId])).filter((a) => a.status === "awaiting_signatures").length;
    return { ok: true, voided: Math.max(0, before - after) };
  }),

  /** Someone who wasn't at line-up signs for their strikes later, on the manager's device. */
  acknowledge: managerBase
    .input(z.object({ ids: z.array(z.string()).min(1).max(20), signature: sig.optional(), refused: z.boolean().optional() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      if (!input.signature && !input.refused) throw new ORPCError("BAD_REQUEST", { message: "A signature is required." });
      const rows = await db.select().from(s.conductEvents).where(inArray(s.conductEvents.id, input.ids));
      if (new Set(rows.map((r) => r.memberId)).size > 1) throw new ORPCError("BAD_REQUEST", { message: "One person at a time." });
      for (const r of rows) {
        assertStore(v, r.storeId);
        if (r.status !== "pending") continue;
        await db
          .update(s.conductEvents)
          .set({
            status: input.signature ? "acknowledged" : "refused",
            ackSignature: input.signature ?? null,
            ackAt: new Date(),
            ackWitness: input.signature ? null : v.accessName,
          })
          .where(eq(s.conductEvents.id, r.id));
      }
      return { ok: true };
    }),

  // ── Shift swaps ─────────────────────────────────────────────

  swapPresign: viewerBase
    .input(z.object({ storeId: z.string(), contentType: z.string().regex(/^image\/(png|jpe?g|webp|heic|heif)$/) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      const ext = input.contentType.split("/")[1]!.replace("jpeg", "jpg");
      const key = `swaps/${v.orgId}/${input.storeId}/${crypto.randomUUID()}.${ext}`;
      return { key, url: await presignPut(key, input.contentType) };
    }),

  createSwap: viewerBase
    .input(
      z.object({
        storeId: z.string(),
        date: ymd,
        shift: z.enum(SHIFTS),
        startTime: hhmm,
        fromMemberId: z.string(),
        toMemberId: z.string(),
        screenshotKey: z.string().min(5),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      if (!input.screenshotKey.startsWith(`swaps/${v.orgId}/`)) throw new ORPCError("BAD_REQUEST", { message: "Upload the screenshot first." });
      if (v.level === "staff" && v.member?.id !== input.fromMemberId && v.member?.id !== input.toMemberId)
        throw new ORPCError("FORBIDDEN", { message: "You can only submit a swap for your own shift." });
      if (input.fromMemberId === input.toMemberId) throw new ORPCError("BAD_REQUEST", { message: "Pick the person picking up the shift." });
      const people = await db.select().from(s.members).where(inArray(s.members.id, [input.fromMemberId, input.toMemberId]));
      const from = people.find((p) => p.id === input.fromMemberId);
      const to = people.find((p) => p.id === input.toMemberId);
      if (!from || !to || from.storeId !== store.id || to.storeId !== store.id)
        throw new ORPCError("BAD_REQUEST", { message: "Both people must be on this store's team." });
      const id = crypto.randomUUID();
      await db.insert(s.shiftSwaps).values({
        id,
        orgId: v.orgId,
        storeId: store.id,
        businessDate: input.date,
        shift: input.shift,
        startTime: input.startTime,
        fromMemberId: from.id,
        fromName: from.name,
        toMemberId: to.id,
        toName: to.name,
        screenshotKey: input.screenshotKey,
        submittedByName: v.accessName,
      });
      return { id };
    }),

  /**
   * Manager checks the screenshot. Approval needs all three: the date, the start time, and the
   * pick-up's written agreement. Rejecting a swap that was already worked records a strike.
   */
  reviewSwap: managerBase
    .input(
      z.object({
        id: z.string(),
        approve: z.boolean(),
        hasDate: z.boolean(),
        hasStartTime: z.boolean(),
        hasWrittenAgreement: z.boolean(),
        note: z.string().max(500).optional(),
        strike: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const [sw] = await db.select().from(s.shiftSwaps).where(eq(s.shiftSwaps.id, input.id));
      if (!sw) throw new ORPCError("NOT_FOUND");
      assertStore(v, sw.storeId);
      if (sw.status !== "pending") throw new ORPCError("BAD_REQUEST", { message: "This swap has already been reviewed." });
      if (input.approve && !(input.hasDate && input.hasStartTime && input.hasWrittenAgreement))
        throw new ORPCError("BAD_REQUEST", {
          message: "The screenshot must show the date, the start time and a written agreement before you can approve.",
        });
      const missing = [!input.hasDate && "date", !input.hasStartTime && "start time", !input.hasWrittenAgreement && "written agreement"].filter(
        Boolean,
      ) as string[];
      await db
        .update(s.shiftSwaps)
        .set({
          status: input.approve ? "approved" : "rejected",
          hasDate: input.hasDate,
          hasStartTime: input.hasStartTime,
          hasWrittenAgreement: input.hasWrittenAgreement,
          reviewedByName: v.accessName,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || (missing.length ? `Screenshot doesn't show the ${missing.join(", ")}.` : null),
        })
        .where(eq(s.shiftSwaps.id, sw.id));

      let triggered: { id: string; memberName: string; step: string } | null = null;
      if (input.approve) {
        // If tonight's line-up is already open, move the people across.
        const [l] = await db
          .select()
          .from(s.lineups)
          .where(and(eq(s.lineups.storeId, sw.storeId), eq(s.lineups.businessDate, sw.businessDate), eq(s.lineups.shift, sw.shift)));
        if (l?.status === "open") {
          await db
            .update(s.lineupEntries)
            .set({ arrival: "swapped_out", swapId: sw.id, coverName: sw.toName, arrivedAt: null, minutesLate: null, uniformOk: null, uniformMissing: [] })
            .where(and(eq(s.lineupEntries.lineupId, l.id), eq(s.lineupEntries.memberId, sw.fromMemberId)));
          await db
            .update(s.lineupEntries)
            .set({ scheduledStart: sw.startTime, swapId: sw.id })
            .where(and(eq(s.lineupEntries.lineupId, l.id), eq(s.lineupEntries.memberId, sw.toMemberId)));
        }
      } else if (input.strike && sw.businessDate <= today()) {
        await db.insert(s.conductEvents).values({
          orgId: sw.orgId,
          storeId: sw.storeId,
          memberId: sw.fromMemberId,
          memberName: sw.fromName,
          type: "swap_protocol",
          businessDate: sw.businessDate,
          detail: `Swapped the ${SHIFT_LABEL[sw.shift].toLowerCase()} shift (${clock12(sw.startTime)}) to ${sw.toName} without proof${missing.length ? `. The screenshot didn't show the ${missing.join(", ")}` : ""}.`,
          swapId: sw.id,
          recordedByName: v.accessName,
        });
        const a = await evaluateLadder(sw.fromMemberId);
        if (a) triggered = { id: a.id, memberName: a.memberName, step: a.step };
      }
      return { ok: true, triggered };
    }),

  // ── Write-ups ───────────────────────────────────────────────

  getAction: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const a = await loadAction(v, input.id);
    const events = a.eventIds.length ? await db.select().from(s.conductEvents).where(inArray(s.conductEvents.id, a.eventIds)) : [];
    const [m] = await db.select().from(s.members).where(eq(s.members.id, a.memberId));
    const [store] = await db.select().from(s.stores).where(eq(s.stores.id, a.storeId));
    const history = (await actionsFor([a.memberId])).filter((x) => x.id !== a.id && x.status !== "void").map(publicAction);
    return {
      action: publicAction(a),
      events: events.sort((x, y) => x.businessDate.localeCompare(y.businessDate)),
      member: m ? { id: m.id, name: m.name, role: m.role, hireDate: m.hireDate, status: m.status } : null,
      store: store ? { id: store.id, name: store.name, number: store.number, timezone: store.timezone } : null,
      history,
      can: {
        managerSign: v.level !== "staff" && a.status === "awaiting_signatures" && !a.managerSignature && v.member?.id !== a.memberId,
        employeeSign: v.level !== "staff" && a.status === "awaiting_signatures" && !!a.managerSignature,
        decide: v.level === "owner" && a.status === "awaiting_owner",
      },
    };
  }),

  /** Manager signs first, then the employee signs on the same device (or refuses, witnessed). */
  signAction: managerBase
    .input(
      z.object({
        id: z.string(),
        as: z.enum(["manager", "employee"]),
        signature: sig.optional(),
        refused: z.boolean().optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const a = await loadAction(v, input.id);
      if (a.status !== "awaiting_signatures") throw new ORPCError("BAD_REQUEST", { message: "This write up isn't waiting for signatures." });
      const now = new Date();
      if (input.as === "manager") {
        if (!input.signature) throw new ORPCError("BAD_REQUEST", { message: "Sign first." });
        if (v.member?.id === a.memberId) throw new ORPCError("FORBIDDEN", { message: "Another manager must issue your write up." });
        await db
          .update(s.disciplinaryActions)
          .set({
            managerName: v.accessName,
            managerRole: v.accessRole,
            managerSignature: input.signature,
            managerSignedAt: now,
            ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
          })
          .where(eq(s.disciplinaryActions.id, a.id));
        return { ok: true, status: a.status };
      }
      if (!a.managerSignature) throw new ORPCError("BAD_REQUEST", { message: "The manager signs first." });
      if (!input.signature && !input.refused) throw new ORPCError("BAD_REQUEST", { message: "A signature is required." });
      const status = a.step === "termination" ? "awaiting_owner" : "final";
      await db
        .update(s.disciplinaryActions)
        .set({
          employeeSignature: input.signature ?? null,
          employeeSignedAt: now,
          employeeRefused: !input.signature,
          status,
        })
        .where(eq(s.disciplinaryActions.id, a.id));
      return { ok: true, status };
    }),

  /** Terminations aren't final until the owner approves. */
  ownerDecide: managerBase
    .input(z.object({ id: z.string(), approve: z.boolean(), note: z.string().max(1000).optional() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      if (v.level !== "owner") throw new ORPCError("FORBIDDEN", { message: "Only the owner can decide a termination." });
      const a = await loadAction(v, input.id);
      if (a.status !== "awaiting_owner") throw new ORPCError("BAD_REQUEST", { message: "Nothing to decide." });
      const day = businessDate("America/New_York");
      await db
        .update(s.disciplinaryActions)
        .set({ status: input.approve ? "final" : "declined", ownerName: v.accessName, ownerNote: input.note?.trim() || null, ownerDecidedAt: new Date() })
        .where(eq(s.disciplinaryActions.id, a.id));
      if (input.approve) await db.update(s.members).set({ status: "departed", departedOn: day }).where(eq(s.members.id, a.memberId));
      return { ok: true };
    }),
};
