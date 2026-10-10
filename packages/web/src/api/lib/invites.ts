import { and, desc, eq, isNull } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import { appOrigin } from "./accept";
import { letter, sendEmail } from "../services/email";

const INVITE_DAYS = 7;

function token() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function userFor(email: string, name: string) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email);
  if (found?.user) return found.user.id;
  const u = await ctx.internalAdapter.createUser({ email, name, emailVerified: false });
  return u.id;
}

/** A one time link that lets this user choose a password. Rides on better auth's reset tokens. */
export async function passwordLink(userId: string, hours: number, headers: Headers | undefined, path: "set-password" | "reset-password") {
  const ctx = await auth.$context;
  const t = token();
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${t}`,
    expiresAt: new Date(Date.now() + hours * 3600_000),
  });
  return { token: t, url: `${appOrigin(headers)}/${path}?token=${t}` };
}

export async function createInvite(o: {
  orgId: string;
  orgName: string;
  email: string;
  name: string;
  memberId?: string | null;
  accessId?: string | null;
  role: string;
  by: { id: string; name: string };
  headers?: Headers;
}) {
  const email = o.email.trim().toLowerCase();
  const userId = await userFor(email, o.name);
  const link = await passwordLink(userId, INVITE_DAYS * 24, o.headers, "set-password");
  const url = `${link.url}&email=${encodeURIComponent(email)}`;
  const body = letter({
    heading: `Join ${o.orgName} on The Platform`,
    lines: [
      `Hello ${o.name.split(" ")[0]},`,
      `${o.by.name} has added you to ${o.orgName} as ${o.role}. Choose a password to set up your account. Sign in with ${email} from then on.`,
      `The link works for ${INVITE_DAYS} days.`,
    ],
    button: "Choose your password",
    url,
    foot: "Not expecting this? Ignore the email and nothing changes.",
  });
  const sent = await sendEmail({ to: email, subject: `You're invited to ${o.orgName} on The Platform`, ...body });
  const id = crypto.randomUUID();
  await db.insert(s.invites).values({
    id,
    orgId: o.orgId,
    email,
    name: o.name,
    userId,
    memberId: o.memberId ?? null,
    accessId: o.accessId ?? null,
    token: link.token,
    createdBy: o.by.id,
    createdByName: o.by.name,
    emailed: sent.sent,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600_000),
  });
  return { id, url, emailed: sent.sent, emailError: sent.sent ? null : (sent.error ?? null), email };
}

/** The latest invite for a roster entry or leadership access, for showing its status. */
export async function latestInvite(where: { memberId?: string; accessId?: string }) {
  const cond = where.memberId ? eq(s.invites.memberId, where.memberId) : eq(s.invites.accessId, where.accessId!);
  const [inv] = await db.select().from(s.invites).where(cond).orderBy(desc(s.invites.createdAt)).limit(1);
  if (!inv) return null;
  return {
    sentAt: inv.createdAt.getTime(),
    by: inv.createdByName,
    emailed: inv.emailed,
    acceptedAt: inv.acceptedAt?.getTime() ?? null,
    expired: !inv.acceptedAt && inv.expiresAt < new Date(),
  };
}

export async function openInvites(orgId: string) {
  return db.select().from(s.invites).where(and(eq(s.invites.orgId, orgId), isNull(s.invites.acceptedAt)));
}
