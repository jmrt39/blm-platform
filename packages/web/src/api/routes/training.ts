import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, viewerBase } from "../lib/access";
import { businessDate, daysBetween } from "../lib/time";
import { certsFor, programFor } from "../lib/program";
import { assertTrainer, canTrain, loadMemberFor, selfMember, TZ, viewerName } from "../lib/program-access";
import { MODULE_BY_SLUG } from "../../shared/library/modules";
import { isManagementRole } from "../../shared/domain";

const sig = z.string().min(10).max(20000);

export const training = {
  /** Store training board: everyone's progress through the library. Trainers and managers. */
  board: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    assertTrainer(v);
    const store = await loadStore(v, input.storeId);
    const today = businessDate(store.timezone);
    const members = (
      await db.select().from(s.members).where(and(eq(s.members.storeId, store.id), eq(s.members.status, "active")))
    )
      .filter((m) => !isManagementRole(m.role))
      .sort((a, b) => a.name.localeCompare(b.name));
    const [program, certs] = await Promise.all([programFor(members), certsFor(members, today)]);
    const grades = await db
      .select()
      .from(s.grades)
      .where(eq(s.grades.storeId, store.id))
      .orderBy(desc(s.grades.approvedAt))
      .limit(12);
    const rows = members.map((m) => ({
      id: m.id,
      name: m.name,
      initials: m.initials,
      role: m.role,
      isTrainer: m.isTrainer,
      tenureDays: daysBetween(m.hireDate, today),
      program: program.get(m.id)!,
      certAlerts: (certs.get(m.id) ?? []).filter((c) => c.required && c.status !== "ok").length,
    }));
    const ready = rows.flatMap((r) =>
      r.program.modules.filter((x) => x.status === "ready").map((x) => ({ memberId: r.id, name: r.name, role: r.role, slug: x.slug })),
    );
    const done = rows.reduce((a, r) => a + r.program.done, 0);
    const total = rows.reduce((a, r) => a + r.program.total, 0);
    return {
      store: { id: store.id, name: store.name },
      rows,
      ready,
      pct: total ? done / total : 0,
      fullySigned: rows.filter((r) => r.program.total && r.program.done === r.program.total).length,
      recentGrades: grades.map(({ graderSignature: _g, traineeSignature: _t, ...g }) => ({ ...g, approvedAt: g.approvedAt.getTime() })),
    };
  }),

  /** One person's training record. Defaults to the signed-in staff member. */
  member: viewerBase.input(z.object({ id: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const m = input.id ? await loadMemberFor(v, input.id) : selfMember(v);
    const today = businessDate(TZ);
    const [program, certs] = await Promise.all([programFor([m]), certsFor([m], today)]);
    const grades = await db.select().from(s.grades).where(eq(s.grades.memberId, m.id)).orderBy(desc(s.grades.approvedAt));
    const attempts = await db
      .select({ id: s.quizAttempts.id, quiz: s.quizAttempts.quiz, score: s.quizAttempts.score, correct: s.quizAttempts.correct, total: s.quizAttempts.total, passed: s.quizAttempts.passed, takenAt: s.quizAttempts.takenAt })
      .from(s.quizAttempts)
      .where(eq(s.quizAttempts.memberId, m.id))
      .orderBy(desc(s.quizAttempts.takenAt));
    return {
      member: { id: m.id, name: m.name, role: m.role, initials: m.initials, storeId: m.storeId, isTrainer: m.isTrainer, hireDate: m.hireDate },
      program: program.get(m.id)!,
      certs: certs.get(m.id) ?? [],
      grades: grades.map((g) => ({ id: g.id, rubric: g.rubric, module: g.module, average: g.average, businessDate: g.businessDate, graderName: g.graderName, approvedAt: g.approvedAt.getTime() })),
      attempts: attempts.map((a) => ({ ...a, takenAt: a.takenAt.getTime() })),
      canTrain: canTrain(v),
      isSelf: v.member?.id === m.id,
    };
  }),

  /** A module's progress for one person (defaults to self), with the sign-off record. */
  module: viewerBase.input(z.object({ slug: z.string(), memberId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const mod = MODULE_BY_SLUG[input.slug];
    if (!mod) throw new ORPCError("NOT_FOUND", { message: "Module not found." });
    const m = input.memberId ? await loadMemberFor(v, input.memberId) : (v.member ?? null);
    if (!m) return { member: null, state: null, progress: null, grades: [], attempts: [], canTrain: canTrain(v), isSelf: false };
    const program = (await programFor([m])).get(m.id)!;
    const state = program.modules.find((x) => x.slug === mod.slug) ?? null;
    const [progress] = await db
      .select()
      .from(s.trainingProgress)
      .where(and(eq(s.trainingProgress.memberId, m.id), eq(s.trainingProgress.module, mod.slug)));
    const grades = mod.rubric
      ? await db
          .select({ id: s.grades.id, average: s.grades.average, businessDate: s.grades.businessDate, graderName: s.grades.graderName })
          .from(s.grades)
          .where(and(eq(s.grades.memberId, m.id), eq(s.grades.rubric, mod.rubric)))
          .orderBy(desc(s.grades.approvedAt))
      : [];
    const attempts = mod.quiz
      ? await db
          .select({ id: s.quizAttempts.id, score: s.quizAttempts.score, takenAt: s.quizAttempts.takenAt })
          .from(s.quizAttempts)
          .where(and(eq(s.quizAttempts.memberId, m.id), eq(s.quizAttempts.quiz, mod.quiz)))
          .orderBy(desc(s.quizAttempts.takenAt))
      : [];
    return {
      member: { id: m.id, name: m.name, role: m.role },
      state,
      progress: progress ? { ...progress, readAt: progress.readAt?.getTime() ?? null, signedOffAt: progress.signedOffAt?.getTime() ?? null, createdAt: undefined } : null,
      grades,
      attempts: attempts.map((a) => ({ ...a, takenAt: a.takenAt.getTime() })),
      canTrain: canTrain(v) && v.member?.id !== m.id,
      isSelf: v.member?.id === m.id,
    };
  }),

  markRead: viewerBase.input(z.object({ slug: z.string() })).handler(async ({ input, context }) => {
    const m = selfMember(context.viewer);
    if (!MODULE_BY_SLUG[input.slug]) throw new ORPCError("NOT_FOUND");
    const [p] = await db
      .select()
      .from(s.trainingProgress)
      .where(and(eq(s.trainingProgress.memberId, m.id), eq(s.trainingProgress.module, input.slug)));
    if (p) {
      if (!p.readAt) await db.update(s.trainingProgress).set({ readAt: new Date() }).where(eq(s.trainingProgress.id, p.id));
    } else
      await db.insert(s.trainingProgress).values({ orgId: m.orgId, storeId: m.storeId, memberId: m.id, module: input.slug, readAt: new Date() });
    return { ok: true };
  }),

  /** Trainer or manager signs a module off once its requirements are met; the trainee countersigns. */
  signOff: viewerBase
    .input(z.object({ memberId: z.string(), slug: z.string(), trainerSignature: sig, traineeSignature: sig, note: z.string().max(1000).default("") }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertTrainer(v);
      const m = await loadMemberFor(v, input.memberId);
      if (v.member?.id === m.id) throw new ORPCError("FORBIDDEN", { message: "You can't sign off your own training." });
      const mod = MODULE_BY_SLUG[input.slug];
      if (!mod) throw new ORPCError("NOT_FOUND");
      const state = (await programFor([m])).get(m.id)?.modules.find((x) => x.slug === mod.slug);
      if (!state) throw new ORPCError("BAD_REQUEST", { message: "This module isn't part of their role." });
      if (state.status === "signed_off") throw new ORPCError("BAD_REQUEST", { message: "Already signed off." });
      if (state.status !== "ready") throw new ORPCError("BAD_REQUEST", { message: `Not ready yet: ${state.needs.join("; ")}.` });
      const who = viewerName(v);
      const patch = {
        signedOffAt: new Date(),
        signedOffById: who.id,
        signedOffByName: who.name,
        signedOffByRole: who.role,
        trainerSignature: input.trainerSignature,
        traineeSignature: input.traineeSignature,
        note: input.note,
      };
      const [p] = await db
        .select()
        .from(s.trainingProgress)
        .where(and(eq(s.trainingProgress.memberId, m.id), eq(s.trainingProgress.module, mod.slug)));
      if (p) await db.update(s.trainingProgress).set(patch).where(eq(s.trainingProgress.id, p.id));
      else await db.insert(s.trainingProgress).values({ orgId: m.orgId, storeId: m.storeId, memberId: m.id, module: mod.slug, readAt: new Date(), ...patch });
      return { ok: true };
    }),
};
