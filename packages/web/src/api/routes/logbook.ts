import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase } from "../lib/access";
import { addDays, businessDate } from "../lib/time";
import { presignPut, screenshotUrl } from "../lib/s3";
import { TZ, viewerName } from "../lib/program-access";

type Entry = typeof s.logEntries.$inferSelect;

async function withPhoto(e: Entry) {
  const photoUrl = e.photoKey
    ? e.photoKey.startsWith("demo:")
      ? `/images/log/${e.photoKey.slice(5)}`
      : await screenshotUrl(e.photoKey).catch(() => null)
    : null;
  return { ...e, photoUrl, createdAt: e.createdAt.getTime(), resolvedAt: e.resolvedAt?.getTime() ?? null };
}

export const logbook = {
  list: managerBase
    .input(z.object({ storeId: z.string(), days: z.number().int().min(1).max(120).default(21), kind: z.enum(["note", "maintenance", "incident"]).nullish() }))
    .handler(async ({ input, context }) => {
      assertStore(context.viewer, input.storeId);
      const from = addDays(businessDate(TZ), -input.days);
      const rows = await db
        .select()
        .from(s.logEntries)
        .where(and(eq(s.logEntries.storeId, input.storeId), gte(s.logEntries.businessDate, from)))
        .orderBy(desc(s.logEntries.businessDate), desc(s.logEntries.createdAt));
      // Open maintenance and incidents stay visible however old they are.
      const open = (
        await db.select().from(s.logEntries).where(and(eq(s.logEntries.storeId, input.storeId), eq(s.logEntries.status, "open")))
      ).filter((e) => e.kind !== "note" && e.businessDate < from);
      const all = [...rows, ...open].filter((e) => !input.kind || e.kind === input.kind);
      return Promise.all(all.map(withPhoto));
    }),

  get: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [e] = await db.select().from(s.logEntries).where(eq(s.logEntries.id, input.id));
    if (!e) throw new ORPCError("NOT_FOUND", { message: "Log entry not found." });
    assertStore(context.viewer, e.storeId);
    return withPhoto(e);
  }),

  presign: managerBase
    .input(z.object({ storeId: z.string(), contentType: z.string().regex(/^image\/(png|jpe?g|webp|heic|heif)$/) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      const ext = input.contentType.split("/")[1]!.replace("jpeg", "jpg");
      const key = `log/${v.orgId}/${input.storeId}/${crypto.randomUUID()}.${ext}`;
      return { key, url: await presignPut(key, input.contentType) };
    }),

  create: managerBase
    .input(
      z.object({
        storeId: z.string(),
        shift: z.enum(["lunch", "dinner"]),
        kind: z.enum(["note", "maintenance", "incident"]),
        title: z.string().min(3).max(140),
        body: z.string().max(4000).default(""),
        photoKey: z.string().max(300).nullish(),
        signature: z.string().min(10).max(20000).nullish(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      if (input.kind === "incident" && !input.signature)
        throw new ORPCError("BAD_REQUEST", { message: "Incident reports are signed by the manager on duty." });
      if (input.photoKey && !input.photoKey.startsWith(`log/${v.orgId}/${input.storeId}/`)) throw new ORPCError("BAD_REQUEST");
      const who = viewerName(v);
      const id = crypto.randomUUID();
      await db.insert(s.logEntries).values({
        id,
        orgId: v.orgId,
        storeId: input.storeId,
        businessDate: businessDate(TZ),
        shift: input.shift,
        kind: input.kind,
        title: input.title,
        body: input.body,
        photoKey: input.photoKey ?? null,
        status: input.kind === "note" ? "resolved" : "open",
        authorName: who.name,
        authorRole: who.role,
        signature: input.signature ?? null,
      });
      return { id };
    }),

  resolve: managerBase.input(z.object({ id: z.string(), note: z.string().max(1000).default("") })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [e] = await db.select().from(s.logEntries).where(eq(s.logEntries.id, input.id));
    if (!e) throw new ORPCError("NOT_FOUND");
    assertStore(v, e.storeId);
    await db
      .update(s.logEntries)
      .set({ status: "resolved", resolvedByName: viewerName(v).name, resolvedNote: input.note, resolvedAt: new Date() })
      .where(eq(s.logEntries.id, e.id));
    return { ok: true };
  }),
};
