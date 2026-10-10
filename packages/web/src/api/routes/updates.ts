import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { businessDate } from "../lib/time";
import { selfMember, TZ, viewerName } from "../lib/program-access";
import { PASS_MARK, UPDATE_KINDS, seasonOf } from "../../shared/program";
import { isManagementRole } from "../../shared/domain";

const kindEnum = z.enum(Object.keys(UPDATE_KINDS) as [keyof typeof UPDATE_KINDS, ...(keyof typeof UPDATE_KINDS)[]]);

type Update = typeof s.updates.$inferSelect;

function visibleTo(v: Viewer, u: Update) {
  if (u.orgId !== v.orgId || !u.storeIds.some((id) => v.storeIds.includes(id))) return false;
  if (v.member && !isManagementRole(v.member.role) && u.roles.length && !u.roles.includes(v.member.role)) return false;
  return true;
}

async function audience(u: Update, storeIds: string[]) {
  const ms = await db
    .select({ id: s.members.id, name: s.members.name, role: s.members.role, initials: s.members.initials, storeId: s.members.storeId })
    .from(s.members)
    .where(and(inArray(s.members.storeId, storeIds), eq(s.members.status, "active")));
  return ms.filter((m) => !isManagementRole(m.role) && (!u.roles.length || u.roles.includes(m.role)));
}

export const updates = {
  list: viewerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (input.storeId) assertStore(v, input.storeId);
    const scope = input.storeId ? [input.storeId] : v.storeIds;
    const rows = (await db.select().from(s.updates).where(eq(s.updates.orgId, v.orgId)).orderBy(desc(s.updates.publishedAt))).filter(
      (u) => visibleTo(v, u) && u.storeIds.some((id) => scope.includes(id)),
    );
    const ids = rows.map((r) => r.id);
    const reads = ids.length ? await db.select().from(s.updateReads).where(inArray(s.updateReads.updateId, ids)) : [];
    const attempts = ids.length
      ? await db.select({ updateId: s.quizAttempts.updateId, memberId: s.quizAttempts.memberId, passed: s.quizAttempts.passed, score: s.quizAttempts.score }).from(s.quizAttempts).where(inArray(s.quizAttempts.updateId, ids))
      : [];
    const isManager = v.level !== "staff";
    const people = isManager
      ? await db
          .select({ id: s.members.id, role: s.members.role, storeId: s.members.storeId })
          .from(s.members)
          .where(and(inArray(s.members.storeId, scope), eq(s.members.status, "active")))
      : [];
    return rows.map((u) => {
      const aud = people.filter((p) => u.storeIds.includes(p.storeId) && !isManagementRole(p.role) && (!u.roles.length || u.roles.includes(p.role)));
      const audIds = new Set(aud.map((a) => a.id));
      const myAttempts = v.member ? attempts.filter((a) => a.updateId === u.id && a.memberId === v.member!.id) : [];
      return {
        id: u.id,
        season: u.season,
        kind: u.kind,
        title: u.title,
        body: u.body,
        items: u.items,
        roles: u.roles,
        storeIds: u.storeIds,
        quizCount: u.quiz.length,
        authorName: u.authorName,
        authorRole: u.authorRole,
        publishedAt: u.publishedAt.getTime(),
        read: v.member ? reads.some((r) => r.updateId === u.id && r.memberId === v.member!.id) : null,
        quizBest: myAttempts.length ? Math.max(...myAttempts.map((a) => a.score)) : null,
        audience: aud.length,
        readCount: reads.filter((r) => r.updateId === u.id && audIds.has(r.memberId)).length,
        passedCount: new Set(attempts.filter((a) => a.updateId === u.id && a.passed && audIds.has(a.memberId)).map((a) => a.memberId)).size,
      };
    });
  }),

  get: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [u] = await db.select().from(s.updates).where(eq(s.updates.id, input.id));
    if (!u || !visibleTo(v, u)) throw new ORPCError("NOT_FOUND", { message: "Update not found." });
    const reads = await db.select().from(s.updateReads).where(eq(s.updateReads.updateId, u.id));
    const attempts = u.quiz.length ? await db.select().from(s.quizAttempts).where(eq(s.quizAttempts.updateId, u.id)) : [];
    const isManager = v.level !== "staff";
    const aud = isManager ? await audience(u, u.storeIds.filter((id) => v.storeIds.includes(id))) : [];
    const myAttempts = v.member ? attempts.filter((a) => a.memberId === v.member!.id) : [];
    return {
      id: u.id,
      season: u.season,
      kind: u.kind,
      title: u.title,
      body: u.body,
      items: u.items,
      roles: u.roles,
      quizCount: u.quiz.length,
      authorName: u.authorName,
      authorRole: u.authorRole,
      publishedAt: u.publishedAt.getTime(),
      read: v.member ? reads.some((r) => r.memberId === v.member!.id) : null,
      quizBest: myAttempts.length ? Math.max(...myAttempts.map((a) => a.score)) : null,
      passMark: PASS_MARK,
      receipts: aud
        .map((m) => {
          const r = reads.find((x) => x.memberId === m.id);
          const as = attempts.filter((a) => a.memberId === m.id);
          return {
            ...m,
            readAt: r?.readAt.getTime() ?? null,
            quizBest: as.length ? Math.max(...as.map((a) => a.score)) : null,
          };
        })
        .sort((a, b) => Number(!!b.readAt) - Number(!!a.readAt) || a.name.localeCompare(b.name)),
    };
  }),

  create: managerBase
    .input(
      z.object({
        storeIds: z.array(z.string()).min(1),
        kind: kindEnum,
        title: z.string().min(3).max(140),
        body: z.string().max(4000).default(""),
        items: z.array(z.object({ name: z.string().min(1).max(120), detail: z.string().max(400) })).max(30).default([]),
        roles: z.array(z.string()).default([]),
        quiz: z
          .array(z.object({ q: z.string().min(3).max(300), choices: z.array(z.string().min(1).max(160)).min(2).max(5), answer: z.number().int().min(0), why: z.string().max(300).default("") }))
          .max(15)
          .default([]),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      for (const id of input.storeIds) assertStore(v, id);
      for (const q of input.quiz)
        if (q.answer >= q.choices.length) throw new ORPCError("BAD_REQUEST", { message: `Pick the right answer for “${q.q}”.` });
      const id = crypto.randomUUID();
      const who = viewerName(v);
      await db.insert(s.updates).values({
        id,
        orgId: v.orgId,
        storeIds: input.storeIds,
        season: seasonOf(businessDate(TZ)),
        kind: input.kind,
        title: input.title,
        body: input.body,
        items: input.items,
        roles: input.roles,
        quiz: input.quiz.map((q, i) => ({ id: `${id.slice(0, 8)}-${i + 1}`, ...q })),
        authorName: who.name,
        authorRole: who.role,
        publishedAt: new Date(),
      });
      return { id };
    }),

  markRead: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const m = selfMember(v);
    const [u] = await db.select().from(s.updates).where(eq(s.updates.id, input.id));
    if (!u || !visibleTo(v, u)) throw new ORPCError("NOT_FOUND");
    await db.insert(s.updateReads).values({ updateId: u.id, memberId: m.id, readAt: new Date() }).onConflictDoNothing();
    return { ok: true };
  }),
};
