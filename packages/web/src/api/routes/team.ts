import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, uniqueMemberPin, viewerBase } from "../lib/access";
import { onboardingRows } from "../lib/core";
import { addDays, businessDate, daysBetween } from "../lib/time";
import { initialsOf, isManagementRole, onboardingLink, STORE_ROLES } from "../../shared/domain";
import { loadLibrary } from "../lib/library";
import { PASS_MARK } from "../../shared/program";
import { EMPLOYMENT, isCounted, targetGrid } from "../../shared/metrics";
import { blockIn, blockingActions, lineTarget, perfBy, perfLines, rollingFrom, standing } from "../lib/perf";

const roleEnum = z.enum(STORE_ROLES);

function summarize(items: (typeof s.onboardingItems.$inferSelect)[], today: string) {
  const total = items.length;
  const done = items.filter((i) => i.completedAt).length;
  const overdue = items.filter((i) => !i.completedAt && i.dueDate < today).length;
  const open = items.filter((i) => !i.completedAt).sort((a, b) => a.phase - b.phase || a.sort - b.sort);
  return { total, done, overdue, phase: open[0]?.phase ?? (total ? 90 : null), next: open[0]?.title ?? null };
}

/**
 * Attach the place on the platform where each onboarding step is done, and tick any step whose
 * knowledge check has already been passed (a pass taken before the link existed still counts).
 */
async function linkOnboarding(items: (typeof s.onboardingItems.$inferSelect)[], memberId: string, orgId: string, priv: boolean) {
  const lib = await loadLibrary(orgId);
  const attempts = priv
    ? await db
        .select({ quiz: s.quizAttempts.quiz, score: s.quizAttempts.score })
        .from(s.quizAttempts)
        .where(eq(s.quizAttempts.memberId, memberId))
    : [];
  const best = new Map<string, number>();
  for (const a of attempts) best.set(a.quiz, Math.max(best.get(a.quiz) ?? 0, a.score));
  const out = [];
  for (const it of items) {
    const l = onboardingLink(it.title);
    const quiz = l?.quiz && lib.quizBySlug[l.quiz] ? l.quiz : null;
    const module = l?.module && lib.moduleBySlug[l.module] ? l.module : null;
    const score = quiz ? (best.get(quiz) ?? null) : null;
    let row = it;
    if (quiz && !it.completedAt && score != null && score >= PASS_MARK) {
      const by = `Passed the check · ${Math.round(score * 100)}%`;
      await db.update(s.onboardingItems).set({ completedAt: new Date(), completedBy: by }).where(eq(s.onboardingItems.id, it.id));
      row = { ...it, completedAt: new Date(), completedBy: by };
    }
    out.push({
      ...row,
      link:
        quiz || module
          ? {
              quiz,
              module,
              moduleTitle: module ? (lib.moduleBySlug[module]?.title ?? null) : null,
              how: l!.how,
              tried: quiz ? attempts.some((a) => a.quiz === quiz) : false,
              best: score,
            }
          : null,
    });
  }
  return out;
}

