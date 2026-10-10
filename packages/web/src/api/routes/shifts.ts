import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, managerBase, viewerBase } from "../lib/access";
import { lineTarget } from "../lib/perf";
import { SHIFT_KINDS, targetGrid } from "../../shared/metrics";

const line = z.object({
  memberId: z.string().nullish(),
  name: z.string().min(1).max(80),
  role: z.string().default("server"),
  netSales: z.number().min(0).max(1_000_000),
  covers: z.number().int().min(0).max(5000),
  checks: z.number().int().min(0).max(5000).default(0),
  wineBottles: z.number().int().min(0).max(1000).default(0),
  desserts: z.number().int().min(0).max(5000).default(0),
  shift: z.enum(["lunch", "dinner"]).default("dinner"),
  kind: z.enum(SHIFT_KINDS).default("solo"),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

export const shifts = {
  list: managerBase
    .input(z.object({ storeId: z.string(), limit: z.number().int().min(1).max(120).default(30) }))
    .handler(async ({ input, context }) => {
      await loadStore(context.viewer, input.storeId);
      const rows = await db
        .select()
        .from(s.shiftReports)
        .where(eq(s.shiftReports.storeId, input.storeId))
        .orderBy(desc(s.shiftReports.businessDate))
        .limit(input.limit);
      return rows.map(({ signature: _s, ...r }) => ({ ...r, spt: r.checks ? r.netSales / r.checks : 0 }));
    }),

  get: managerBase
    .input(z.object({ storeId: z.string(), date: z.string() }))
    .handler(async ({ input, context }) => {
      const store = await loadStore(context.viewer, input.storeId);
      const [r] = await db
        .select()
        .from(s.shiftReports)
        .where(and(eq(s.shiftReports.storeId, store.id), eq(s.shiftReports.businessDate, input.date)));
      const st = { id: store.id, name: store.name, number: store.number, ticketTarget: store.ticketTarget, grid: targetGrid(store) };
      if (!r) return { store: st, report: null };
      const lines = await db.select().from(s.shiftReportLines).where(eq(s.shiftReportLines.reportId, r.id));
      lines.sort((a, b) => b.netSales - a.netSales);
      return {
        store: st,
        report: { ...r, spt: r.checks ? r.netSales / r.checks : 0, lines },
      };
    }),

  /** End-of-night report: typed in at close or imported from the POS export. Re-submitting replaces the night. */
  submit: managerBase
    .input(
      z.object({
        storeId: z.string(),
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lines: z.array(line).min(1).max(80),
        comps: z.number().min(0).default(0),
        voids: z.number().min(0).default(0),
        discounts: z.number().min(0).default(0),
        walkouts: z.number().int().min(0).default(0),
        eightySixed: z.string().max(500).default(""),
        notes: z.string().max(4000).default(""),
        source: z.enum(["manual", "csv"]).default("manual"),
        signature: z.string().min(10).max(20000),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const valid = await db
        .select({ id: s.members.id, employment: s.members.employment, targetAdjust: s.members.targetAdjust })
        .from(s.members)
        .where(eq(s.members.storeId, store.id));
      const ids = new Set(valid.map((m) => m.id));
      const byId = new Map(valid.map((m) => [m.id, m]));
      for (const l of input.lines) if (l.memberId && !ids.has(l.memberId)) throw new ORPCError("BAD_REQUEST", { message: `${l.name} isn't on this store's team.` });

      const [prev] = await db
        .select({ id: s.shiftReports.id })
        .from(s.shiftReports)
        .where(and(eq(s.shiftReports.storeId, store.id), eq(s.shiftReports.businessDate, input.businessDate)));
      // A night re-submitted keeps the targets it was first saved with: target changes never rewrite history.
      const frozen = new Map<string, number>();
      if (prev)
        for (const l of await db.select().from(s.shiftReportLines).where(eq(s.shiftReportLines.reportId, prev.id)))
          if (l.target != null) frozen.set(`${l.memberId ?? l.name}|${l.shift}|${l.role}`, l.target);
      if (prev) {
        await db.delete(s.shiftReportLines).where(eq(s.shiftReportLines.reportId, prev.id));
        await db.delete(s.shiftReports).where(eq(s.shiftReports.id, prev.id));
      }
      const id = crypto.randomUUID();
      const netSales = r2(input.lines.reduce((a, l) => a + l.netSales, 0));
      const covers = input.lines.reduce((a, l) => a + l.covers, 0);
      const checks = input.lines.reduce((a, l) => a + l.checks, 0);
      await db.insert(s.shiftReports).values({
        id,
        storeId: store.id,
        businessDate: input.businessDate,
        netSales,
        covers,
        checks,
        comps: r2(input.comps),
        voids: r2(input.voids),
        discounts: r2(input.discounts),
        walkouts: input.walkouts,
        eightySixed: input.eightySixed,
        notes: input.notes,
        source: input.source,
        submittedById: v.member?.id ?? null,
        submittedByName: v.accessName,
        signature: input.signature,
        submittedAt: new Date(),
      });
      await db.insert(s.shiftReportLines).values(
        input.lines.map((l) => ({
          reportId: id,
          memberId: l.memberId ?? null,
          name: l.name,
          role: l.role,
          netSales: r2(l.netSales),
          covers: l.covers,
          checks: l.checks,
          wineBottles: l.wineBottles,
          desserts: l.desserts,
          shift: l.shift,
          kind: l.kind,
          target: frozen.get(`${l.memberId ?? l.name}|${l.shift}|${l.role}`) ?? lineTarget(store, l.memberId ? byId.get(l.memberId) : null, l.role, l.shift),
        })),
      );
      return { id, replaced: !!prev, netSales, covers, checks, spt: checks ? netSales / checks : 0 };
    }),

  roster: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const store = await loadStore(context.viewer, input.storeId);
    const rows = await db
      .select({ id: s.members.id, name: s.members.name, role: s.members.role, initials: s.members.initials, employment: s.members.employment, targetAdjust: s.members.targetAdjust })
      .from(s.members)
      .where(and(eq(s.members.storeId, input.storeId), eq(s.members.status, "active")));
    return rows.map((m) => ({ ...m, targets: { lunch: lineTarget(store, m, m.role, "lunch"), dinner: lineTarget(store, m, m.role, "dinner") } }));
  }),
};
