import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, gte } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import type { Viewer } from "./access";

/**
 * The privacy wall. Conduct records, staff contact details, pay and reward payouts, guest reviews
 * naming staff, and exports open only for the owner or a GM, after their password and a texted code,
 * for thirty minutes at a time. Every opening is logged for the owner.
 */
export const UNLOCK_MINUTES = 30;

export type PrivateArea = "conduct" | "contact" | "pay" | "reviews" | "export" | "backup";

export const AREA_LABEL: Record<string, string> = {
  unlock: "Opened private records",
  refused: "Refused",
  conduct: "Conduct record",
  contact: "Contact details",
  pay: "Pay and reward payouts",
  reviews: "Guest reviews naming staff",
  export: "Data export",
  backup: "Backup",
  phone: "Changed the phone for codes",
  lock: "Closed private records",
};

/** Owner, or the GM of the store they are acting at. Area directors and other managers are not key holders. */
export function holdsKeys(v: Viewer) {
  return v.level === "owner" || (v.level === "manager" && v.member?.role === "gm");
}

export function roleName(v: Viewer) {
  if (v.level === "owner") return "Owner";
  if (v.level === "area") return "Area director";
  if (v.member?.role === "gm") return "GM";
  return v.member?.role ? v.member.role.replace(/_/g, " ") : v.accessRole;
}

export async function wallOpenUntil(v: Viewer): Promise<number | null> {
  if (!holdsKeys(v) || !v.sessionId) return null;
  const [u] = await db
    .select({ expiresAt: s.privacyUnlocks.expiresAt })
    .from(s.privacyUnlocks)
    .where(and(eq(s.privacyUnlocks.sessionId, v.sessionId), eq(s.privacyUnlocks.orgId, v.orgId), gt(s.privacyUnlocks.expiresAt, new Date())))
    .orderBy(desc(s.privacyUnlocks.expiresAt))
    .limit(1);
  return u ? u.expiresAt.getTime() : null;
}

export async function wallOpen(v: Viewer) {
  return (await wallOpenUntil(v)) != null;
}

export async function logPrivate(
  v: Viewer,
  area: string,
  o: { subjectId?: string | null; detail?: string; headers?: Headers; dedupeMinutes?: number } = {},
) {
  if (o.dedupeMinutes) {
    const [recent] = await db
      .select({ id: s.privacyLog.id, subjectId: s.privacyLog.subjectId })
      .from(s.privacyLog)
      .where(
        and(
          eq(s.privacyLog.orgId, v.orgId),
          eq(s.privacyLog.name, v.accessName),
          eq(s.privacyLog.area, area),
          gte(s.privacyLog.at, new Date(Date.now() - o.dedupeMinutes * 60_000)),
        ),
      )
      .orderBy(desc(s.privacyLog.at))
      .limit(1);
    if (recent && (recent.subjectId ?? null) === (o.subjectId ?? null)) return;
  }
  await db.insert(s.privacyLog).values({
    orgId: v.orgId,
    userId: v.user?.id ?? null,
    name: v.accessName,
    role: roleName(v),
    area,
    subjectId: o.subjectId ?? null,
    detail: o.detail ?? "",
    ip: o.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
}

/** The error the web app turns into the "open private records" prompt. */
export function privateError(v: Viewer) {
  return holdsKeys(v)
    ? new ORPCError("PRIVATE", { status: 403, message: "Private record. Open private records with your password and a text code." })
    : new ORPCError("FORBIDDEN", { message: "Only the owner and the GM can open this record." });
}

/** Throw unless the wall is open for this viewer; log the opening when it is. */
export async function requireOpen(v: Viewer, area: PrivateArea, o: { subjectId?: string | null; detail?: string; headers?: Headers } = {}) {
  if (!(await wallOpen(v))) throw privateError(v);
  await logPrivate(v, area, { ...o, dedupeMinutes: 10 });
}

/** The mobile number codes are texted to, set on the Privacy page. */
export async function phoneFor(v: Viewer) {
  if (v.user) {
    const [p] = await db.select().from(s.securityPhones).where(eq(s.securityPhones.userId, v.user.id));
    if (p) return p.phone;
  }
  return null;
}

/** A person may always see their own record; anyone else's needs the wall open. */
export async function guardRecord(v: Viewer, area: PrivateArea, memberId: string | null, headers?: Headers) {
  if (memberId && v.member?.id === memberId) return;
  await requireOpen(v, area, { subjectId: memberId, headers });
}
