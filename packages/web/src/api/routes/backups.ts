import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { viewerBase, type Viewer } from "../lib/access";
import { requireOpen } from "../lib/privacy";
import { backupOrg, KEEP_DAYS, lastBackups, readBackup, s3Ready } from "../lib/backups";

function owner(v: Viewer) {
  if (v.level !== "owner") throw new ORPCError("FORBIDDEN", { message: "Only the owner can see backups." });
}

export const backups = {
  /** The last runs and where they are kept. Owner only. */
  status: viewerBase.handler(async ({ context }) => {
    const v = context.viewer;
    owner(v);
    const list = await lastBackups(v.orgId, 14);
    const last = list.find((b) => b.status === "ok") ?? null;
    return {
      keepDays: KEEP_DAYS,
      storage: s3Ready() ? "Encrypted, in private cloud storage" : "Encrypted, in the database",
      keyReady: /^[0-9a-f]{64}$/i.test(process.env.BACKUP_KEY ?? ""),
      demo: v.isDemo,
      lastOk: last ? { at: last.createdAt.getTime(), rows: last.rows, bytes: last.bytes } : null,
      runs: list.map((b) => ({ ...b, createdAt: b.createdAt.getTime() })),
    };
  }),

  /** Back up now, on top of the nightly run. */
  runNow: viewerBase.handler(async ({ context }) => {
    const v = context.viewer;
    owner(v);
    const r = await backupOrg(v.orgId, "manual");
    if (!r.ok) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: `The backup failed: ${r.error}` });
    return r;
  }),

  /** The readable contents of one backup. Owner only, with private records open, and logged. */
  download: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    owner(v);
    await requireOpen(v, "backup", { detail: "Downloaded a backup", headers: context.headers });
    const r = await readBackup(v.orgId, input.id);
    if (!r) throw new ORPCError("NOT_FOUND", { message: "That backup is gone." });
    const slug = v.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { filename: `${slug || "blm"}-backup-${r.backup.forDate}.json`, json: r.json };
  }),
};
