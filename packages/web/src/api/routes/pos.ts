import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { holdsKeys } from "../lib/privacy";
import {
  addDays,
  importLog,
  inboundAddress,
  inboundReady,
  localNow,
  newInboundKey,
  pullToast,
  testToast,
  toastPublicKey,
  toastReady,
  uploadUrl,
  type PosConn,
} from "../lib/pos";
import { POS_SYSTEMS } from "../../shared/pos";

/** Owners, area directors over the store, and the store's GM set up the connection. */
function canSetUp(v: Viewer, storeId: string) {
  assertStore(v, storeId);
  if (!(v.level === "owner" || v.level === "area" || holdsKeys(v))) throw new ORPCError("FORBIDDEN", { message: "The owner or GM sets up the POS import." });
}

async function connFor(storeId: string) {
  const [c] = await db.select().from(s.posConnections).where(eq(s.posConnections.storeId, storeId)).orderBy(desc(s.posConnections.createdAt)).limit(1);
  return c ?? null;
}

const SYSTEM_KEYS = POS_SYSTEMS.map((x) => x.key) as [string, ...string[]];

export const pos = {
  /** Connection, where files go, the last three weeks of nights, and the import log. */
  get: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    canSetUp(v, input.storeId);
    const [st] = await db.select().from(s.stores).where(eq(s.stores.id, input.storeId));
    if (!st) throw new ORPCError("NOT_FOUND");
    const c = await connFor(input.storeId);
    const log = await importLog(input.storeId);
    const today = localNow(st.timezone).date;
    const from = addDays(today, -14);
    const reports = await db
      .select({ date: s.shiftReports.businessDate, source: s.shiftReports.source, netSales: s.shiftReports.netSales })
      .from(s.shiftReports)
      .where(and(eq(s.shiftReports.storeId, input.storeId), gte(s.shiftReports.businessDate, from)));
    const nights = Array.from({ length: 14 }, (_, i) => addDays(today, -1 - i)).map((date) => {
      const mine = log.filter((l) => l.businessDate === date);
      const rep = reports.find((r) => r.date === date);
      return {
        date,
        pos: mine.some((l) => l.status === "ok") ? "ok" : mine.some((l) => l.status === "missing") ? "missing" : mine.some((l) => l.status === "failed") ? "failed" : "none",
        signed: !!rep,
        netSales: rep?.netSales ?? mine.find((l) => l.status === "ok")?.netSales ?? null,
      };
    });
    return {
      store: { id: st.id, name: st.name, timezone: st.timezone },
      connection: c
        ? {
            id: c.id,
            system: c.system,
            method: c.method,
            status: c.status,
            pullAt: c.pullAt,
            sftpUsername: c.settings.sftpUsername ?? "",
            exportId: c.settings.exportId ?? "",
            address: inboundAddress(c.inboundKey),
            uploadUrl: uploadUrl(c.inboundKey, context.headers),
            lastImportAt: c.lastImportAt?.getTime() ?? null,
            lastError: c.lastError,
          }
        : null,
      ready: { toast: toastReady(), inbound: inboundReady() },
      toastPublicKey: toastPublicKey(),
      nights,
      log: log.map((l) => ({ ...l, createdAt: l.createdAt.getTime() })),
    };
  }),

  save: viewerBase
    .input(
      z.object({
        storeId: z.string(),
        system: z.enum(SYSTEM_KEYS),
        method: z.enum(["toast_sftp", "email", "upload", "manual"]),
        pullAt: z.string().regex(/^\d{2}:\d{2}$/),
        status: z.enum(["setup", "live", "paused"]).optional(),
        sftpUsername: z.string().max(120).default(""),
        exportId: z.string().max(60).default(""),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      canSetUp(v, input.storeId);
      if (input.method === "toast_sftp" && input.system !== "toast") throw new ORPCError("BAD_REQUEST", { message: "The nightly SFTP export is a Toast feature." });
      const settings: Record<string, string> = input.method === "toast_sftp" ? { sftpUsername: input.sftpUsername.trim(), exportId: input.exportId.trim() } : {};
      const c = await connFor(input.storeId);
      if (c) {
        await db
          .update(s.posConnections)
          .set({ system: input.system, method: input.method, pullAt: input.pullAt, settings, ...(input.status ? { status: input.status } : {}) })
          .where(eq(s.posConnections.id, c.id));
        return { id: c.id };
      }
      const id = crypto.randomUUID();
      await db.insert(s.posConnections).values({
        id,
        orgId: v.orgId,
        storeId: input.storeId,
        system: input.system,
        method: input.method,
        pullAt: input.pullAt,
        settings,
        inboundKey: newInboundKey(),
        status: input.status ?? "setup",
      });
      return { id };
    }),

  /** A new address and upload link; the old ones stop working at once. */
  rotateKey: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    canSetUp(context.viewer, input.storeId);
    const c = await connFor(input.storeId);
    if (!c) throw new ORPCError("NOT_FOUND");
    await db.update(s.posConnections).set({ inboundKey: newInboundKey() }).where(eq(s.posConnections.id, c.id));
    return { ok: true };
  }),

  test: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    canSetUp(context.viewer, input.storeId);
    const c = await connFor(input.storeId);
    if (!c || c.method !== "toast_sftp") throw new ORPCError("BAD_REQUEST", { message: "Only the Toast export can be tested from here." });
    try {
      return await testToast(c as PosConn);
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }),

  /** Collect one night from Toast now instead of waiting for the nightly run. */
  pullNow: viewerBase.input(z.object({ storeId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).handler(async ({ input, context }) => {
    canSetUp(context.viewer, input.storeId);
    const c = await connFor(input.storeId);
    if (!c || c.method !== "toast_sftp") throw new ORPCError("BAD_REQUEST", { message: "Only the Toast export can be collected from here." });
    try {
      return await pullToast(c, input.date);
    } catch (e) {
      return { ok: false as const, businessDate: input.date, error: e instanceof Error ? e.message : String(e) };
    }
  }),

  /** What the POS sent for a night, for the closing manager to load, review and sign. */
  staged: managerBase.input(z.object({ storeId: z.string(), date: z.string() })).handler(async ({ input, context }) => {
    assertStore(context.viewer, input.storeId);
    const [r] = await db
      .select()
      .from(s.posImports)
      .where(and(eq(s.posImports.storeId, input.storeId), eq(s.posImports.businessDate, input.date), eq(s.posImports.status, "ok")))
      .orderBy(desc(s.posImports.createdAt))
      .limit(1);
    if (!r?.payload) return null;
    const [rep] = await db
      .select({ id: s.shiftReports.id })
      .from(s.shiftReports)
      .where(and(eq(s.shiftReports.storeId, input.storeId), eq(s.shiftReports.businessDate, input.date)))
      .limit(1);
    return { signed: !!rep, id: r.id, source: r.source, rows: r.rows, netSales: r.netSales, message: r.message, csv: r.payload, at: r.createdAt.getTime() };
  }),
};
