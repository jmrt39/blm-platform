import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { ping } from "./routes/ping";
import { session } from "./routes/session";
import { stores } from "./routes/stores";
import { team } from "./routes/team";
import { checklists } from "./routes/checklists";
import { shifts } from "./routes/shifts";
import { reports } from "./routes/reports";
import { lineups } from "./routes/lineups";
import { conduct } from "./routes/conduct";
import { training } from "./routes/training";
import { grading } from "./routes/grading";
import { quizzes } from "./routes/quizzes";
import { updates } from "./routes/updates";
import { guests } from "./routes/guests";
import { rewards } from "./routes/rewards";
import { certs } from "./routes/certs";
import { logbook } from "./routes/logbook";
import { slow } from "./routes/slow";
import { setup } from "./routes/setup";
import { library } from "./routes/library";
import { studio } from "./routes/studio";
import { history } from "./routes/history";
import { plans } from "./routes/plans";
import { intake } from "./routes/intake";
import { account } from "./routes/account";
import { privacy } from "./routes/privacy";
import { backups } from "./routes/backups";
import { pos } from "./routes/pos";
import { runNightly, startNightlyTimer } from "./lib/backups";
import { handleInbound, ingest, runPosNightly, verifyWebhook } from "./lib/pos";
import { db } from "./database";
import { posConnections } from "./database/schema";
import { eq } from "drizzle-orm";

export const router = {
  ping,
  session,
  stores,
  team,
  checklists,
  shifts,
  reports,
  lineups,
  conduct,
  training,
  grading,
  quizzes,
  updates,
  guests,
  rewards,
  certs,
  logbook,
  slow,
  setup,
  library,
  studio,
  history,
  plans,
  intake,
  account,
  privacy,
  backups,
  pos,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/** Nightly jobs: backups, Toast pulls and missing night alerts. Point a cron at it (hourly is fine) with CRON_SECRET as a bearer token. */
app.post("/api/cron/nightly", async (c) => {
  const secret = process.env.CRON_SECRET;
  const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-cron-secret");
  if (!secret || got !== secret) return c.json({ error: "unauthorized" }, 401);
  const pos = await runPosNightly();
  return c.json({ ...(await runNightly()), pos }, 200);
});

/** Resend Inbound: a POS emailed its nightly report to a store's pos-...@ address. */
app.post("/api/pos/inbound", async (c) => {
  const body = await c.req.text();
  if (!(await verifyWebhook(c.req.raw.headers, body))) return c.json({ error: "unauthorized" }, 401);
  return c.json(await handleInbound(JSON.parse(body)), 200);
});

/** A relay or script posts one night: CSV as the body, or files in a form. ?date=YYYY-MM-DD is optional. */
app.post("/api/pos/upload/:key", async (c) => {
  const [conn] = await db.select().from(posConnections).where(eq(posConnections.inboundKey, c.req.param("key").toLowerCase()));
  if (!conn || conn.status === "paused") return c.json({ error: "not found" }, 404);
  const date = c.req.query("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const files: { name: string; text: string }[] = [];
  if ((c.req.header("content-type") ?? "").includes("multipart/form-data")) {
    const form = await c.req.formData();
    for (const v of form.values() as Iterable<string | File>) if (typeof v !== "string") files.push({ name: v.name || "report.csv", text: await v.text() });
  } else files.push({ name: c.req.query("name") || "report.csv", text: await c.req.text() });
  if (!files.some((f) => f.text.trim())) return c.json({ error: "empty" }, 400);
  if (files.reduce((a, f) => a + f.text.length, 0) > 20_000_000) return c.json({ error: "too large" }, 413);
  const r = await ingest(conn, files, { source: "upload", businessDate: date ?? null });
  return c.json(r, r.ok ? 200 : 422);
});

startNightlyTimer();

export default app;
