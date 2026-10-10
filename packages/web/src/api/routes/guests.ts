import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { TZ, viewerName } from "../lib/program-access";
import { FEEDBACK_SOURCES } from "../../shared/program";
import { isManagementRole } from "../../shared/domain";
import { addDays } from "../lib/time";
import { findNames, surveyStats } from "../lib/surveys";
import { respondUrl, themesOf, toneOf, type ReviewLinks } from "../../shared/reviews";
import { guardRecord, logPrivate, wallOpen } from "../lib/privacy";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Row = typeof s.guestFeedback.$inferSelect;
const out = (r: Row, today: string) => ({
  ...r,
  aboveBeyond: !!r.aboveBeyond,
  createdAt: r.createdAt.getTime(),
  taggedAt: r.taggedAt?.getTime() ?? null,
  readAt: r.readAt?.getTime() ?? null,
  respondedAt: r.respondedAt?.getTime() ?? null,
  pinnedToday: r.pinnedOn === today,
  tone: toneOf(r.rating, r.quote),
  themes: themesOf(r.quote),
});

async function loadFeedback(v: Parameters<typeof assertStore>[0], id: string) {
  const [f] = await db.select().from(s.guestFeedback).where(eq(s.guestFeedback.id, id));
  if (!f) throw new ORPCError("NOT_FOUND", { message: "Review not found." });
  assertStore(v, f.storeId);
  return f;
}

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
      const links = Object.fromEntries(
        (await db.select({ id: s.stores.id, reviewLinks: s.stores.reviewLinks }).from(s.stores).where(inArray(s.stores.id, scope))).map((x) => [x.id, (x.reviewLinks ?? {}) as ReviewLinks]),
      );
      // Reviews naming staff are private. With the wall shut: unnamed reviews, tonight's pinned quote, and your own.
      const open = await wallOpen(v);
      const me = v.member?.id;
      const visible = (r: (typeof rows)[number]) => open || !r.memberIds.length || r.pinnedOn === today || (!!me && r.memberIds.every((id) => id === me));
      const picked = rows.filter((r) => !input.memberId || r.memberIds.includes(input.memberId));
      if (open && picked.some((r) => r.memberIds.length)) await logPrivate(v, "reviews", { detail: "Guest reviews", headers: context.headers, dedupeMinutes: 10 });
      return picked.filter(visible).map((r) => ({ ...out(r, today), respondUrl: respondUrl(r.source, r.externalUrl, links[r.storeId]) }));
    }),

  /** The home page card: the latest reviews with who they are tagged to, and the roster to tag from. */
  inbox: managerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (input.storeId) assertStore(v, input.storeId);
    const scope = input.storeId ? [input.storeId] : [...v.storeIds];
    const today = businessDate(TZ);
    // No stores yet: query a scope that matches nothing so the shape stays the same.
    if (!scope.length) scope.push("none");
    const [rows, roster, stores] = await Promise.all([
      db
        .select()
        .from(s.guestFeedback)
        .where(and(inArray(s.guestFeedback.storeId, scope), gte(s.guestFeedback.receivedOn, addDays(today, -60))))
        .orderBy(desc(s.guestFeedback.receivedOn), desc(s.guestFeedback.createdAt))
        .limit(40),
      db
        .select({ id: s.members.id, name: s.members.name, role: s.members.role, storeId: s.members.storeId })
        .from(s.members)
        .where(and(inArray(s.members.storeId, scope), eq(s.members.status, "active"))),
      db.select({ id: s.stores.id, name: s.stores.name, reviewLinks: s.stores.reviewLinks }).from(s.stores).where(inArray(s.stores.id, scope)),
    ]);
    const staff: Record<string, { id: string; name: string; role: string }[]> = {};
    for (const m of roster.sort((a, b) => Number(isManagementRole(a.role)) - Number(isManagementRole(b.role)) || a.name.localeCompare(b.name)))
      (staff[m.storeId] ??= []).push({ id: m.id, name: m.name, role: m.role });
    const storeName = Object.fromEntries(stores.map((x) => [x.id, x.name]));
    const linksOf = Object.fromEntries(stores.map((x) => [x.id, (x.reviewLinks ?? {}) as ReviewLinks]));
    // Reviews naming staff stay behind the wall; tonight's pinned quote is already public at line up.
    const open = await wallOpen(v);
    const hidden = open ? [] : rows.filter((r) => r.memberIds.length && r.pinnedOn !== today);
    if (open && rows.some((r) => r.memberIds.length)) await logPrivate(v, "reviews", { detail: "Guest feedback inbox", headers: context.headers, dedupeMinutes: 10 });
    // The average counts every review; only the words of ones naming staff stay private.
    const rated = rows.filter((r) => r.rating != null);
    const toneAll = { loved: 0, opportunity: 0, hiddenLoved: 0, hiddenOpportunity: 0 };
    const hiddenIds = new Set(hidden.map((r) => r.id));
    for (const r of rows) {
      const tone = toneOf(r.rating, r.quote);
      if (tone === "loved") {
        toneAll.loved++;
        if (hiddenIds.has(r.id)) toneAll.hiddenLoved++;
      } else if (tone === "opportunity") {
        toneAll.opportunity++;
        if (hiddenIds.has(r.id)) toneAll.hiddenOpportunity++;
      }
    }
    if (hidden.length) {
      const drop = new Set(hidden.map((r) => r.id));
      for (let i = rows.length - 1; i >= 0; i--) if (drop.has(rows[i]!.id)) rows.splice(i, 1);
    }
    const items = rows.map((r) => ({ ...out(r, today), storeName: storeName[r.storeId] ?? "", respondUrl: respondUrl(r.source, r.externalUrl, linksOf[r.storeId]) }));
    const opps = items.filter((f) => f.tone === "opportunity");
    const themeCount: Record<string, number> = {};
    for (const f of opps) for (const t of f.themes) themeCount[t] = (themeCount[t] ?? 0) + 1;
    return {
      items,
      loved: items.length - opps.length,
      opportunities: opps.length,
      themes: Object.entries(themeCount)
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => ({ key, n })),
      /** Platform reviews still waiting on a reply, worst first. */
      toRespond: items.filter((f) => f.respondUrl && !f.respondedAt).length,
      opportunitiesToRespond: opps.filter((f) => f.respondUrl && !f.respondedAt).length,
      unread: rows.filter((r) => !r.readAt).length,
      needsLook: rows.filter((r) => r.tagSource === "auto" && r.matches.some((m) => m.how === "guess")).length,
      stars: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 10) / 10 : null,
      rated: rated.length,
      staff,
      today,
      /** Reviews naming staff kept back until private records are open. */
      hiddenNamed: hidden.length,
      /** Loved and to improve across every review, private ones included, and how many of each are private. */
      toneAll,
    };
  }),

  /** Set who a review counts for. Replaces the automatic tag; the newly tagged colleagues are notified. */
  tag: managerBase.input(z.object({ id: z.string(), memberIds: z.array(z.string()).max(8) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const f = await loadFeedback(v, input.id);
    const ms = input.memberIds.length
      ? await db
          .select({ id: s.members.id, name: s.members.name })
          .from(s.members)
          .where(and(inArray(s.members.id, input.memberIds), eq(s.members.storeId, f.storeId)))
      : [];
    const ordered = input.memberIds.map((id) => ms.find((m) => m.id === id)).filter((m): m is { id: string; name: string } => !!m);
    await db
      .update(s.guestFeedback)
      .set({
        memberIds: ordered.map((m) => m.id),
        memberNames: ordered.map((m) => m.name),
        tagSource: "manager",
        taggedByName: viewerName(v).name,
        taggedAt: new Date(),
        readAt: f.readAt ?? new Date(),
        // Anyone newly tagged hears about it, even if they saw an earlier automatic tag.
        seenBy: f.seenBy.filter((id) => f.memberIds.includes(id) && ordered.some((m) => m.id === id)),
      })
      .where(eq(s.guestFeedback.id, f.id));
    return { ok: true };
  }),

  /** A manager replied on the platform (in the new tab). Optional note of what was said or offered. */
  respond: managerBase.input(z.object({ id: z.string(), done: z.boolean(), note: z.string().max(1000).default("") })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const f = await loadFeedback(v, input.id);
    await db
      .update(s.guestFeedback)
      .set(
        input.done
          ? { respondedAt: new Date(), respondedByName: viewerName(v).name, responseNote: input.note.trim() || null, readAt: f.readAt ?? new Date() }
          : { respondedAt: null, respondedByName: null, responseNote: null },
      )
      .where(eq(s.guestFeedback.id, f.id));
    return { ok: true };
  }),

  /**
   * Bring in reviews exported from Google, Yelp, OpenTable, Tripadvisor or Resy (or copied by hand).
   * Names are found in the text as usual. A review already in (same platform id, or same platform and words) is skipped.
   */
  import: managerBase
    .input(
      z.object({
        storeId: z.string(),
        rows: z
          .array(
            z.object({
              source: z.enum(FEEDBACK_SOURCES),
              receivedOn: date,
              rating: z.number().int().min(1).max(5).nullish(),
              guestName: z.string().max(80).default(""),
              quote: z.string().min(8).max(4000),
              externalUrl: z
                .string()
                .max(1000)
                .refine((x) => !x || /^https?:\/\//i.test(x), "Links start with https://")
                .nullish(),
              externalId: z.string().max(200).nullish(),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      const have = await db
        .select({ source: s.guestFeedback.source, quote: s.guestFeedback.quote, externalId: s.guestFeedback.externalId })
        .from(s.guestFeedback)
        .where(eq(s.guestFeedback.storeId, input.storeId));
      const ids = new Set(have.filter((h) => h.externalId).map((h) => `${h.source}|${h.externalId}`));
      const words = new Set(have.map((h) => `${h.source}|${h.quote.trim().toLowerCase()}`));
      const who = viewerName(v).name;
      let added = 0,
        skipped = 0,
        tagged = 0;
      for (const r of input.rows) {
        const q = r.quote.trim();
        if ((r.externalId && ids.has(`${r.source}|${r.externalId}`)) || words.has(`${r.source}|${q.toLowerCase()}`)) {
          skipped++;
          continue;
        }
        const matches = await findNames(input.storeId, q, r.receivedOn);
        await db.insert(s.guestFeedback).values({
          orgId: v.orgId,
          storeId: input.storeId,
          source: r.source,
          guestName: r.guestName,
          rating: r.rating ?? null,
          quote: q,
          receivedOn: r.receivedOn,
          memberIds: matches.map((m) => m.memberId),
          memberNames: matches.map((m) => m.name),
          matches,
          tagSource: matches.length ? "auto" : null,
          taggedAt: matches.length ? new Date() : null,
          recordedByName: `${who} (import)`,
          externalUrl: r.externalUrl || null,
          externalId: r.externalId || null,
        });
        if (r.externalId) ids.add(`${r.source}|${r.externalId}`);
        words.add(`${r.source}|${q.toLowerCase()}`);
        added++;
        if (matches.length) tagged++;
      }
      return { added, skipped, tagged };
    }),

  /** Mark reviews read on the home page. */
  read: managerBase.input(z.object({ ids: z.array(z.string()).max(100) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (!input.ids.length) return { ok: true };
    await db
      .update(s.guestFeedback)
      .set({ readAt: new Date() })
      .where(and(inArray(s.guestFeedback.id, input.ids), inArray(s.guestFeedback.storeId, v.storeIds)));
    return { ok: true };
  }),

  /** Mark or unmark a review for the quarterly Above and beyond reward. */
  aboveBeyond: managerBase.input(z.object({ id: z.string(), on: z.boolean() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const f = await loadFeedback(v, input.id);
    await db
      .update(s.guestFeedback)
      .set({ aboveBeyond: input.on, aboveBeyondByName: input.on ? viewerName(v).name : null, readAt: f.readAt ?? new Date() })
      .where(eq(s.guestFeedback.id, f.id));
    return { ok: true };
  }),

  /** One colleague's surveys and guest star rating. Staff see their own; managers anyone at their stores. */
  mine: viewerBase.input(z.object({ memberId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const id = input.memberId ?? v.member?.id;
    if (!id) throw new ORPCError("BAD_REQUEST", { message: "Sign in with your PIN to see your surveys." });
    if (v.level === "staff" && id !== v.member?.id) throw new ORPCError("FORBIDDEN", { message: "You can only see your own surveys." });
    const [m] = await db.select().from(s.members).where(eq(s.members.id, id));
    if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
    assertStore(v, m.storeId);
    await guardRecord(v, "reviews", m.id, context.headers);
    const today = businessDate(TZ);
    const rows = (
      await db
        .select()
        .from(s.guestFeedback)
        .where(and(eq(s.guestFeedback.storeId, m.storeId), gte(s.guestFeedback.receivedOn, addDays(today, -365))))
        .orderBy(desc(s.guestFeedback.receivedOn), desc(s.guestFeedback.createdAt))
    ).filter((r) => r.memberIds.includes(m.id));
    const isSelf = v.member?.id === m.id;
    return {
      member: { id: m.id, name: m.name, role: m.role },
      isSelf,
      today,
      ...surveyStats(rows, m.id, today),
      items: rows.slice(0, 100).map((r) => ({ ...out(r, today), unseen: !r.seenBy.includes(m.id) && (r.taggedAt?.getTime() ?? 0) > Date.now() - 60 * 86400000 })),
    };
  }),

  /** The colleague has seen their new tags. */
  ack: viewerBase.input(z.object({ ids: z.array(z.string()).max(100) })).handler(async ({ input, context }) => {
    const me = context.viewer.member;
    if (!me || !input.ids.length) return { ok: true };
    const rows = await db
      .select({ id: s.guestFeedback.id, memberIds: s.guestFeedback.memberIds, seenBy: s.guestFeedback.seenBy })
      .from(s.guestFeedback)
      .where(and(inArray(s.guestFeedback.id, input.ids), eq(s.guestFeedback.storeId, me.storeId)));
    for (const r of rows)
      if (r.memberIds.includes(me.id) && !r.seenBy.includes(me.id))
        await db.update(s.guestFeedback).set({ seenBy: [...r.seenBy, me.id] }).where(eq(s.guestFeedback.id, r.id));
    return { ok: true };
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
        aboveBeyond: z.boolean().default(false),
        externalUrl: z
          .string()
          .max(1000)
          .refine((x) => !x || /^https?:\/\//i.test(x), "Links start with https://")
          .nullish(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      // Nobody picked: find the names in the text. A manager can change it later.
      const matches = await findNames(input.storeId, input.quote, input.receivedOn);
      const auto = !input.memberIds.length;
      if (auto) input.memberIds = matches.map((m) => m.memberId);
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
        matches,
        tagSource: ms.length ? (auto ? "auto" : "manager") : null,
        taggedByName: ms.length && !auto ? who.name : null,
        taggedAt: ms.length ? new Date() : null,
        readAt: new Date(),
        aboveBeyond: input.aboveBeyond,
        aboveBeyondByName: input.aboveBeyond ? who.name : null,
        externalUrl: input.externalUrl || null,
      });
      return { id, tagged: ms.map((m) => m.name), auto };
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
