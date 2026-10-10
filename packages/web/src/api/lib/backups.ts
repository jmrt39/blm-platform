import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "../database";
import * as s from "../database/schema";
import { s3 } from "./s3";
import { runPosNightly } from "./pos";

/**
 * Nightly encrypted backups, one file per restaurant group: every row the group owns, gzipped
 * JSON sealed with AES 256 GCM under BACKUP_KEY. Kept thirty days, in object storage when it is
 * configured, otherwise in the database.
 */
export const KEEP_DAYS = 30;
const MAGIC = new TextEncoder().encode("BLMBAK1");

/** Sign in plumbing, one time codes and the backups themselves never go in a backup. */
const SKIP = new Set([
  "user",
  "session",
  "account",
  "verification",
  "store_sessions",
  "privacy_challenges",
  "privacy_unlocks",
  "backups",
  "studio_staff",
  "studio_sources",
  "content_items",
  "security_phones",
]);
/** Rows that hang off a parent table rather than carrying the store themselves. */
const CHILD: Record<string, { parent: string; fk: string }> = {
  checklist_lines: { parent: "checklists", fk: "checklistId" },
  shift_report_lines: { parent: "shift_reports", fk: "reportId" },
  lineup_entries: { parent: "lineups", fk: "lineupId" },
};
/** Columns that are credentials, not records. */
const SECRET_COLS: Record<string, string[]> = { pos_connections: ["settings"], invites: ["token"] };

async function key(usage: KeyUsage) {
  const hex = process.env.BACKUP_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("BACKUP_KEY is missing or not 64 hex characters.");
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [usage]);
}

export function s3Ready() {
  return !!(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const src = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(src).arrayBuffer());
}
export const gzip = (b: Uint8Array) => pipe(b, new CompressionStream("gzip"));
export const gunzip = (b: Uint8Array) => pipe(b, new DecompressionStream("gzip"));

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** File layout: BLMBAK1, 12 byte IV, 16 byte GCM tag, ciphertext. */
export async function seal(plain: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key("encrypt"), plain as Uint8Array<ArrayBuffer>));
  const body = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  return concat(MAGIC, iv, tag, body);
}

export async function unseal(box: Uint8Array) {
  const head = box.subarray(0, MAGIC.length);
  if (head.length !== MAGIC.length || head.some((b, i) => b !== MAGIC[i])) throw new Error("Not a BLM backup.");
  const o = MAGIC.length;
  const iv = box.slice(o, o + 12);
  const tag = box.subarray(o + 12, o + 28);
  const body = box.subarray(o + 28);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key("decrypt"), concat(body, tag) as Uint8Array<ArrayBuffer>);
  return new Uint8Array(plain);
}

type AnyTable = SQLiteTable;
function tables() {
  return (Object.values(s) as unknown[]).filter((t): t is AnyTable => is(t, SQLiteTable));
}

/** Every row this group owns, table by table. */
export async function exportOrg(orgId: string) {
  const out: Record<string, unknown[]> = {};
  const storeIds = (await db.select({ id: s.stores.id }).from(s.stores).where(eq(s.stores.orgId, orgId))).map((x) => x.id);
  const memberIds = (await db.select({ id: s.members.id }).from(s.members).where(eq(s.members.orgId, orgId))).map((x) => x.id);
  const ids: Record<string, string[]> = {};
  const later: [string, AnyTable][] = [];
  const chunked = async (t: AnyTable, col: unknown, list: string[]) => {
    const rows: unknown[] = [];
    for (let i = 0; i < list.length; i += 400) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.push(...(await db.select().from(t as any).where(inArray(col as any, list.slice(i, i + 400)))));
    }
    return rows;
  };
  for (const t of tables()) {
    const name = getTableName(t);
    if (SKIP.has(name)) continue;
    if (CHILD[name]) {
      later.push([name, t]);
      continue;
    }
    const cols = getTableColumns(t) as Record<string, unknown>;
    let rows: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (name === "orgs") rows = await db.select().from(t as any).where(eq(cols.id as any, orgId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else if (cols.orgId) rows = await db.select().from(t as any).where(eq(cols.orgId as any, orgId));
    else if (cols.storeId) rows = await chunked(t, cols.storeId, storeIds);
    else if (cols.memberId) rows = await chunked(t, cols.memberId, memberIds);
    else continue;
    out[name] = rows;
    ids[name] = rows.map((r) => (r as { id: string }).id);
  }
  for (const [name, t] of later) {
    const c = CHILD[name]!;
    const cols = getTableColumns(t) as Record<string, unknown>;
    out[name] = await chunked(t, cols[c.fk], ids[c.parent] ?? []);
  }
  for (const [name, hide] of Object.entries(SECRET_COLS))
    out[name] = (out[name] ?? []).map((r) => Object.fromEntries(Object.entries(r as object).filter(([k]) => !hide.includes(k))));
  const rows = Object.values(out).reduce((a, r) => a + r.length, 0);
  return { tables: out, rows };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Back up one group now. Never throws: a failure is recorded so the owner sees it. */
export async function backupOrg(orgId: string, kind: "nightly" | "manual") {
  const id = crypto.randomUUID();
  const forDate = today();
  try {
    const [org] = await db.select({ name: s.orgs.name }).from(s.orgs).where(eq(s.orgs.id, orgId));
    const data = await exportOrg(orgId);
    const json = JSON.stringify({ format: "blm-backup", version: 1, orgId, orgName: org?.name ?? "", createdAt: new Date().toISOString(), ...data });
    const box = await seal(await gzip(new TextEncoder().encode(json)));
    let storage = "database";
    let objectKey: string | null = null;
    if (s3Ready()) {
      objectKey = `backups/${orgId}/${forDate}-${id}.blmbak`;
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: box, ContentType: "application/octet-stream" }));
      storage = "s3";
    }
    await db.insert(s.backups).values({
      id,
      orgId,
      kind,
      storage,
      key: objectKey,
      data: storage === "database" ? (box as never) : null,
      bytes: box.length,
      rows: data.rows,
      status: "ok",
      forDate,
    });
    return { id, ok: true as const, bytes: box.length, rows: data.rows };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(s.backups).values({ id, orgId, kind, storage: "none", bytes: 0, rows: 0, status: "failed", error: error.slice(0, 500), forDate }).catch(() => null);
    return { id, ok: false as const, error };
  }
}

