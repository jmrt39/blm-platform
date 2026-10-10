import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { readPosFiles, toReportCsv, TOAST_FILES, posSystem } from "../../shared/pos";
import { emailReady, letter, sendEmail } from "../services/email";
import { appOrigin } from "./accept";
import type Sftp from "ssh2-sftp-client";

/**
 * Nightly POS figures. Each store has one connection: Toast is collected over SFTP, other systems
 * email their nightly report to the store's own address (Resend Inbound) or a relay posts the file.
 * Whatever arrives is turned into the shift report's CSV and waits for the closing manager to sign.
 */
export type PosConn = typeof s.posConnections.$inferSelect;

/** Hours after the pull time before a night with no figures is called missing. */
const MISSING_AFTER_H = 3;

export function newInboundKey() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => abc[b % abc.length]).join("");
}

export function inboundDomain() {
  return process.env.POS_INBOUND_DOMAIN || "in.bottomlinemultiplied.com";
}
export const inboundAddress = (key: string) => `pos-${key}@${inboundDomain()}`;
export const uploadUrl = (key: string, headers?: Headers | null) => `${appOrigin(headers)}/api/pos/upload/${key}`;

export function inboundReady() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET);
}
export function toastReady() {
  return !!(process.env.TOAST_SFTP_PRIVATE_KEY && process.env.TOAST_SFTP_HOST);
}
export function toastPublicKey() {
  return process.env.TOAST_SFTP_PUBLIC_KEY ?? "";
}

