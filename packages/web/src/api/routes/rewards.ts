import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { rewardsBoard } from "../lib/program";
import { viewerName } from "../lib/program-access";
import { REWARD_KEYS } from "../../shared/library/rewards";

export const rewards = {
  /** The eight incentives, with who is eligible or leading for each this period. */
  board: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const store = await loadStore(v, input.storeId);
    const today = businessDate(store.timezone);
    const boards = await rewardsBoard(store, today);
    const history = await db
      .select()
      .from(s.rewardAwards)
      .where(eq(s.rewardAwards.storeId, store.id))
      .orderBy(desc(s.rewardAwards.awardedAt))
      .limit(40);
    return {
      store: { id: store.id, name: store.name, ppaTarget: store.ppaTarget },
      today,
      boards,
      history: history.map((h) => ({ ...h, awardedAt: h.awardedAt.getTime() })),
      canAward: v.level !== "staff",
      meId: v.member?.id ?? null,
    };
  }),

  award: managerBase
    .input(
      z.object({
        storeId: z.string(),
        memberId: z.string(),
        reward: z.enum(REWARD_KEYS),
        period: z.string().min(4).max(20),
        amount: z.number().min(0).max(10000).nullish(),
        note: z.string().max(500).default(""),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const store = await loadStore(v, input.storeId);
      const [m] = await db.select().from(s.members).where(and(eq(s.members.id, input.memberId), eq(s.members.storeId, store.id)));
      if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
      try {
        await db.insert(s.rewardAwards).values({
          orgId: store.orgId,
          storeId: store.id,
          memberId: m.id,
          memberName: m.name,
          reward: input.reward,
          period: input.period,
          amount: input.amount ?? null,
          note: input.note,
          awardedByName: viewerName(v).name,
          awardedAt: new Date(),
        });
      } catch {
        throw new ORPCError("CONFLICT", { message: `${m.name} has already been awarded this for the period.` });
      }
      return { ok: true };
    }),

  revoke: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(s.rewardAwards).where(eq(s.rewardAwards.id, input.id));
    if (!a) throw new ORPCError("NOT_FOUND");
    await loadStore(context.viewer, a.storeId);
    await db.delete(s.rewardAwards).where(eq(s.rewardAwards.id, a.id));
    return { ok: true };
  }),
};
