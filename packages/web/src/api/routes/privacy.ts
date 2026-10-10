import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import { randomDigits, viewerBase, type Viewer } from "../lib/access";
import { AREA_LABEL, holdsKeys, logPrivate, phoneFor, UNLOCK_MINUTES, wallOpenUntil } from "../lib/privacy";
import { normalizePhone, sendSms, smsReady } from "../services/sms";

const CODE_MINUTES = 10;
const MAX_TRIES = 5;

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hasPassword(userId: string) {
  const [a] = await db
    .select({ id: s.account.id })
    .from(s.account)
    .where(and(eq(s.account.userId, userId), eq(s.account.providerId, "credential")));
  return !!a;
}

function keyHolder(v: Viewer) {
  if (!holdsKeys(v)) throw new ORPCError("FORBIDDEN", { message: "Only the owner and the GM can open private records." });
  if (!v.sessionId || (!v.user && !v.isDemo))
    throw new ORPCError("FORBIDDEN", { message: "Sign in with your own account (not a store PIN) to open private records." });
}

/** Too many wrong passwords or codes in fifteen minutes and the wall stays shut for a while. */
async function assertNotLockedOut(v: Viewer) {
  const since = new Date(Date.now() - 15 * 60_000);
  const refused = await db
    .select({ id: s.privacyLog.id })
    .from(s.privacyLog)
    .where(and(eq(s.privacyLog.orgId, v.orgId), eq(s.privacyLog.name, v.accessName), eq(s.privacyLog.area, "refused"), gte(s.privacyLog.at, since)));
  if (refused.length >= MAX_TRIES) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many tries. Wait fifteen minutes and try again." });
}

async function checkPassword(v: Viewer, password: string, headers: Headers) {
  if (v.isDemo || !v.user) return;
  if (!(await hasPassword(v.user.id))) return;
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch {
    await logPrivate(v, "refused", { detail: "Wrong password", headers });
    throw new ORPCError("BAD_REQUEST", { message: "That password is not right." });
  }
}

async function openWall(v: Viewer, method: string, headers: Headers) {
  const expiresAt = new Date(Date.now() + UNLOCK_MINUTES * 60_000);
  await db.insert(s.privacyUnlocks).values({ userId: v.user?.id ?? v.member?.id ?? "demo", sessionId: v.sessionId!, orgId: v.orgId, method, expiresAt });
  await logPrivate(v, "unlock", { detail: method, headers });
  return expiresAt.getTime();
}