export const team = {
  list: viewerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const storeIds = input.storeId ? [input.storeId] : v.storeIds;
    for (const id of storeIds) assertStore(v, id);
    if (!storeIds.length) return [];
    const rows = await db
      .select()
      .from(s.members)
      .where(and(inArray(s.members.storeId, storeIds), eq(s.members.status, "active")));
    const ob = rows.length
      ? await db
          .select()
          .from(s.onboardingItems)
          .where(
            inArray(
              s.onboardingItems.memberId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    const today = businessDate("America/New_York");
    // Rolling 30 days, solo serving shifts only, against each shift's own target.
    const lines = await perfLines(storeIds, rollingFrom(today), today);
    const perf = perfBy(lines);
    const stores = new Map((await db.select().from(s.stores).where(inArray(s.stores.id, storeIds))).map((x) => [x.id, x]));
    const canSeePins = v.level !== "staff";
    return rows
      .map((m) => {
        const items = ob.filter((o) => o.memberId === m.id);
        const p = perf.get(m.id);
        return {
          id: m.id,
          storeId: m.storeId,
          name: m.name,
          initials: m.initials,
          role: m.role,
          isTrainer: m.isTrainer,
          hireDate: m.hireDate,
          tenureDays: daysBetween(m.hireDate, today),
          email: canSeePins ? m.email : null,
          pin: canSeePins ? m.pin : null,
          onboarding: items.length ? summarize(items, today) : null,
          employment: m.employment,
          targetAdjust: m.targetAdjust,
          /** Their own dinner target today, and the ticket weighted target across their counted shifts. */
          target: lineTarget(stores.get(m.storeId)!, m, m.role, "dinner"),
          target30: p?.target ?? null,
          spt30: p?.spt ?? null,
          shifts30: p?.shifts ?? 0,
          uncounted30: p?.uncounted ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  get: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [m] = await db.select().from(s.members).where(eq(s.members.id, input.id));
    if (!m) throw new ORPCError("NOT_FOUND");
    assertStore(v, m.storeId);
    if (v.level === "staff" && v.member?.id !== m.id) {
      // Colleagues can see a light profile only.
    }
    const [store] = await db.select().from(s.stores).where(eq(s.stores.id, m.storeId));
    const items = await db
      .select()
      .from(s.onboardingItems)
      .where(eq(s.onboardingItems.memberId, m.id))
      .orderBy(s.onboardingItems.phase, s.onboardingItems.sort);
    const today = businessDate(store!.timezone);
    const self0 = v.member?.id === m.id;
    const onboarding = await linkOnboarding(items, m.id, m.orgId, self0 || v.level !== "staff");
    const lines = await db
      .select({
        date: s.shiftReports.businessDate,
        netSales: s.shiftReportLines.netSales,
        covers: s.shiftReportLines.covers,
        checks: s.shiftReportLines.checks,
        wineBottles: s.shiftReportLines.wineBottles,
        desserts: s.shiftReportLines.desserts,
        shift: s.shiftReportLines.shift,
        kind: s.shiftReportLines.kind,
        target: s.shiftReportLines.target,
        role: s.shiftReportLines.role,
      })
      .from(s.shiftReportLines)
      .innerJoin(s.shiftReports, eq(s.shiftReports.id, s.shiftReportLines.reportId))
      .where(and(eq(s.shiftReportLines.memberId, m.id), gte(s.shiftReports.businessDate, addDays(today, -42))))
      .orderBy(desc(s.shiftReports.businessDate));
    const initialled = await db
      .select({ id: s.checklistLines.id })
      .from(s.checklistLines)
      .where(eq(s.checklistLines.doneById, m.id));
    const self = v.member?.id === m.id;
    const priv = v.level !== "staff" || self;
    const st = store!;
    const targets = { dinner: lineTarget(st, m, m.role, "dinner"), lunch: lineTarget(st, m, m.role, "lunch") };
    const rolling = standing(perfBy(await perfLines([st.id], rollingFrom(today), today)).get(m.id));
    const block = blockIn((await blockingActions([m.id])).get(m.id) ?? [], m.conductResetOn, rollingFrom(today), today);
    return {
      member: {
        ...m,
        pin: v.level !== "staff" ? m.pin : null,
        email: priv ? m.email : null,
        phone: priv ? m.phone : null,
      },
      store: { id: store!.id, name: store!.name, number: store!.number, ticketTarget: store!.ticketTarget, grid: targetGrid(store!) },
      tenureDays: daysBetween(m.hireDate, today),
      today,
      onboarding,
      sales: priv ? lines.reverse().map((l) => ({ ...l, target: l.target ?? targets[l.shift], counted: isCounted(l.kind) })) : [],
      targets,
      rolling: priv ? { ...rolling, from: rollingFrom(today), blocked: block?.reason ?? null } : null,
      checklistLinesInitialled: initialled.length,
      canManage: v.level !== "staff",
    };
  }),

  create: managerBase
    .input(
      z.object({
        storeId: z.string(),
        name: z.string().min(2).max(80),
        role: roleEnum,
        isTrainer: z.boolean().default(false),
        email: z.string().email().nullish().or(z.literal("")),
        phone: z.string().max(40).nullish(),
        hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        employment: z.enum(EMPLOYMENT).default("full_time"),
        pin: z
          .string()
          .regex(/^\d{4}$/)
          .nullish()
          .or(z.literal("")),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      if (v.level === "manager" && isManagementRole(input.role) && v.member?.role !== "gm")
        throw new ORPCError("FORBIDDEN", { message: "Only the GM or owner can add managers." });
      if (input.pin) {
        const [clash] = await db
          .select({ id: s.members.id })
          .from(s.members)
          .where(and(eq(s.members.storeId, input.storeId), eq(s.members.pin, input.pin)));
        if (clash) throw new ORPCError("CONFLICT", { message: "That PIN is already used at this store." });
      }
      const pin = await uniqueMemberPin(input.storeId, input.pin || undefined);
      const id = crypto.randomUUID();
      const email = input.email ? input.email.toLowerCase() : null;
      await db.insert(s.members).values({
        id,
        orgId: v.orgId,
        storeId: input.storeId,
        name: input.name.trim(),
        initials: initialsOf(input.name),
        role: input.role,
        isTrainer: input.isTrainer,
        email,
        phone: input.phone || null,
        pin,
        hireDate: input.hireDate,
        employment: input.employment,
      });
      const rows = onboardingRows(id, input.role, input.hireDate);
      await db.insert(s.onboardingItems).values(rows);
      return { id, pin, onboardingItems: rows.length };
    }),

  update: managerBase
    .input(
      z.object({
        id: z.string(),
        role: roleEnum.optional(),
        isTrainer: z.boolean().optional(),
        email: z.string().email().nullish().or(z.literal("")),
        phone: z.string().max(40).nullish(),
        resetPin: z.boolean().optional(),
        employment: z.enum(EMPLOYMENT).optional(),
        /** Personal target adjustment in dollars, with the reason. Null clears it. */
        targetAdjust: z.number().min(-200).max(200).nullish(),
        targetNote: z.string().max(300).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [m] = await db.select().from(s.members).where(eq(s.members.id, input.id));
      if (!m) throw new ORPCError("NOT_FOUND");
      assertStore(context.viewer, m.storeId);
      const patch: Partial<typeof s.members.$inferInsert> = {};
      if (input.role) patch.role = input.role;
      if (input.isTrainer !== undefined) patch.isTrainer = input.isTrainer;
      if (input.email !== undefined) patch.email = input.email ? input.email.toLowerCase() : null;
      if (input.phone !== undefined) patch.phone = input.phone || null;
      if (input.resetPin) patch.pin = await uniqueMemberPin(m.storeId);
      if (input.employment) patch.employment = input.employment;
      if (input.targetAdjust !== undefined) patch.targetAdjust = input.targetAdjust || null;
      if (input.targetNote !== undefined) patch.targetNote = input.targetNote.trim();
      if (patch.targetAdjust && !(patch.targetNote ?? m.targetNote))
        throw new ORPCError("BAD_REQUEST", { message: "Give the reason for a personal target, so it reads fair to the rest of the team." });
      if (Object.keys(patch).length) await db.update(s.members).set(patch).where(eq(s.members.id, m.id));
      if (input.resetPin) await db.delete(s.storeSessions).where(eq(s.storeSessions.memberId, m.id));
      return { ok: true, pin: patch.pin ?? null };
    }),

  setOnboarding: managerBase
    .input(z.object({ itemId: z.string(), done: z.boolean() }))
    .handler(async ({ input, context }) => {
      const [item] = await db.select().from(s.onboardingItems).where(eq(s.onboardingItems.id, input.itemId));
      if (!item) throw new ORPCError("NOT_FOUND");
      const [m] = await db.select().from(s.members).where(eq(s.members.id, item.memberId));
      assertStore(context.viewer, m!.storeId);
      await db
        .update(s.onboardingItems)
        .set(
          input.done
            ? { completedAt: new Date(), completedBy: context.viewer.accessName }
            : { completedAt: null, completedBy: null },
        )
        .where(eq(s.onboardingItems.id, item.id));
      return { ok: true };
    }),

  depart: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [m] = await db.select().from(s.members).where(eq(s.members.id, input.id));
    if (!m) throw new ORPCError("NOT_FOUND");
    assertStore(context.viewer, m.storeId);
    if (context.viewer.member?.id === m.id) throw new ORPCError("BAD_REQUEST", { message: "You can't remove yourself." });
    await db
      .update(s.members)
      .set({ status: "departed", departedOn: businessDate("America/New_York") })
      .where(eq(s.members.id, m.id));
    await db.delete(s.storeSessions).where(eq(s.storeSessions.memberId, m.id));
    return { ok: true };
  }),
};
