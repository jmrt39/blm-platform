import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { TZ, viewerName } from "../lib/program-access";
import { FEEDBACK_SOURCES } from "../../shared/program";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const guests = {
  /** Guest quotes for the viewer's stores, newest first. Optionally only those naming one colleague. */
  list: viewerBase
    .input(z.object({ storeId: z.string().nullish(), memberId: z.string().nullish(), limit: z.number().int().min(1).max(300).default(120) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      if (input.storeId) assertStore(v, input.storeId);
      const scope = input.storeId ? [input.storeId] : v.storeIds;
      if (!scope.length) return [];
      const rows = await db
        .select()
        .from(s.guestFeedback)
        .where(inArray(s.guestFeedback.storeId, scope))
        .orderBy(desc(s.guestFeedback.receivedOn), desc(s.guestFeedback.createdAt))
        .limit(input.limit);
      const today = businessDate(TZ);
      return rows
        .filter((r) => !input.memberId || r.memberIds.includes(input.memberId))
        .map((r) => ({ ...r, createdAt: r.createdAt.getTime(), pinnedToday: r.pinnedOn === today }));
    }),

  create: managerBase
    .input(
      z.object({
        storeId: z.string(),
        source: z.enum(FEEDBACK_SOURCES),
        guestName: z.string().max(80).default(""),
        rating: z.number().int().min(1).max(5).nullish(),
        quote: z.string().min(8).max(2000),
        receivedOn: date,
        memberIds: z.array(z.string()).max(8).default([]),
        pin: z.boolean().default(false),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      const ms = input.memberIds.length
        ? await db
            .select({ id: s.members.id, name: s.members.name, storeId: s.members.storeId })
            .from(s.members)
            .where(and(inArray(s.members.id, input.memberIds), eq(s.members.storeId, input.storeId)))
        : [];
      const who = viewerName(v);
      const id = crypto.randomUUID();
      await db.insert(s.guestFeedback).values({
        id,
        orgId: v.orgId,
        storeId: input.storeId,
        source: input.source,
        guestName: input.guestName,
        rating: input.rating ?? null,
        quote: input.quote.trim(),
        receivedOn: input.receivedOn,
        memberIds: ms.map((m) => m.id),
        memberNames: ms.map((m) => m.name),
        pinnedOn: input.pin ? businessDate(TZ) : null,
        pinnedByName: input.pin ? who.name : null,
        recordedByName: who.name,
      });
      return { id };
    }),

  /** Pin a quote to today's pre-shift line-up (one pinned quote per store per day). */
  pin: managerBase.input(z.object({ id: z.string(), pinned: z.boolean() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [f] = await db.select().from(s.guestFeedback).where(eq(s.guestFeedback.id, input.id));
    if (!f) throw new ORPCError("NOT_FOUND");
    assertStore(v, f.storeId);
    const today = businessDate(TZ);
    if (input.pinned) {
      await db
        .update(s.guestFeedback)
        .set({ pinnedOn: null, pinnedByName: null })
        .where(and(eq(s.guestFeedback.storeId, f.storeId), eq(s.guestFeedback.pinnedOn, today)));
      await db.update(s.guestFeedback).set({ pinnedOn: today, pinnedByName: viewerName(v).name }).where(eq(s.guestFeedback.id, f.id));
    } else await db.update(s.guestFeedback).set({ pinnedOn: null, pinnedByName: null }).where(eq(s.guestFeedback.id, f.id));
    return { ok: true };
  }),

  remove: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [f] = await db.select().from(s.guestFeedback).where(eq(s.guestFeedback.id, input.id));
    if (!f) throw new ORPCError("NOT_FOUND");
    assertStore(context.viewer, f.storeId);
    await db.delete(s.guestFeedback).where(eq(s.guestFeedback.id, f.id));
    return { ok: true };
  }),
};
