import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { selfMember } from "../lib/program-access";
import { PASS_MARK, SELLERS, type Question } from "../../shared/program";
import { scoreQuiz } from "../../shared/library/quizzes";
import type { LibraryIndex } from "../../shared/library/standard";
import { loadLibrary } from "../lib/library";
import { isManagementRole, onboardingLink } from "../../shared/domain";

type QuizDef = {
  slug: string;
  title: string;
  level: "Core" | "Advanced" | "Update";
  kind: "knowledge" | "pos" | "update";
  module: string | null;
  updateId: string | null;
  questions: Question[];
};

async function updatesFor(storeIds: string[], orgId: string) {
  const rows = await db.select().from(s.updates).where(eq(s.updates.orgId, orgId)).orderBy(desc(s.updates.publishedAt));
  return rows.filter((u) => u.quiz.length && u.storeIds.some((id) => storeIds.includes(id)));
}

async function loadQuiz(v: Viewer, lib: LibraryIndex, slug: string): Promise<QuizDef> {
  if (slug.startsWith("u:")) {
    const [u] = await db.select().from(s.updates).where(eq(s.updates.id, slug.slice(2)));
    if (!u || u.orgId !== v.orgId || !u.storeIds.some((id) => v.storeIds.includes(id)) || !u.quiz.length)
      throw new ORPCError("NOT_FOUND", { message: "Quiz not found." });
    return { slug, title: u.title, level: "Update", kind: "update", module: null, updateId: u.id, questions: u.quiz };
  }
  const q = lib.quizBySlug[slug];
  if (!q) throw new ORPCError("NOT_FOUND", { message: "Quiz not found." });
  return { slug, title: q.title, level: q.level, kind: q.kind ?? "knowledge", module: q.module ?? null, updateId: null, questions: q.questions };
}

