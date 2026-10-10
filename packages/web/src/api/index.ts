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
import { runNightly, startNightlyTimer } from "./lib/backups";

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
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/** Nightly jobs (backups for now). Point a daily cron at it with the CRON_SECRET as a bearer token. */
app.post("/api/cron/nightly", async (c) => {
  const secret = process.env.CRON_SECRET;
  const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-cron-secret");
  if (!secret || got !== secret) return c.json({ error: "unauthorized" }, 401);
  return c.json(await runNightly(), 200);
});

startNightlyTimer();

export default app;
