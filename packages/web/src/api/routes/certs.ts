import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { CERT_ALERT_DAYS, certsFor } from "../lib/program";
import { loadMemberFor, TZ, viewerName } from "../lib/program-access";
import { CERT_KINDS } from "../../shared/program";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kindEnum = z.enum(Object.keys(CERT_KINDS) as [keyof typeof CERT_KINDS, ...(keyof typeof CERT_KINDS)[]]);

export const certs = {
  /** Everyone's certifications at the viewer's stores, with alerts 30 days before expiry. */
  list: managerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (input.storeId) assertStore(v, input.storeId);
    const scope = input.storeId ? [input.storeId] : v.storeIds;
    if (!scope.length) return { rows: [], alerts: [], alertDays: CERT_ALERT_DAYS };
    const today = businessDate(TZ);
    const members = (
      await db.select().from(s.members).where(and(inArray(s.members.storeId, scope), eq(s.members.status, "active")))
    ).sort((a, b) => a.name.localeCompare(b.name));
    const stores = await db.select({ id: s.stores.id, name: s.stores.name }).from(s.stores).where(inArray(s.stores.id, scope));
    const sn = new Map(stores.map((x) => [x.id, x.name]));
    const map = await certsFor(members, today);
    const rows = members.map((m) => ({ id: m.id, name: m.name, role: m.role, initials: m.initials, storeId: m.storeId, storeName: sn.get(m.storeId) ?? "", certs: map.get(m.id) ?? [] }));
    const alerts = rows
      .flatMap((r) => r.certs.filter((c) => c.required && c.status !== "ok").map((c) => ({ memberId: r.id, name: r.name, role: r.role, storeName: r.storeName, ...c })))
      .sort((a, b) => (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999));
    return { rows, alerts, alertDays: CERT_ALERT_DAYS };
  }),

  member: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const m = await loadMemberFor(context.viewer, input.id);
    return (await certsFor([m], businessDate(TZ))).get(m.id) ?? [];
  }),

  record: managerBase
    .input(
      z.object({
        memberId: z.string(),
        kind: kindEnum,
        issuer: z.string().max(80).default(""),
        number: z.string().max(60).default(""),
        issuedOn: date,
        expiresOn: date.nullish(),
      }),
    )
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const m = await loadMemberFor(v, input.memberId);
      if (input.expiresOn && input.expiresOn <= input.issuedOn)
        throw new ORPCError("BAD_REQUEST", { message: "Expiry must be after the issue date." });
      await db.insert(s.certifications).values({
        orgId: m.orgId,
        storeId: m.storeId,
        memberId: m.id,
        kind: input.kind,
        issuer: input.issuer,
        number: input.number,
        issuedOn: input.issuedOn,
        expiresOn: input.expiresOn ?? null,
        recordedByName: viewerName(v).name,
      });
      return { ok: true };
    }),
};
