import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { base } from "../__core/app";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase, viewerBase } from "../lib/access";
import { createInvite, latestInvite, passwordLink } from "../lib/invites";
import { studioBase } from "./studio";
import { ROLE_LABEL, isManagementRole } from "../../shared/domain";
import { LEGAL_VERSION } from "../../shared/legal";
import { emailReady, letter, sendEmail } from "../services/email";
import { smsReady } from "../services/sms";

const userBase = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." });
  return next({ context: { user: session.user } });
});

async function memberFor(id: string) {
  const [m] = await db.select().from(s.members).where(eq(s.members.id, id));
  if (!m) throw new ORPCError("NOT_FOUND", { message: "Colleague not found." });
  return m;
}

export const account = {
  /** What is switched on: outgoing email and texted codes. */
  status: base.handler(() => ({ email: emailReady(), sms: smsReady() })),

  /** Record that this account accepted the terms and the privacy policy. */
  acceptLegal: userBase.handler(async ({ context }) => {
    const ip = context.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await db.insert(s.legalAcceptances).values([
      { userId: context.user.id, doc: "terms", version: LEGAL_VERSION, ip },
      { userId: context.user.id, doc: "privacy", version: LEGAL_VERSION, ip },
    ]);
    return { ok: true };
  }),

  /** Invite a colleague on the roster to set up an account. Only the GM or owner can invite managers. */
  inviteMember: managerBase.input(z.object({ memberId: z.string(), email: z.string().email().optional() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const m = await memberFor(input.memberId);
    assertStore(v, m.storeId);
    if (v.level === "manager" && isManagementRole(m.role) && v.member?.role !== "gm")
      throw new ORPCError("FORBIDDEN", { message: "Only the GM or owner can invite managers." });
    if (m.userId) throw new ORPCError("CONFLICT", { message: `${m.name} already has an account.` });
    const email = (input.email ?? m.email ?? "").trim().toLowerCase();
    if (!email) throw new ORPCError("BAD_REQUEST", { message: "Add an email address for them first." });
    if (email !== m.email) await db.update(s.members).set({ email }).where(eq(s.members.id, m.id));
    const inv = await createInvite({
      orgId: v.orgId,
      orgName: v.orgName,
      email,
      name: m.name,
      memberId: m.id,
      role: (ROLE_LABEL[m.role] ?? m.role).toLowerCase(),
      by: { id: v.user?.id ?? v.member?.id ?? "", name: v.accessName },
      headers: context.headers,
    });
    return inv;
  }),

  /** Invite an area director the owner has given access to. */
  inviteAccess: viewerBase.input(z.object({ accessId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (v.level !== "owner") throw new ORPCError("FORBIDDEN", { message: "Only the owner can invite leadership." });
    const [a] = await db.select().from(s.orgAccess).where(and(eq(s.orgAccess.id, input.accessId), eq(s.orgAccess.orgId, v.orgId)));
    if (!a?.email) throw new ORPCError("NOT_FOUND");
    if (a.userId) throw new ORPCError("CONFLICT", { message: `${a.name} already has an account.` });
    return createInvite({
      orgId: v.orgId,
      orgName: v.orgName,
      email: a.email,
      name: a.name,
      accessId: a.id,
      role: a.role === "owner" ? "an owner" : "area director",
      by: { id: v.user?.id ?? "", name: v.accessName },
      headers: context.headers,
    });
  }),

  /** BLM staff invite a client's owner from the Studio. */
  inviteOwner: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input, context }) => {
    const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, input.orgId));
    const [a] = await db.select().from(s.orgAccess).where(and(eq(s.orgAccess.orgId, input.orgId), eq(s.orgAccess.role, "owner")));
    if (!org || !a?.email) throw new ORPCError("NOT_FOUND", { message: "This client has no owner email yet." });
    if (a.userId) throw new ORPCError("CONFLICT", { message: `${a.name} already has an account.` });
    return createInvite({
      orgId: org.id,
      orgName: org.name,
      email: a.email,
      name: a.name,
      accessId: a.id,
      role: "the owner",
      by: { id: context.user.id, name: `${context.staff.name || context.user.name}, Bottom Line Multiplied` },
      headers: context.headers,
    });
  }),

  /** Invite status for a roster entry. */
  memberInvite: managerBase.input(z.object({ memberId: z.string() })).handler(async ({ input, context }) => {
    const m = await memberFor(input.memberId);
    assertStore(context.viewer, m.storeId);
    return { hasAccount: !!m.userId, invite: await latestInvite({ memberId: m.id }) };
  }),

  /** A one hour reset link for a colleague who has forgotten their password, emailed when email is on. */
  resetLink: managerBase.input(z.object({ memberId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const m = await memberFor(input.memberId);
    assertStore(v, m.storeId);
    if (v.level === "manager" && isManagementRole(m.role) && v.member?.role !== "gm")
      throw new ORPCError("FORBIDDEN", { message: "Only the GM or owner can reset a manager's password." });
    if (!m.userId) throw new ORPCError("BAD_REQUEST", { message: `${m.name} has no account yet. Send an invite instead.` });
    const [u] = await db.select().from(s.user).where(eq(s.user.id, m.userId));
    if (!u) throw new ORPCError("NOT_FOUND");
    const link = await passwordLink(u.id, 1, context.headers, "reset-password");
    const body = letter({
      heading: "Reset your password",
      lines: [`Hello ${m.name.split(" ")[0]},`, `${v.accessName} sent you a link to choose a new password for The Platform. It works for one hour.`],
      button: "Choose a new password",
      url: link.url,
    });
    const sent = await sendEmail({ to: u.email, subject: "Reset your password", ...body });
    return { url: link.url, emailed: sent.sent, email: u.email };
  }),
};
