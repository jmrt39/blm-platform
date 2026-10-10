import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, uniqueMemberPin, viewerBase } from "../lib/access";
import { onboardingRows } from "../lib/core";
import { addDays, businessDate, daysBetween } from "../lib/time";
import { initialsOf, isManagementRole, STORE_ROLES } from "../../shared/domain";

const roleEnum = z.enum(STORE_ROLES);

function summarize(items: (typeof s.onboardingItems.$inferSelect)[], today: string) {
  const total = items.length;
  const done = items.filter((i) => i.completedAt).length;
  const overdue = items.filter((i) => !i.completedAt && i.dueDate < today).length;
  const open = items.filter((i) => !i.completedAt).sort((a, b) => a.phase - b.phase || a.sort - b.sort);
  return { total, done, overdue, phase: open[0]?.phase ?? (total ? 90 : null), next: open[0]?.title ?? null };
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
    // 30-day spend per ticket for sellers
    const since = addDays(today, -30);
    const reports = await db
      .select({ id: s.shiftReports.id })
      .from(s.shiftReports)
      .where(and(inArray(s.shiftReports.storeId, storeIds), gte(s.shiftReports.businessDate, since)));
    const lines = reports.length
      ? await db
          .select()
          .from(s.shiftReportLines)
          .where(
            inArray(
              s.shiftReportLines.reportId,
              reports.map((r) => r.id),
            ),
          )
      : [];
    const perf = new Map<string, { sales: number; checks: number; shifts: number }>();
    for (const l of lines) {
      if (!l.memberId) continue;
      const p = perf.get(l.memberId) ?? { sales: 0, checks: 0, shifts: 0 };
      p.sales += l.netSales;
      p.checks += l.checks;
      p.shifts += 1;
      perf.set(l.memberId, p);
    }
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
          spt30: p && p.checks ? p.sales / p.checks : null,
          shifts30: p?.shifts ?? 0,
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
    const lines = await db
      .select({
        date: s.shiftReports.businessDate,
        netSales: s.shiftReportLines.netSales,
        covers: s.shiftReportLines.covers,
        checks: s.shiftReportLines.checks,
        wineBottles: s.shiftReportLines.wineBottles,
        desserts: s.shiftReportLines.desserts,
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
    return {
      member: {
        ...m,
        pin: v.level !== "staff" ? m.pin : null,
        email: priv ? m.email : null,
        phone: priv ? m.phone : null,
      },
      store: { id: store!.id, name: store!.name, number: store!.number, ticketTarget: store!.ticketTarget },
      tenureDays: daysBetween(m.hireDate, today),
      today,
      onboarding: items,
      sales: priv ? lines.reverse() : [],
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
