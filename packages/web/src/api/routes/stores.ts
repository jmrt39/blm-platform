import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { leadershipBase, managerBase, uniqueStoreNumber, viewerBase } from "../lib/access";
import { seedTemplates } from "../lib/core";
import { isManagementRole } from "../../shared/domain";

const ownerOnly = leadershipBase.use(async ({ context, next }) => {
  if (context.viewer.level !== "owner") throw new ORPCError("FORBIDDEN", { message: "Owners only." });
  return next();
});

export const stores = {
  list: viewerBase.handler(async ({ context }) => {
    const v = context.viewer;
    if (!v.storeIds.length) return [];
    const rows = await db.select().from(s.stores).where(inArray(s.stores.id, v.storeIds));
    const members = await db
      .select({ storeId: s.members.storeId, role: s.members.role, name: s.members.name })
      .from(s.members)
      .where(and(inArray(s.members.storeId, v.storeIds), eq(s.members.status, "active")));
    return rows
      .map((r) => ({
        id: r.id,
        number: r.number,
        name: r.name,
        city: r.city,
        pin: v.level === "owner" || v.level === "area" ? r.pin : null,
        ppaTarget: r.ppaTarget,
        openingDueBy: r.openingDueBy,
        closingDueBy: r.closingDueBy,
        headcount: members.filter((m) => m.storeId === r.id).length,
        managers: members.filter((m) => m.storeId === r.id && isManagementRole(m.role)).map((m) => ({ name: m.name, role: m.role })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  create: ownerOnly
    .input(
      z.object({
        name: z.string().min(2).max(80),
        city: z.string().max(80).default(""),
        pin: z.string().regex(/^\d{4,6}$/, "Store PIN must be 4–6 digits"),
        ppaTarget: z.number().min(10).max(500).default(78),
      }),
    )
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      const number = await uniqueStoreNumber();
      await db.insert(s.stores).values({ id, orgId: context.viewer.orgId, number, ...input });
      await seedTemplates(id);
      return { id, number };
    }),

  update: managerBase
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).max(80).optional(),
        city: z.string().max(80).optional(),
        pin: z
          .string()
          .regex(/^\d{4,6}$/)
          .optional(),
        ppaTarget: z.number().min(10).max(500).optional(),
        openingDueBy: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        closingDueBy: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      if (!v.storeIds.includes(input.id)) throw new ORPCError("FORBIDDEN");
      if (v.level === "manager" && v.member?.role !== "gm") throw new ORPCError("FORBIDDEN", { message: "GM or owner only." });
      const { id, ...patch } = input;
      await db.update(s.stores).set(patch).where(eq(s.stores.id, id));
      return { ok: true };
    }),

  leadership: leadershipBase.handler(async ({ context }) => {
    const rows = await db.select().from(s.orgAccess).where(eq(s.orgAccess.orgId, context.viewer.orgId));
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, storeIds: r.storeIds, linked: !!r.userId }));
  }),

  addAreaManager: ownerOnly
    .input(z.object({ name: z.string().min(2).max(80), email: z.string().email(), storeIds: z.array(z.string()).min(1) }))
    .handler(async ({ input, context }) => {
      for (const id of input.storeIds) if (!context.viewer.storeIds.includes(id)) throw new ORPCError("FORBIDDEN");
      const email = input.email.toLowerCase();
      const [dupe] = await db.select().from(s.orgAccess).where(eq(s.orgAccess.email, email));
      if (dupe) throw new ORPCError("CONFLICT", { message: "That email already has leadership access." });
      await db.insert(s.orgAccess).values({ orgId: context.viewer.orgId, name: input.name, email, role: "area_manager", storeIds: input.storeIds });
      return { ok: true };
    }),

  updateAreaManager: ownerOnly
    .input(z.object({ id: z.string(), storeIds: z.array(z.string()) }))
    .handler(async ({ input, context }) => {
      await db
        .update(s.orgAccess)
        .set({ storeIds: input.storeIds })
        .where(and(eq(s.orgAccess.id, input.id), eq(s.orgAccess.orgId, context.viewer.orgId), eq(s.orgAccess.role, "area_manager")));
      return { ok: true };
    }),

  removeAreaManager: ownerOnly.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    await db
      .delete(s.orgAccess)
      .where(and(eq(s.orgAccess.id, input.id), eq(s.orgAccess.orgId, context.viewer.orgId), eq(s.orgAccess.role, "area_manager")));
    return { ok: true };
  }),
};
