import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { base } from "../__core/app";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import {
  createStoreSession,
  resolveViewer,
  STORE_HEADER,
  uniqueStoreNumber,
} from "../lib/access";
import { seedDemoOrg } from "../lib/seed";
import { seedTemplates } from "../lib/core";
import { isManagementRole } from "../../shared/domain";
import { businessDate } from "../lib/time";

const userBase = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." });
  return next({ context: { user: session.user } });
});

async function storeByNumber(number: string) {
  const [store] = await db.select().from(s.stores).where(eq(s.stores.number, number.trim()));
  if (!store) throw new ORPCError("NOT_FOUND", { message: "No store with that number." });
  return store;
}

export const session = {
  me: base.handler(async ({ context }) => {
    const state = await resolveViewer(context.headers);
    if (state.kind === "needs_store") return { ...state, demo: null, today: null };
    if (state.kind !== "ready") return { ...state, stores: [] as { number: string; name: string }[], demo: null, today: null };
    const stores = state.storeIds.length
      ? await db
          .select({
            id: s.stores.id,
            number: s.stores.number,
            name: s.stores.name,
            city: s.stores.city,
            ppaTarget: s.stores.ppaTarget,
            timezone: s.stores.timezone,
          })
          .from(s.stores)
          .where(inArray(s.stores.id, state.storeIds))
      : [];
    stores.sort((a, b) => a.name.localeCompare(b.name));
    let demo: null | {
      stores: { id: string; number: string; name: string; pin: string }[];
      cast: { id: string; name: string; role: string; pin: string; storeId: string }[];
    } = null;
    if (state.isDemo) {
      const all = await db.select().from(s.stores).where(eq(s.stores.orgId, state.orgId));
      const cast = await db
        .select()
        .from(s.members)
        .where(and(eq(s.members.orgId, state.orgId), inArray(s.members.name, ["D. Kerr", "Camille Rhodes", "Chris Ortega", "Andre Wallace", "Rebecca Stone"])));
      demo = {
        stores: all.map((x) => ({ id: x.id, number: x.number, name: x.name, pin: x.pin })),
        cast: cast.map((c) => ({ id: c.id, name: c.name, role: c.role, pin: c.pin, storeId: c.storeId })),
      };
    }
    const today = stores[0] ? businessDate(stores[0].timezone) : null;
    return { ...state, stores, demo, today };
  }),

  /** New owner: create the group and the first store. */
  setup: userBase
    .input(
      z.object({
        groupName: z.string().min(2).max(80),
        ownerName: z.string().min(1).max(80),
        storeName: z.string().min(2).max(80),
        city: z.string().max(80).default(""),
        storePin: z.string().regex(/^\d{4,6}$/, "Store PIN must be 4 to 6 digits"),
        ppaTarget: z.number().min(10).max(500).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [existing] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.userId, context.user.id));
      if (existing) throw new ORPCError("CONFLICT", { message: "You already have a group." });
      const orgId = crypto.randomUUID();
      await db.insert(s.orgs).values({ id: orgId, name: input.groupName });
      await db.insert(s.orgAccess).values({
        orgId,
        userId: context.user.id,
        email: context.user.email.toLowerCase(),
        name: input.ownerName,
        role: "owner",
      });
      const storeId = crypto.randomUUID();
      const number = await uniqueStoreNumber();
      await db.insert(s.stores).values({
        id: storeId,
        orgId,
        number,
        name: input.storeName,
        city: input.city,
        pin: input.storePin,
        ...(input.ppaTarget ? { ppaTarget: input.ppaTarget } : {}),
      });
      await seedTemplates(storeId);
      return { orgId, storeNumber: number };
    }),

  /** Store managers: open your store with the store number + store PIN after signing in. */
  unlock: userBase
    .input(z.object({ number: z.string().min(1), pin: z.string().min(4).max(6) }))
    .handler(async ({ input, context }) => {
      const store = await storeByNumber(input.number);
      if (store.pin !== input.pin) throw new ORPCError("UNAUTHORIZED", { message: "That store PIN isn't right." });
      const [member] = await db
        .select()
        .from(s.members)
        .where(and(eq(s.members.storeId, store.id), eq(s.members.userId, context.user.id), eq(s.members.status, "active")));
      if (!member || !isManagementRole(member.role))
        throw new ORPCError("FORBIDDEN", { message: "Your account isn't on this store's management team." });
      const token = await createStoreSession(member, "store_pin", context.user.id);
      return { token, storeName: store.name };
    }),

  /** Employees: store number + personal 4-digit PIN. The PIN only works at the store that hired them. */
  pinSignIn: base
    .input(z.object({ number: z.string().min(1), pin: z.string().regex(/^\d{4}$/, "PIN is 4 digits") }))
    .handler(async ({ input }) => {
      const store = await storeByNumber(input.number);
      const [member] = await db
        .select()
        .from(s.members)
        .where(and(eq(s.members.storeId, store.id), eq(s.members.pin, input.pin), eq(s.members.status, "active")));
      if (!member) throw new ORPCError("UNAUTHORIZED", { message: "That PIN doesn't match anyone at this store." });
      const token = await createStoreSession(member, "pin", null);
      return { token, name: member.name, storeName: store.name };
    }),

  leaveStore: base.handler(async ({ context }) => {
    const token = context.headers.get(STORE_HEADER);
    if (token) await db.delete(s.storeSessions).where(eq(s.storeSessions.token, token));
    return { ok: true };
  }),

  /** "Try the demo": seed a private copy of the sample group for this visitor. */
  startDemo: userBase.handler(async ({ context }) => {
    const [existing] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.userId, context.user.id));
    if (existing) return { orgId: existing.orgId };
    const out = await seedDemoOrg({ id: context.user.id, name: context.user.name, email: context.user.email });
    return { orgId: out.orgId };
  }),

  /** Demo only: preview the app as one of the cast, or return to the owner's view. */
  viewAs: userBase.input(z.object({ memberId: z.string() })).handler(async ({ input, context }) => {
    const [access] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.userId, context.user.id));
    if (!access || access.role !== "owner") throw new ORPCError("FORBIDDEN");
    const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, access.orgId));
    if (!org?.isDemo) throw new ORPCError("FORBIDDEN", { message: "Preview is only available in the demo." });
    const [member] = await db
      .select()
      .from(s.members)
      .where(and(eq(s.members.id, input.memberId), eq(s.members.orgId, org.id)));
    if (!member) throw new ORPCError("NOT_FOUND");
    const token = await createStoreSession(member, "demo", context.user.id);
    return { token };
  }),
};

