import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";

/** Base URL for links in mail: the page the request came from, else the configured site. */
export function appOrigin(headers?: Headers | null) {
  const o = headers?.get("origin");
  if (o && /^https?:\/\//.test(o)) return o.replace(/\/$/, "");
  return (process.env.WEBSITE_URL || "http://localhost:4200").replace(/\/$/, "");
}

/**
 * The invited person has just set a password through their link, which proves they read that
 * inbox. Mark the email verified and attach the roster entry or leadership access they were invited to.
 */
export async function acceptInvitesFor(userId: string) {
  const open = await db
    .select()
    .from(s.invites)
    .where(and(eq(s.invites.userId, userId), isNull(s.invites.acceptedAt), gt(s.invites.expiresAt, new Date())));
  if (!open.length) return 0;
  await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, userId));
  for (const inv of open) {
    if (inv.memberId) await db.update(s.members).set({ userId }).where(eq(s.members.id, inv.memberId));
    if (inv.accessId) await db.update(s.orgAccess).set({ userId }).where(eq(s.orgAccess.id, inv.accessId));
    await db.update(s.invites).set({ acceptedAt: new Date() }).where(eq(s.invites.id, inv.id));
  }
  return open.length;
}