export const privacy = {
  /** Whether this viewer can open private records, whether they are open, and how. */
  state: viewerBase.handler(async ({ context }) => {
    const v = context.viewer;
    const eligible = holdsKeys(v);
    const until = await wallOpenUntil(v);
    const phone = eligible ? await phoneFor(v) : null;
    return {
      eligible,
      needsAccount: eligible && !v.sessionId,
      open: until != null,
      until,
      demo: v.isDemo,
      password: v.isDemo || !v.user ? false : await hasPassword(v.user.id),
      smsReady: smsReady(),
      phoneLast4: phone ? phone.slice(-4) : null,
      minutes: UNLOCK_MINUTES,
    };
  }),

  /** Step one: the password. Texts a code when SMS is connected; otherwise opens on the password alone. */
  start: viewerBase.input(z.object({ password: z.string().max(200).default("") })).handler(async ({ input, context }) => {
    const v = context.viewer;
    keyHolder(v);
    await assertNotLockedOut(v);
    await checkPassword(v, input.password, context.headers);
    const code = randomDigits(6);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000);
    if (v.isDemo) {
      await db.insert(s.privacyChallenges).values({ id, userId: v.user?.id ?? "demo", sessionId: v.sessionId!, orgId: v.orgId, codeHash: await sha(id + code), phoneLast4: "0000", expiresAt });
      return { step: "code" as const, challengeId: id, phoneLast4: "0000", demoCode: code, until: null };
    }
    if (!smsReady()) return { step: "open" as const, challengeId: null, phoneLast4: null, demoCode: null, until: await openWall(v, "password", context.headers) };
    const phone = await phoneFor(v);
    if (!phone) throw new ORPCError("BAD_REQUEST", { message: "Add the mobile number codes go to first, on the Privacy page." });
    await db.insert(s.privacyChallenges).values({ id, userId: v.user!.id, sessionId: v.sessionId!, orgId: v.orgId, codeHash: await sha(id + code), phoneLast4: phone.slice(-4), expiresAt });
    const sent = await sendSms(phone, `${code} is your BLM Platform code to open private records. It works for ${CODE_MINUTES} minutes. Never share it.`);
    if (!sent.sent) throw new ORPCError("BAD_GATEWAY", { message: sent.error ?? "The code could not be texted." });
    return { step: "code" as const, challengeId: id, phoneLast4: phone.slice(-4), demoCode: null, until: null };
  }),

  /** Step two: the six digit code. */
  verify: viewerBase.input(z.object({ challengeId: z.string(), code: z.string().regex(/^\d{6}$/) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    keyHolder(v);
    await assertNotLockedOut(v);
    const [c] = await db.select().from(s.privacyChallenges).where(eq(s.privacyChallenges.id, input.challengeId));
    if (!c || c.sessionId !== v.sessionId || c.expiresAt < new Date()) throw new ORPCError("BAD_REQUEST", { message: "That code has expired. Start again." });
    if (c.attempts >= MAX_TRIES) throw new ORPCError("BAD_REQUEST", { message: "Too many wrong codes. Start again." });
    if ((await sha(c.id + input.code)) !== c.codeHash) {
      await db.update(s.privacyChallenges).set({ attempts: c.attempts + 1 }).where(eq(s.privacyChallenges.id, c.id));
      await logPrivate(v, "refused", { detail: "Wrong code", headers: context.headers });
      throw new ORPCError("BAD_REQUEST", { message: "That code is not right." });
    }
    await db.delete(s.privacyChallenges).where(eq(s.privacyChallenges.id, c.id));
    return { until: await openWall(v, v.isDemo ? "demo code" : "password and text code", context.headers) };
  }),

  /** Close private records now. */
  lock: viewerBase.handler(async ({ context }) => {
    const v = context.viewer;
    if (v.sessionId) {
      const n = await db.delete(s.privacyUnlocks).where(eq(s.privacyUnlocks.sessionId, v.sessionId)).returning({ id: s.privacyUnlocks.id });
      if (n.length) await logPrivate(v, "lock", { headers: context.headers });
    }
    return { ok: true };
  }),

  /** The mobile number codes are texted to. Needs the password; changing an existing one needs the wall open too. */
  setPhone: viewerBase.input(z.object({ phone: z.string().min(7).max(30), password: z.string().max(200).default("") })).handler(async ({ input, context }) => {
    const v = context.viewer;
    keyHolder(v);
    if (!v.user) throw new ORPCError("BAD_REQUEST", { message: "The demo has no phone to set." });
    await assertNotLockedOut(v);
    const phone = normalizePhone(input.phone);
    if (!phone) throw new ORPCError("BAD_REQUEST", { message: "Enter a mobile number with its area code." });
    const current = await phoneFor(v);
    if (current && smsReady() && !(await wallOpenUntil(v)))
      throw new ORPCError("PRIVATE", { status: 403, message: "Open private records first, so a code goes to the number on file." });
    await checkPassword(v, input.password, context.headers);
    await db
      .insert(s.securityPhones)
      .values({ userId: v.user.id, phone, updatedAt: new Date() })
      .onConflictDoUpdate({ target: s.securityPhones.userId, set: { phone, updatedAt: new Date() } });
    await logPrivate(v, "phone", { detail: `Ends ${phone.slice(-4)}`, headers: context.headers });
    return { phoneLast4: phone.slice(-4) };
  }),

  /** Who opened what, newest first. Owner only. */
  log: viewerBase.input(z.object({ limit: z.number().int().min(1).max(500).default(200) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    if (v.level !== "owner") throw new ORPCError("FORBIDDEN", { message: "Only the owner can read the access log." });
    const rows = await db.select().from(s.privacyLog).where(eq(s.privacyLog.orgId, v.orgId)).orderBy(desc(s.privacyLog.at)).limit(input.limit);
    const ids = [...new Set(rows.map((r) => r.subjectId).filter(Boolean))] as string[];
    const names = new Map(
      ids.length ? (await db.select({ id: s.members.id, name: s.members.name }).from(s.members).where(inArray(s.members.id, ids))).map((m) => [m.id, m.name]) : [],
    );
    return rows.map((r) => ({
      id: r.id,
      at: r.at.getTime(),
      name: r.name,
      role: r.role,
      area: r.area,
      what: AREA_LABEL[r.area] ?? r.area,
      subject: r.subjectId ? (names.get(r.subjectId) ?? null) : null,
      detail: r.detail,
      ip: r.ip,
    }));
  }),
};
