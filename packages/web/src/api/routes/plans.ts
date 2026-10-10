import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { today } from "../lib/conduct";
import { isOpenPlan, normalizeChecks, planPrefill, planView } from "../lib/plans";
import { PLAN_CHECKS, PLAN_MODES, planScore, planShiftMet } from "../../shared/conduct";
import { guardRecord } from "../lib/privacy";

const sig = z.string().min(10).max(20000);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shift = z.enum(["lunch", "dinner"]);
const checks = z.object(Object.fromEntries(PLAN_CHECKS.map((k) => [k, z.boolean().nullable()])) as Record<(typeof PLAN_CHECKS)[number], z.ZodNullable<z.ZodBoolean>>);

async function loadPlan(v: Viewer, id: string) {
  const [a] = await db.select().from(s.disciplinaryActions).where(eq(s.disciplinaryActions.id, id));
  if (!a || a.step !== "plan") throw new ORPCError("NOT_FOUND", { message: "Performance plan not found." });
  assertStore(v, a.storeId);
  if (v.level === "staff" && v.member?.id !== a.memberId) throw new ORPCError("FORBIDDEN", { message: "You can only see your own plan." });
  return a;
}
async function shiftsOf(actionId: string) {
  return db.select().from(s.planShifts).where(eq(s.planShifts.actionId, actionId));
}
function assertOpen(a: typeof s.disciplinaryActions.$inferSelect) {
  if (a.graduatedOn) throw new ORPCError("BAD_REQUEST", { message: "This plan is already graduated." });
  if (!isOpenPlan(a)) throw new ORPCError("BAD_REQUEST", { message: "This plan is no longer open." });
}

export const plans = {
  /** The plan, every shift logged against it, and where the person stands. */
  get: viewerBase.input(z.object({ actionId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const a = await loadPlan(v, input.actionId);
    await guardRecord(v, "conduct", a.memberId, context.headers);
    const view = planView(a, await shiftsOf(a.id));
    return {
      ...view,
      today: today(),
      can: {
        manage: v.level !== "staff" && v.member?.id !== a.memberId && isOpenPlan(a),
        log: v.level !== "staff" && v.member?.id !== a.memberId && isOpenPlan(a) && a.status === "final",
        graduate: v.level !== "staff" && v.member?.id !== a.memberId && isOpenPlan(a) && a.status === "final" && view.progress.ready,
      },
    };
  }),

  /** The manager picks how graduation is judged and writes the areas the plan is for. */
  setup: managerBase
    .input(z.object({ actionId: z.string(), mode: z.enum(PLAN_MODES), focus: z.string().max(2000) }))
    .handler(async ({ input, context }) => {
      const a = await loadPlan(context.viewer, input.actionId);
      assertOpen(a);
      await db.update(s.disciplinaryActions).set({ planMode: input.mode, planFocus: input.focus.trim() }).where(eq(s.disciplinaryActions.id, a.id));
      return { ok: true };
    }),

  /** What the platform already knows about that shift, for the manager to confirm. */
  prefill: managerBase.input(z.object({ actionId: z.string(), date: ymd, shift })).handler(async ({ input, context }) => {
    const a = await loadPlan(context.viewer, input.actionId);
    return planPrefill(a.memberId, a.storeId, input.date, input.shift);
  }),

  /** Log (or correct) one shift against the plan, signed by the manager. */
  logShift: managerBase
    .input(z.object({ actionId: z.string(), date: ymd, shift, checks, note: z.string().max(1000).default(""), signature: sig }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const a = await loadPlan(v, input.actionId);
      assertOpen(a);
      if (a.status !== "final") throw new ORPCError("BAD_REQUEST", { message: "The plan has to be signed before shifts are logged against it." });
      if (v.member?.id === a.memberId) throw new ORPCError("FORBIDDEN", { message: "Another manager logs your plan shifts." });
      if (input.date < a.businessDate || input.date > today()) throw new ORPCError("BAD_REQUEST", { message: "Pick a shift between the plan's start and today." });
      if (input.checks.standards == null || input.checks.improvement == null)
        throw new ORPCError("BAD_REQUEST", { message: "Answer standards and improvement. Those are the manager's call." });
      const c = normalizeChecks(input.checks);
      const row = {
        actionId: a.id,
        memberId: a.memberId,
        storeId: a.storeId,
        businessDate: input.date,
        shift: input.shift,
        checks: c,
        score: planScore(c),
        met: planShiftMet(c),
        note: input.note.trim(),
        managerName: v.accessName,
        signature: input.signature,
      };
      const [have] = await db
        .select({ id: s.planShifts.id })
        .from(s.planShifts)
        .where(and(eq(s.planShifts.actionId, a.id), eq(s.planShifts.businessDate, input.date), eq(s.planShifts.shift, input.shift)));
      if (have) await db.update(s.planShifts).set(row).where(eq(s.planShifts.id, have.id));
      else await db.insert(s.planShifts).values(row);
      return { ok: true, met: row.met, score: row.score };
    }),

  removeShift: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [x] = await db.select().from(s.planShifts).where(eq(s.planShifts.id, input.id));
    if (!x) throw new ORPCError("NOT_FOUND");
    const a = await loadPlan(context.viewer, x.actionId);
    assertOpen(a);
    await db.delete(s.planShifts).where(eq(s.planShifts.id, x.id));
    return { ok: true };
  }),

  /**
   * Graduate: signed off by a manager once the plan's bar is met.
   * The person goes back to zero today: strikes and write ups before today stop counting,
   * and rewards open again from the next full month.
   */
  graduate: managerBase.input(z.object({ actionId: z.string(), signature: sig })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const a = await loadPlan(v, input.actionId);
    assertOpen(a);
    if (v.member?.id === a.memberId) throw new ORPCError("FORBIDDEN", { message: "Another manager signs off your plan." });
    const view = planView(a, await shiftsOf(a.id));
    if (!view.progress.ready) throw new ORPCError("BAD_REQUEST", { message: `Not there yet: ${view.progress.summary}.` });
    const day = today();
    await db
      .update(s.disciplinaryActions)
      .set({ graduatedOn: day, graduatedByName: v.accessName, graduationSignature: input.signature })
      .where(eq(s.disciplinaryActions.id, a.id));
    await db.update(s.members).set({ conductResetOn: day }).where(eq(s.members.id, a.memberId));
    return { ok: true, resetOn: day };
  }),
};
