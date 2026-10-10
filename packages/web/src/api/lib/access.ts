import { ORPCError } from "@orpc/server";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { base } from "../__core/app";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import { isManagementRole, type ViewerLevel } from "../../shared/domain";

export const STORE_HEADER = "x-blm-store";

export type Viewer = {
  user: { id: string; name: string; email: string } | null;
  orgId: string;
  orgName: string;
  isDemo: boolean;
  level: ViewerLevel;
  /** Stores this viewer may read. */
  storeIds: string[];
  /** Roster entry when acting at a store (staff, or a manager who opened their store). */
  member: typeof s.members.$inferSelect | null;
  accessName: string;
  accessRole: string;
  /** True when the demo owner is previewing as a colleague. */
  viewingAs: boolean;
};

export type ViewerState =
  | { kind: "signed_out" }
  | { kind: "no_org"; user: { id: string; name: string; email: string } }
  | {
      kind: "needs_store";
      user: { id: string; name: string; email: string };
      stores: { number: string; name: string }[];
    }
  | ({ kind: "ready" } & Viewer);

async function linkByEmail(user: { id: string; email: string }) {
  const email = user.email.toLowerCase();
  await db
    .update(s.orgAccess)
    .set({ userId: user.id })
    .where(and(eq(s.orgAccess.email, email), isNull(s.orgAccess.userId)));
  const pending = await db.select().from(s.members).where(eq(s.members.email, email));
  for (const m of pending) if (!m.userId) await db.update(s.members).set({ userId: user.id }).where(eq(s.members.id, m.id));
}

export async function resolveViewer(headers: Headers): Promise<ViewerState> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  const user = session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  const token = headers.get(STORE_HEADER);

  if (token) {
    const [ss] = await db
      .select()
      .from(s.storeSessions)
      .where(and(eq(s.storeSessions.token, token), gt(s.storeSessions.expiresAt, new Date())));
    if (ss && (!ss.userId || ss.userId === user?.id)) {
      const [member] = await db.select().from(s.members).where(eq(s.members.id, ss.memberId));
      const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, ss.orgId));
      if (member && org && member.status === "active") {
        return {
          kind: "ready",
          user,
          orgId: org.id,
          orgName: org.name,
          isDemo: org.isDemo,
          level: isManagementRole(member.role) ? "manager" : "staff",
          storeIds: [member.storeId],
          member,
          accessName: member.name,
          accessRole: member.role,
          viewingAs: ss.method === "demo",
        };
      }
    }
  }

  if (!user) return { kind: "signed_out" };

  let [access] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.userId, user.id));
  if (!access) {
    await linkByEmail(user);
    [access] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.userId, user.id));
  }
  if (access) {
    const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, access.orgId));
    if (org) {
      let storeIds: string[];
      if (access.role === "owner") {
        storeIds = (await db.select({ id: s.stores.id }).from(s.stores).where(eq(s.stores.orgId, org.id))).map(
          (r) => r.id,
        );
      } else storeIds = access.storeIds;
      return {
        kind: "ready",
        user,
        orgId: org.id,
        orgName: org.name,
        isDemo: org.isDemo,
        level: access.role === "owner" ? "owner" : "area",
        storeIds,
        member: null,
        accessName: access.name || user.name,
        accessRole: access.role,
        viewingAs: false,
      };
    }
  }

  const linked = await db
    .select({ storeId: s.members.storeId, role: s.members.role })
    .from(s.members)
    .where(and(eq(s.members.userId, user.id), eq(s.members.status, "active")));
  const mgmt = linked.filter((l) => isManagementRole(l.role));
  if (mgmt.length) {
    const st = await db
      .select({ number: s.stores.number, name: s.stores.name })
      .from(s.stores)
      .where(
        inArray(
          s.stores.id,
          mgmt.map((m) => m.storeId),
        ),
      );
    return { kind: "needs_store", user, stores: st };
  }
  return { kind: "no_org", user };
}

/** Any signed-in viewer attached to a group. */
export const viewerBase = base.use(async ({ context, next }) => {
  const state = await resolveViewer(context.headers);
  if (state.kind !== "ready") throw new ORPCError("UNAUTHORIZED", { message: "Sign in to continue." });
  return next({ context: { viewer: state as Viewer } });
});

/** Managers and leadership only. */
export const managerBase = viewerBase.use(async ({ context, next }) => {
  if (context.viewer.level === "staff") throw new ORPCError("FORBIDDEN", { message: "Managers only." });
  return next();
});

/** Owners and area managers only. */
export const leadershipBase = viewerBase.use(async ({ context, next }) => {
  if (context.viewer.level !== "owner" && context.viewer.level !== "area")
    throw new ORPCError("FORBIDDEN", { message: "Leadership only." });
  return next();
});

export function assertStore(viewer: Viewer, storeId: string) {
  if (!viewer.storeIds.includes(storeId)) throw new ORPCError("FORBIDDEN", { message: "Not your store." });
}

export async function loadStore(viewer: Viewer, storeId: string) {
  assertStore(viewer, storeId);
  const [store] = await db.select().from(s.stores).where(eq(s.stores.id, storeId));
  if (!store) throw new ORPCError("NOT_FOUND", { message: "Store not found." });
  return store;
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createStoreSession(
  member: typeof s.members.$inferSelect,
  method: "pin" | "store_pin" | "demo",
  userId: string | null,
) {
  const token = newToken();
  const hours = method === "pin" ? 14 : 24 * 14;
  await db.insert(s.storeSessions).values({
    token,
    memberId: member.id,
    storeId: member.storeId,
    orgId: member.orgId,
    userId,
    method,
    expiresAt: new Date(Date.now() + hours * 3600 * 1000),
  });
  return token;
}

export function randomDigits(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

export async function uniqueStoreNumber() {
  for (let i = 0; i < 20; i++) {
    const n = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
    const [hit] = await db.select({ id: s.stores.id }).from(s.stores).where(eq(s.stores.number, n));
    if (!hit) return n;
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not allocate a store number." });
}

export async function uniqueMemberPin(storeId: string, preferred?: string) {
  const taken = new Set(
    (await db.select({ pin: s.members.pin }).from(s.members).where(eq(s.members.storeId, storeId))).map((r) => r.pin),
  );
  if (preferred && !taken.has(preferred)) return preferred;
  for (let i = 0; i < 200; i++) {
    const p = randomDigits(4);
    if (!taken.has(p) && p !== "0000") return p;
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not allocate a PIN." });
}
