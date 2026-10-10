import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { assertTrainer, loadMemberFor, TZ, viewerName } from "../lib/program-access";
import { RUBRIC_BY_SLUG, gradeAverage } from "../../shared/library/rubrics";

const sig = z.string().min(10).max(20000);

export const grading = {
  /** Approve a graded exercise. Stars for every criterion, the grader's signature, and the trainee's for skills checks. */
  create: viewerBase
    .input(
      z.object({
        memberId: z.string(),
        rubric: z.string(),
        scores: z.record(z.string(), z.number().int().min(1).max(5)),
        notes: z.record(z.string(), z.string().max(600)).default({}),
        summary: z.string().max(2000).default(""),
        tableNo: z.string().max(20).default(""),
        graderSignature: sig,
        traineeSignature: sig.nullish(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertTrainer(v);
      const m = await loadMemberFor(v, input.memberId);
      if (v.member?.id === m.id) throw new ORPCError("FORBIDDEN", { message: "You can't grade yourself." });
      const r = RUBRIC_BY_SLUG[input.rubric];
      if (!r) throw new ORPCError("NOT_FOUND", { message: "Rubric not found." });
      const missing = r.criteria.filter((c) => !input.scores[c.key]);
      if (missing.length) throw new ORPCError("BAD_REQUEST", { message: `Score every competency: ${missing.map((c) => c.label).join(", ")}.` });
      if (r.kind === "skill" && !input.traineeSignature)
        throw new ORPCError("BAD_REQUEST", { message: "Skills checks are signed by the grader and the trainee." });
      const scores = Object.fromEntries(r.criteria.map((c) => [c.key, input.scores[c.key]!]));
      const who = viewerName(v);
      const id = crypto.randomUUID();
      await db.insert(s.grades).values({
        id,
        orgId: m.orgId,
        storeId: m.storeId,
        memberId: m.id,
        memberName: m.name,
        memberRole: m.role,
        rubric: r.slug,
        module: r.module,
        businessDate: businessDate(TZ),
        tableNo: input.tableNo,
        scores,
        notes: Object.fromEntries(Object.entries(input.notes).filter(([k, n]) => n.trim() && k in scores)),
        summary: input.summary,
        average: gradeAverage(scores),
        graderId: who.id,
        graderName: who.name,
        graderRole: who.role,
        graderSignature: input.graderSignature,
        traineeSignature: input.traineeSignature ?? null,
        approvedAt: new Date(),
      });
      return { id };
    }),

  list: viewerBase
    .input(z.object({ storeId: z.string(), memberId: z.string().nullish(), limit: z.number().int().min(1).max(200).default(60) }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      assertStore(v, input.storeId);
      if (input.memberId) await loadMemberFor(v, input.memberId);
      else assertTrainer(v);
      const rows = await db
        .select()
        .from(s.grades)
        .where(input.memberId ? and(eq(s.grades.storeId, input.storeId), eq(s.grades.memberId, input.memberId)) : eq(s.grades.storeId, input.storeId))
        .orderBy(desc(s.grades.approvedAt))
        .limit(input.limit);
      return rows.map(({ graderSignature: _g, traineeSignature: _t, ...g }) => ({ ...g, approvedAt: g.approvedAt.getTime() }));
    }),

  get: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [g] = await db.select().from(s.grades).where(eq(s.grades.id, input.id));
    if (!g) throw new ORPCError("NOT_FOUND");
    await loadMemberFor(v, g.memberId);
    return { ...g, approvedAt: g.approvedAt.getTime() };
  }),

  /** Competency averages for a store — where the floor is strong and where it needs coaching. */
  competencies: viewerBase.input(z.object({ storeIds: z.array(z.string()).min(1) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    assertTrainer(v);
    for (const id of input.storeIds) assertStore(v, id);
    const rows = await db
      .select({ scores: s.grades.scores, storeId: s.grades.storeId })
      .from(s.grades)
      .where(and(inArray(s.grades.storeId, input.storeIds), eq(s.grades.rubric, "floor-service")));
    const r = RUBRIC_BY_SLUG["floor-service"]!;
    return r.criteria.map((c) => {
      const vals = rows.map((x) => x.scores[c.key]).filter((n): n is number => typeof n === "number");
      return { key: c.key, label: c.label, average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
    });
  }),
};