/** The decrypted contents of one backup. */
export async function readBackup(orgId: string, id: string) {
  const [b] = await db.select().from(s.backups).where(and(eq(s.backups.id, id), eq(s.backups.orgId, orgId)));
  if (!b || b.status !== "ok") return null;
  let box: Uint8Array;
  if (b.storage === "s3" && b.key) {
    const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: b.key }));
    if (!r.Body) return null;
    box = await r.Body.transformToByteArray();
  } else if (b.data) box = new Uint8Array(b.data as ArrayLike<number>);
  else return null;
  return { backup: b, json: new TextDecoder().decode(await gunzip(await unseal(box))) };
}

/** Drop backups past the thirty days, objects included. */
export async function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const old = await db.select({ id: s.backups.id, key: s.backups.key, storage: s.backups.storage }).from(s.backups).where(lt(s.backups.createdAt, cutoff));
  for (const b of old) {
    if (b.storage === "s3" && b.key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: b.key })).catch(() => null);
    await db.delete(s.backups).where(eq(s.backups.id, b.id));
  }
  return old.length;
}

/** Every real group without a successful backup today gets one. Safe to call as often as you like. */
export async function runNightly() {
  const orgs = await db.select({ id: s.orgs.id }).from(s.orgs).where(eq(s.orgs.isDemo, false));
  const done = new Set(
    (await db.select({ orgId: s.backups.orgId }).from(s.backups).where(and(eq(s.backups.forDate, today()), eq(s.backups.status, "ok")))).map((b) => b.orgId),
  );
  const results = [];
  for (const o of orgs) if (!done.has(o.id)) results.push({ orgId: o.id, ...(await backupOrg(o.id, "nightly")) });
  const pruned = await prune();
  return { ran: results.length, failed: results.filter((r) => !r.ok).length, pruned };
}

export async function lastBackups(orgId: string, limit = 10) {
  return db
    .select({
      id: s.backups.id,
      kind: s.backups.kind,
      storage: s.backups.storage,
      bytes: s.backups.bytes,
      rows: s.backups.rows,
      status: s.backups.status,
      error: s.backups.error,
      forDate: s.backups.forDate,
      createdAt: s.backups.createdAt,
    })
    .from(s.backups)
    .where(eq(s.backups.orgId, orgId))
    .orderBy(desc(s.backups.createdAt))
    .limit(limit);
}

/** Hour (UTC) after which the nightly run starts: 09:00 UTC is 2 to 5 in the morning across US time zones. */
const NIGHTLY_UTC_HOUR = 9;

/** In process timer, a safety net for the cron webhook. One per process. */
export function startNightlyTimer() {
  const g = globalThis as { __blmNightly?: boolean };
  if (g.__blmNightly || process.env.NODE_ENV === "test") return;
  g.__blmNightly = true;
  const tick = () => {
    void runPosNightly().catch((e) => console.error("nightly pos", e));
    if (new Date().getUTCHours() < NIGHTLY_UTC_HOUR) return;
    void runNightly().catch((e) => console.error("nightly backup", e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
}
