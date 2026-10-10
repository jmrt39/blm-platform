import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, type Viewer } from "./access";

export const TZ = "America/New_York";

/** Managers, leadership, and staff flagged as trainers can grade and sign off. */
export const canTrain = (v: Viewer) => v.level !== "staff" || !!v.member?.isTrainer;

export function assertTrainer(v: Viewer) {
  if (!canTrain(v)) throw new ORPCError("FORBIDDEN", { message: "Only trainers and managers can do that." });
}

/** A roster member the viewer may see: their own record, or anyone at their stores if they manage/train. */
export async function loadMemberFor(v: Viewer, id: string) {
  const [m] = await db.select().from(s.members).where(eq(s.members.id, id));
  if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
  assertStore(v, m.storeId);
  if (v.level === "staff" && v.member?.id !== m.id && !v.member?.isTrainer)
    throw new ORPCError("FORBIDDEN", { message: "You can only see your own record." });
  return m;
}

export function viewerName(v: Viewer) {
  return { id: v.member?.id ?? v.user?.id ?? null, name: v.member?.name ?? v.accessName, role: v.member?.role ?? v.accessRole };
}

/** The staff member taking an action on themselves. */
export function selfMember(v: Viewer) {
  if (!v.member) throw new ORPCError("BAD_REQUEST", { message: "Open your store and sign in with your PIN to do this." });
  return v.member;
}