/** The store's own date and time. */
export function localNow(tz: string, at = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const minutes = (hm: string) => {
  const [h = 0, m = 0] = hm.split(":").map(Number);
  return h * 60 + m;
};

async function storeOf(storeId: string) {
  const [st] = await db.select().from(s.stores).where(eq(s.stores.id, storeId));
  return st;
}

/** One night's files for a store: parsed, staged for signing, and logged. */
export async function ingest(conn: PosConn, files: { name: string; text: string }[], o: { source: string; businessDate?: string | null }) {
  const st = await storeOf(conn.storeId);
  const tz = st?.timezone ?? "America/New_York";
  const r = readPosFiles(files);
  const id = crypto.randomUUID();
  if (!r.ok) {
    const date = o.businessDate ?? fallbackDate(tz);
    await db.insert(s.posImports).values({ id, orgId: conn.orgId, storeId: conn.storeId, connectionId: conn.id, businessDate: date, source: o.source, status: "failed", message: r.error });
    await db.update(s.posConnections).set({ lastError: r.error }).where(eq(s.posConnections.id, conn.id));
    return { ok: false as const, id, businessDate: date, error: r.error };
  }
  const date = o.businessDate ?? r.businessDate ?? fallbackDate(tz);
  await db.insert(s.posImports).values({
    id,
    orgId: conn.orgId,
    storeId: conn.storeId,
    connectionId: conn.id,
    businessDate: date,
    source: o.source,
    status: "ok",
    rows: r.rows.length,
    netSales: r.netSales,
    message: r.warnings.join(" "),
    payload: toReportCsv(r.rows),
  });
  await db
    .update(s.posConnections)
    .set({ lastImportAt: new Date(), lastError: null, status: conn.status === "paused" ? "paused" : "live" })
    .where(eq(s.posConnections.id, conn.id));
  return { ok: true as const, id, businessDate: date, rows: r.rows.length, netSales: r.netSales, warnings: r.warnings };
}

/** A file with no date in it: before 3 pm it is last night's, after that tonight's. */
function fallbackDate(tz: string) {
  const now = localNow(tz);
  return minutes(now.hm) < 15 * 60 ? addDays(now.date, -1) : now.date;
}

async function toastClient(conn: PosConn): Promise<Sftp> {
  const user = conn.settings.sftpUsername?.trim();
  if (!toastReady()) throw new Error("The BLM Toast key is not installed on the server yet.");
  if (!user || !conn.settings.exportId?.trim()) throw new Error("Add the SFTP username and export ID from Toast Web first.");
  const { default: Client } = await import("ssh2-sftp-client");
  const c = new Client();
  try {
    await c.connect({
      host: process.env.TOAST_SFTP_HOST,
      port: 22,
      username: user,
      privateKey: atob(process.env.TOAST_SFTP_PRIVATE_KEY ?? ""),
      readyTimeout: 20_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/auth/i.test(msg) ? "Toast refused our key. Check that the BLM key is added in Toast Web and the username matches." : `Could not reach Toast: ${msg}`);
  }
  return c;
}

/** Fetch one business date from the Toast export folder. Toast keeps the last seven days. */
export async function pullToast(conn: PosConn, date: string) {
  const c = await toastClient(conn);
  try {
    const dir = `/${conn.settings.exportId!.trim()}/${date.replace(/-/g, "")}`;
    if (!(await c.exists(dir))) throw new Error(`Toast has not written the export for ${date} yet.`);
    const list = await c.list(dir);
    const want = list.filter((f) => TOAST_FILES.some((n) => n.toLowerCase() === f.name.toLowerCase()));
    if (!want.length) throw new Error(`The ${date} folder has no OrderDetails.csv. Turn on the orders export in Toast Web.`);
    const files: { name: string; text: string }[] = [];
    for (const f of want) files.push({ name: f.name, text: String(await c.get(`${dir}/${f.name}`)) });
    return await ingest(conn, files, { source: "toast_sftp", businessDate: date });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(s.posImports).values({ orgId: conn.orgId, storeId: conn.storeId, connectionId: conn.id, businessDate: date, source: "toast_sftp", status: "failed", message: error });
    await db.update(s.posConnections).set({ lastError: error }).where(eq(s.posConnections.id, conn.id));
    return { ok: false as const, businessDate: date, error };
  } finally {
    await c.end().catch(() => null);
  }
}

/** Sign in and list the dated folders Toast holds for this location. */
export async function testToast(conn: PosConn) {
  const c = await toastClient(conn);
  try {
    const dir = `/${conn.settings.exportId!.trim()}`;
    if (!(await c.exists(dir))) return { ok: false as const, message: `Signed in, but there is no folder for export ID ${conn.settings.exportId}.` };
    const dates = (await c.list(dir))
      .filter((f) => /^\d{8}$/.test(f.name))
      .map((f) => `${f.name.slice(0, 4)}-${f.name.slice(4, 6)}-${f.name.slice(6)}`)
      .sort()
      .reverse();
    return { ok: true as const, message: dates.length ? `Connected. Toast holds ${dates.length} nights, latest ${dates[0]}.` : "Connected. No nights exported yet." };
  } finally {
    await c.end().catch(() => null);
  }
}

/* ───────────── Inbound email (Resend) ───────────── */

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

/** Resend signs webhooks the Svix way: HMAC SHA256 over id.timestamp.body. */
export async function verifyWebhook(headers: Headers, body: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", unb64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`))));
  return sig.split(" ").some((p) => p.split(",")[1] === mac);
}

type Received = { type?: string; data?: { email_id?: string; to?: string[]; received_for?: string[]; subject?: string; from?: string } };

export async function handleInbound(event: Received) {
  if (event.type !== "email.received" || !event.data?.email_id) return { handled: 0 };
  const addrs = [...(event.data.to ?? []), ...(event.data.received_for ?? [])].join(" ");
  const keys = [...new Set([...addrs.matchAll(/pos-([a-z0-9]{8,40})@/gi)].map((m) => m[1]!.toLowerCase()))];
  if (!keys.length) return { handled: 0 };
  const conns = await db.select().from(s.posConnections).where(inArray(s.posConnections.inboundKey, keys));
  if (!conns.length) return { handled: 0 };
  const res = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}/attachments`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  const list = res.ok ? (((await res.json()) as { data?: { filename?: string; content_type?: string; download_url?: string }[] }).data ?? []) : [];
  const files: { name: string; text: string }[] = [];
  for (const a of list) {
    const name = a.filename ?? "report.csv";
    if (!a.download_url || !(/\.(csv|txt|tsv)$/i.test(name) || /csv|text\/plain/i.test(a.content_type ?? ""))) continue;
    const f = await fetch(a.download_url);
    if (f.ok) files.push({ name, text: await f.text() });
  }
  let handled = 0;
  for (const conn of conns) {
    if (conn.status === "paused") continue;
    if (!files.length) {
      const st = await storeOf(conn.storeId);
      const msg = `An email arrived from ${event.data.from ?? "the POS"} (${event.data.subject ?? "no subject"}) with no CSV attached.`;
      await db.insert(s.posImports).values({ orgId: conn.orgId, storeId: conn.storeId, connectionId: conn.id, businessDate: fallbackDate(st?.timezone ?? "America/New_York"), source: "email", status: "failed", message: msg });
      await db.update(s.posConnections).set({ lastError: msg }).where(eq(s.posConnections.id, conn.id));
    } else await ingest(conn, files, { source: "email" });
    handled++;
  }
  return { handled };
}

/* ───────────── Nightly run and missing nights ───────────── */

async function alertMissing(conn: PosConn, date: string, storeName: string) {
  if (!emailReady()) return 0;
  const owners = await db
    .select({ email: s.orgAccess.email })
    .from(s.orgAccess)
    .where(and(eq(s.orgAccess.orgId, conn.orgId), eq(s.orgAccess.role, "owner")));
  const gms = await db
    .select({ email: s.members.email })
    .from(s.members)
    .where(and(eq(s.members.storeId, conn.storeId), eq(s.members.role, "gm"), eq(s.members.status, "active")));
  const to = [...new Set([...owners, ...gms].map((x) => x.email?.toLowerCase()).filter((x): x is string => !!x))];
  const sys = posSystem(conn.system).name;
  const m = letter({
    heading: `No POS figures for ${storeName}`,
    lines: [
      `Nothing arrived from ${sys} for the night of ${date}.`,
      "Until it does, the closing manager can type the night in or upload the export on the shift report. Check the connection if it happens again.",
    ],
    button: "Open the POS import",
    url: `${appOrigin(null)}/pos`,
  });
  let sent = 0;
  for (const t of to) if ((await sendEmail({ to: t, subject: `Missing POS figures: ${storeName}, ${date}`, ...m })).sent) sent++;
  return sent;
}

/** Collect Toast exports that are due, and flag nights that never arrived. Safe to run every half hour. */
export async function runPosNightly(at = new Date()) {
  const conns = await db
    .select()
    .from(s.posConnections)
    .where(and(ne(s.posConnections.status, "paused"), ne(s.posConnections.method, "manual")));
  const out = { pulled: 0, failed: 0, missing: 0, alerted: 0 };
  for (const conn of conns) {
    const st = await storeOf(conn.storeId);
    if (!st) continue;
    const now = localNow(st.timezone, at);
    if (minutes(now.hm) < minutes(conn.pullAt)) continue;
    const date = addDays(now.date, -1);
    const tries = await db
      .select({ status: s.posImports.status, createdAt: s.posImports.createdAt })
      .from(s.posImports)
      .where(and(eq(s.posImports.storeId, conn.storeId), eq(s.posImports.businessDate, date)));
    if (tries.some((t) => t.status === "ok")) continue;
    const [report] = await db
      .select({ id: s.shiftReports.id })
      .from(s.shiftReports)
      .where(and(eq(s.shiftReports.storeId, conn.storeId), eq(s.shiftReports.businessDate, date)));
    if (report) continue;
    if (conn.method === "toast_sftp" && toastReady()) {
      const recent = tries.some((t) => t.status === "failed" && at.getTime() - t.createdAt.getTime() < 55 * 60_000);
      if (!recent) {
        const r = await pullToast(conn, date);
        if (r.ok) {
          out.pulled++;
          continue;
        }
        out.failed++;
      }
    }
    const late = minutes(now.hm) >= minutes(conn.pullAt) + MISSING_AFTER_H * 60;
    if (late && !tries.some((t) => t.status === "missing")) {
      await db.insert(s.posImports).values({
        orgId: conn.orgId,
        storeId: conn.storeId,
        connectionId: conn.id,
        businessDate: date,
        source: conn.method,
        status: "missing",
        message: `No figures by ${conn.pullAt} plus ${MISSING_AFTER_H} hours.`,
      });
      out.missing++;
      out.alerted += await alertMissing(conn, date, st.name);
    }
  }
  return out;
}

/** The import log for one store, newest first, without the staged rows. */
export async function importLog(storeId: string, days = 21) {
  const since = new Date(Date.now() - days * 86_400_000);
  return db
    .select({
      id: s.posImports.id,
      businessDate: s.posImports.businessDate,
      source: s.posImports.source,
      status: s.posImports.status,
      rows: s.posImports.rows,
      netSales: s.posImports.netSales,
      message: s.posImports.message,
      createdAt: s.posImports.createdAt,
    })
    .from(s.posImports)
    .where(and(eq(s.posImports.storeId, storeId), gte(s.posImports.createdAt, since)))
    .orderBy(desc(s.posImports.createdAt))
    .limit(60);
}