export const quizzes = {
  /** Knowledge checks for the viewer, with their best score on each. */
  list: viewerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const storeIds = input.storeId ? [input.storeId] : v.storeIds;
    for (const id of storeIds) assertStore(v, id);
    const me = v.member;
    const ups = await updatesFor(storeIds, v.orgId);
    const lib = await loadLibrary(v.orgId);
    const role = me?.role ?? null;
    const mine = lib.quizzesFor(role, !role || isManagementRole(role), SELLERS);
    const defs: QuizDef[] = [
      ...ups
        .filter((u) => !me || !u.roles.length || u.roles.includes(me.role))
        .map((u) => ({ slug: `u:${u.id}`, title: u.title, level: "Update" as const, kind: "update" as const, module: null, updateId: u.id, questions: u.quiz })),
      ...mine.map((q) => ({ slug: q.slug, title: q.title, level: q.level, kind: q.kind ?? ("knowledge" as const), module: q.module ?? null, updateId: null, questions: q.questions })),
    ];
    const attempts = me
      ? await db.select().from(s.quizAttempts).where(eq(s.quizAttempts.memberId, me.id))
      : await db.select().from(s.quizAttempts).where(inArray(s.quizAttempts.storeId, storeIds));
    return defs.map((d) => {
      const a = attempts.filter((x) => x.quiz === d.slug);
      const mine = me ? a : [];
      const best = mine.length ? Math.max(...mine.map((x) => x.score)) : null;
      const people = new Set(a.map((x) => x.memberId));
      const passedPeople = new Set(a.filter((x) => x.passed).map((x) => x.memberId));
      return {
        slug: d.slug,
        title: d.title,
        level: d.level,
        kind: d.kind,
        module: d.module,
        moduleTitle: d.module ? (lib.moduleBySlug[d.module]?.title ?? null) : null,
        updateId: d.updateId,
        count: d.questions.length,
        attempts: mine.length,
        best,
        passed: best != null && best >= PASS_MARK,
        lastAt: mine.length ? Math.max(...mine.map((x) => x.takenAt.getTime())) : null,
        storeTakers: people.size,
        storePassed: passedPeople.size,
        storeAvg: a.length ? a.reduce((t, x) => t + x.score, 0) / a.length : null,
      };
    });
  }),

  /** Questions without answers, for taking the quiz. */
  get: viewerBase.input(z.object({ slug: z.string() })).handler(async ({ input, context }) => {
    const lib = await loadLibrary(context.viewer.orgId);
    const d = await loadQuiz(context.viewer, lib, input.slug);
    return {
      slug: d.slug,
      title: d.title,
      level: d.level,
      module: d.module,
      kind: d.kind,
      moduleTitle: d.module ? (lib.moduleBySlug[d.module]?.title ?? null) : null,
      passMark: PASS_MARK,
      questions: d.questions.map((q) => ({ id: q.id, q: q.q, choices: q.choices })),
    };
  }),

  submit: viewerBase
    .input(z.object({ slug: z.string(), answers: z.record(z.string(), z.number().int().min(0).max(10)) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const m = selfMember(v);
      const d = await loadQuiz(v, await loadLibrary(v.orgId), input.slug);
      const unanswered = d.questions.filter((q) => input.answers[q.id] == null).length;
      if (unanswered) throw new ORPCError("BAD_REQUEST", { message: `Answer every question (${unanswered} left).` });
      const score = scoreQuiz(d.questions, input.answers);
      const correct = d.questions.filter((q) => input.answers[q.id] === q.answer).length;
      const passed = score >= PASS_MARK;
      await db.insert(s.quizAttempts).values({
        orgId: m.orgId,
        storeId: m.storeId,
        memberId: m.id,
        memberName: m.name,
        quiz: d.slug,
        updateId: d.updateId,
        answers: input.answers,
        correct,
        total: d.questions.length,
        score,
        passed,
        takenAt: new Date(),
      });
      let onboardingTicked = 0;
      if (passed) {
        const open = await db
          .select()
          .from(s.onboardingItems)
          .where(and(eq(s.onboardingItems.memberId, m.id), isNull(s.onboardingItems.completedAt)));
        const ids = open.filter((o) => onboardingLink(o.title)?.quiz === d.slug).map((o) => o.id);
        if (ids.length) {
          await db
            .update(s.onboardingItems)
            .set({ completedAt: new Date(), completedBy: `Passed the check · ${Math.round(score * 100)}%` })
            .where(inArray(s.onboardingItems.id, ids));
          onboardingTicked = ids.length;
        }
      }
      return {
        onboardingTicked,
        score,
        correct,
        total: d.questions.length,
        passed,
        review: d.questions.map((q) => ({ id: q.id, q: q.q, choices: q.choices, answer: q.answer, chose: input.answers[q.id]!, why: q.why, see: q.see ?? null })),
      };
    }),

  /** Manager view: pass rates, the questions the team gets wrong, and recent attempts. */
  results: managerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    assertStore(v, input.storeId);
    const attempts = await db
      .select()
      .from(s.quizAttempts)
      .where(eq(s.quizAttempts.storeId, input.storeId))
      .orderBy(desc(s.quizAttempts.takenAt));
    const ups = await updatesFor([input.storeId], v.orgId);
    const qIndex = new Map<string, { quiz: string; title: string; q: Question }>();
    const lib = await loadLibrary(v.orgId);
    for (const quiz of lib.lib.quizzes) for (const q of quiz.questions) qIndex.set(q.id, { quiz: quiz.slug, title: quiz.title, q });
    for (const u of ups) for (const q of u.quiz) qIndex.set(q.id, { quiz: `u:${u.id}`, title: u.title, q });
    const miss = new Map<string, { right: number; n: number }>();
    for (const a of attempts)
      for (const [qid, chose] of Object.entries(a.answers)) {
        const meta = qIndex.get(qid);
        if (!meta) continue;
        const t = miss.get(qid) ?? { right: 0, n: 0 };
        t.n += 1;
        if (chose === meta.q.answer) t.right += 1;
        miss.set(qid, t);
      }
    const hardest = [...miss.entries()]
      .filter(([, t]) => t.n >= 3)
      .map(([qid, t]) => {
        const meta = qIndex.get(qid)!;
        return { id: qid, quiz: meta.quiz, quizTitle: meta.title, q: meta.q.q, answer: meta.q.choices[meta.q.answer]!, rate: t.right / t.n, n: t.n };
      })
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8);
    return {
      hardest,
      recent: attempts.slice(0, 25).map((a) => ({
        id: a.id,
        memberId: a.memberId,
        memberName: a.memberName,
        quiz: a.quiz,
        title: a.quiz.startsWith("u:") ? (ups.find((u) => `u:${u.id}` === a.quiz)?.title ?? "Update") : (lib.quizBySlug[a.quiz]?.title ?? a.quiz),
        score: a.score,
        passed: a.passed,
        takenAt: a.takenAt.getTime(),
      })),
    };
  }),
};
