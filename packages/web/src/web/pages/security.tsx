import { useState } from "react";
import { Download, HardDriveDownload, LockOpen, Phone, ShieldCheck } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { UnlockPanel, useMinutesLeft } from "../components/private";
import { useLockPrivacy, usePrivacyLog, usePrivacyState, useSetSecurityPhone } from "../queries/privacy";
import { useBackupStatus, useDownloadBackup, useRunBackup } from "../queries/backups";
import { errMsg, num } from "../lib/format";
import { cn } from "../lib/utils";

const COVERED = [
  "Conduct records, write ups and performance plans",
  "Staff contact details: email and phone",
  "Pay, bonuses and reward payouts",
  "Guest reviews that name a team member",
  "Data exports and backups (owner only)",
];

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function size(bytes: number) {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function WallStatus() {
  const st = usePrivacyState();
  const lock = useLockPrivacy();
  const left = useMinutesLeft(st.data?.open ? st.data.until : null);
  const s = st.data;
  if (!s) return <Loading />;
  if (!s.eligible)
    return (
      <div className="rounded-[2px] bg-paper-2 p-5 text-[13.5px] leading-relaxed text-ink-soft">
        Only the owner and the GM hold the keys to private records. Everyone else sees their own record and what they need to run a shift.
      </div>
    );
  if (s.open && left > 0)
    return (
      <div className="rounded-[2px] border border-sage/50 bg-sage/5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-sage text-paper">
              <LockOpen className="size-4" />
            </div>
            <div>
              <div className="eyebrow !text-sage">Open</div>
              <div className="font-display text-[20px] leading-tight">
                Private records are open for {left} more minute{left === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <button onClick={() => lock.mutate({})} disabled={lock.isPending} className="btn btn-ink">
            Close them now
          </button>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-soft">They close on their own when the time is up, and when you sign out. Every record you open is logged for the owner.</p>
      </div>
    );
  return <UnlockPanel what="Private records" />;
}

function PhoneCard() {
  const st = usePrivacyState();
  const set = useSetSecurityPhone();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const s = st.data;
  if (!s?.eligible || s.needsAccount) return null;
  return (
    <div className="rounded-[2px] border rule p-5">
      <div className="eyebrow mb-2 flex items-center gap-2">
        <Phone className="size-3.5" /> Phone for codes
      </div>
      {s.demo ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">In the demo the code shows on screen. On your own account it goes by text to the number you set here.</p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {s.phoneLast4 ? `Codes go to the phone ending ${s.phoneLast4}.` : "No phone set yet."}{" "}
            {s.smsReady ? "" : "Texted codes switch on once SMS is connected. Until then private records open with your password."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await set.mutateAsync({ phone, password });
              setPhone("");
              setPassword("");
            }}
            className="mt-3 space-y-2"
          >
            <input aria-label="Mobile number" type="tel" className="field" placeholder="Mobile number" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            {s.password && (
              <input aria-label="Your password" type="password" autoComplete="current-password" className="field" placeholder="Your password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            <button disabled={set.isPending} className="btn btn-line w-full">
              {set.isPending ? "Saving…" : s.phoneLast4 ? "Change the number" : "Save the number"}
            </button>
            {set.isSuccess && <div className="text-[12.5px] text-sage">Saved. Codes go to the phone ending {set.data.phoneLast4}.</div>}
            <ErrorNote error={set.error} what="Changing the phone" />
          </form>
        </>
      )}
    </div>
  );
}

function BackupsCard() {
  const q = useBackupStatus();
  const run = useRunBackup();
  const dl = useDownloadBackup();
  const d = q.data;
  return (
    <section className="mt-12">
      <SectionTitle
        aside={
          <button onClick={() => run.mutate({})} disabled={run.isPending} className="btn btn-line !h-9">
            <HardDriveDownload className="size-4" /> {run.isPending ? "Backing up…" : "Back up now"}
          </button>
        }
      >
        Backups
      </SectionTitle>
      {q.isLoading ? (
        <Loading />
      ) : !d ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <div className="grid gap-4 border-b rule pb-6 md:grid-cols-3">
            <div>
              <div className="eyebrow mb-1 !text-ink-soft">Last good backup</div>
              <div className="font-display text-[22px]">{d.lastOk ? when(d.lastOk.at) : "None yet"}</div>
              {d.lastOk && (
                <div className="text-[12px] text-ink-soft">
                  {num(d.lastOk.rows)} records · {size(d.lastOk.bytes)}
                </div>
              )}
            </div>
            <div>
              <div className="eyebrow mb-1 !text-ink-soft">Schedule</div>
              <div className="text-[14px]">{d.demo ? "Nightly for real accounts. The sample group backs up when you ask." : "Every night, early morning"}</div>
              <div className="text-[12px] text-ink-soft">Kept {d.keepDays} days</div>
            </div>
            <div>
              <div className="eyebrow mb-1 !text-ink-soft">Where</div>
              <div className="text-[14px]">{d.storage}</div>
              <div className={cn("text-[12px]", d.keyReady ? "text-ink-soft" : "text-oxblood")}>{d.keyReady ? "AES 256, key held on the server" : "Encryption key missing"}</div>
            </div>
          </div>
          {run.error && <div className="mt-3 text-[13px] text-oxblood">{errMsg(run.error)}</div>}
          {run.isSuccess && <div className="mt-3 text-[13px] text-sage">Backed up {num(run.data.rows)} records.</div>}
          <ErrorNote error={dl.error} what="Downloading a backup" />
          {d.runs.length ? (
            <div className="overflow-x-auto">
              <table className="tbl mt-2">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th className="r">Records</th>
                    <th className="r">Size</th>
                    <th aria-label="Download" />
                  </tr>
                </thead>
                <tbody>
                  {d.runs.map((b) => (
                    <tr key={b.id}>
                      <td>{when(b.createdAt)}</td>
                      <td className="text-ink-soft">{b.kind === "nightly" ? "Nightly" : "On request"}</td>
                      <td className="r">{b.status === "ok" ? num(b.rows) : <span className="text-oxblood">Failed</span>}</td>
                      <td className="r text-ink-soft">{b.status === "ok" ? size(b.bytes) : (b.error ?? "")}</td>
                      <td className="r">
                        {b.status === "ok" && (
                          <button onClick={() => dl.mutate(b.id)} disabled={dl.isPending} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-deep hover:underline">
                            <Download className="size-3.5" /> Download
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No backups yet. The first runs tonight, or back up now.</Empty>
          )}
          <p className="mt-3 text-[12px] text-ink-soft">Downloads are a readable copy of every record, so they need private records open and are logged.</p>
        </>
      )}
    </section>
  );
}

function AccessLog() {
  const q = usePrivacyLog();
  return (
    <section className="mt-12">
      <SectionTitle>Access log</SectionTitle>
      {q.isLoading ? (
        <Loading />
      ) : !q.data ? (
        <ErrorNote error={q.error} />
      ) : !q.data.length ? (
        <Empty>No one has opened private records yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>About</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{when(r.at)}</td>
                  <td>
                    <span className="font-semibold">{r.name}</span> <span className="text-[12px] text-ink-soft">{r.role}</span>
                  </td>
                  <td className={cn(r.area === "refused" && "text-oxblood")}>
                    {r.what}
                    {r.detail && <span className="ml-1.5 text-[12px] text-ink-soft">{r.detail}</span>}
                  </td>
                  <td className="text-ink-soft">{r.subject ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function SecurityPage() {
  const v = useViewer();
  const owner = v.me.level === "owner";
  return (
    <Page eyebrow={v.me.orgName} title="Private records">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <WallStatus />
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2">
              <ShieldCheck className="size-3.5" /> What stays private
            </div>
            <ul className="space-y-1.5 text-[14px]">
              {COVERED.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="text-gold-deep">·</span> {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
              Only the owner and the GM can open them, with their password and a code sent to their phone, for 30 minutes at a time. Everyone always sees their own record.
            </p>
          </div>
        </div>
        <div className="space-y-6">
          <PhoneCard />
        </div>
      </div>
      {owner && <BackupsCard />}
      {owner && <AccessLog />}
    </Page>
  );
}
