import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Check, CloudDownload, KeyRound, Mail, PlugZap, RefreshCw, Upload } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { CopyLink } from "../components/invite-card";
import { StoreTabs } from "./checklists";
import { usePos, usePullPos, useRotatePosKey, useSavePos, useTestPos } from "../queries/pos";
import { POS_METHOD_LABEL, POS_SYSTEMS, posSystem, type PosMethod } from "../../shared/pos";
import { money, num, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Data = NonNullable<ReturnType<typeof usePos>["data"]>;

const SOURCE_LABEL: Record<string, string> = { toast_sftp: "Toast export", email: "Email", upload: "Posted file", manual: "At close" };
const STATUS_LABEL: Record<string, string> = { setup: "Being set up", live: "Live", paused: "Paused" };

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PosPage() {
  const v = useViewer();
  const allowed = v.me.level === "owner" || v.me.level === "area" || (v.me.level === "manager" && v.me.member?.role === "gm");
  const q = usePos(v.storeId, allowed);
  return (
    <Page eyebrow={`${v.store?.name ?? v.me.orgName} · Nightly figures`} title="POS import">
      <StoreTabs />
      {!allowed ? (
        <Empty>The owner or the GM sets up the POS import. Nightly figures still land on Shift report for you to load and sign.</Empty>
      ) : q.isLoading ? (
        <Loading />
      ) : !q.data ? (
        <ErrorNote error={q.error} />
      ) : (
        <PosBody key={q.data.store.id} d={q.data} />
      )}
    </Page>
  );
}

function PosBody({ d }: { d: Data }) {
  const missing = d.nights.filter((n) => n.pos === "missing" && !n.signed);
  return (
    <>
      {missing.length > 0 && (
        <div className="mb-8 flex gap-3 rounded-[2px] border border-oxblood/40 bg-oxblood/5 p-4 text-[13.5px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-oxblood" />
          <div>
            <div className="font-semibold text-oxblood">
              {missing.length === 1 ? `No figures arrived for ${shortDay(missing[0]!.date)}.` : `No figures arrived for ${missing.length} nights.`}
            </div>
            <div className="text-ink-soft">
              Check the POS is still sending, then collect the night again or have the closing manager enter it on{" "}
              <Link href="/shift-report" className="font-semibold text-gold-deep hover:underline">
                Shift report
              </Link>
              .
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <Setup d={d} />
        <Delivery d={d} />
      </div>
      <Nights d={d} />
      <Log d={d} />
    </>
  );
}

function Setup({ d }: { d: Data }) {
  const save = useSavePos();
  const c = d.connection;
  const [f, setF] = useState({
    system: c?.system ?? "toast",
    method: (c?.method ?? "email") as PosMethod,
    pullAt: c?.pullAt ?? "05:00",
    sftpUsername: c?.sftpUsername ?? "",
    exportId: c?.exportId ?? "",
  });
  const sys = posSystem(f.system);
  const methods = sys.methods as readonly PosMethod[];
  useEffect(() => {
    if (!methods.includes(f.method)) setF((x) => ({ ...x, method: methods[0]! }));
  }, [methods, f.method]);
  const status = c?.status ?? "setup";
  return (
    <section>
      <SectionTitle
        aside={
          c ? (
            <span className={cn("chip !text-[11px]", status === "live" ? "!border-sage text-sage" : status === "paused" ? "text-ink-soft" : "text-gold-deep")}>{STATUS_LABEL[status]}</span>
          ) : null
        }
      >
        Connection
      </SectionTitle>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ storeId: d.store.id, ...f });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Point of sale</span>
            <select aria-label="Point of sale" className="field" value={f.system} onChange={(e) => setF({ ...f, system: e.target.value })}>
              {POS_SYSTEMS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">How figures arrive</span>
            <select aria-label="How figures arrive" className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PosMethod })}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {POS_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-soft">{sys.note}</p>

        {f.method === "toast_sftp" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Toast SFTP username</span>
              <input aria-label="Toast SFTP username" className="field" placeholder="From Toast Web, SSH Keys" value={f.sftpUsername} onChange={(e) => setF({ ...f, sftpUsername: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Export ID for this location</span>
              <input aria-label="Toast export ID" className="field" placeholder="From Data Exports" value={f.exportId} onChange={(e) => setF({ ...f, exportId: e.target.value })} />
            </label>
          </div>
        )}

        {f.method !== "manual" && (
          <label className="block">
            <span className="label">Look for figures after ({d.store.timezone.replace(/_/g, " ")})</span>
            <input aria-label="Pull time" type="time" className="field !w-40" value={f.pullAt} onChange={(e) => setF({ ...f, pullAt: e.target.value })} />
            <span className="mt-1 block text-[12px] text-ink-soft">If nothing has arrived three hours later, the owner and GM get an email.</span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button disabled={save.isPending} className="btn btn-ink">
            {save.isPending ? "Saving…" : c ? "Save changes" : "Set up the import"}
          </button>
          {c && (
            <button
              type="button"
              disabled={save.isPending}
              className="btn btn-line"
              onClick={() => save.mutate({ storeId: d.store.id, ...f, status: status === "paused" ? "live" : "paused" })}
            >
              {status === "paused" ? "Resume" : "Pause"}
            </button>
          )}
          {save.isSuccess && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-sage">
              <Check className="size-3.5" /> Saved
            </span>
          )}
        </div>
        <ErrorNote error={save.error} what="Saving the connection" />
      </form>
      {c && f.method === "toast_sftp" && c.method === "toast_sftp" && <ToastActions d={d} />}
    </section>
  );
}

function ToastActions({ d }: { d: Data }) {
  const test = useTestPos();
  const pull = usePullPos();
  const [date, setDate] = useState(d.nights[0]?.date ?? "");
  return (
    <div className="mt-6 space-y-4 rounded-[2px] bg-paper-2 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => test.mutate({ storeId: d.store.id })} disabled={test.isPending || !d.ready.toast} className="btn btn-line !h-9">
          <PlugZap className="size-4" /> {test.isPending ? "Testing…" : "Test the connection"}
        </button>
        {test.data && <span className={cn("text-[12.5px]", test.data.ok ? "text-sage" : "text-oxblood")}>{test.data.message}</span>}
      </div>
      <ErrorNote error={test.error} what="Testing" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Night</span>
          <input aria-label="Night to collect" type="date" className="field !h-9 !w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" onClick={() => pull.mutate({ storeId: d.store.id, date })} disabled={pull.isPending || !date || !d.ready.toast} className="btn btn-ink !h-9">
          <CloudDownload className="size-4" /> {pull.isPending ? "Collecting…" : "Collect a night"}
        </button>
      </div>
      {pull.data &&
        (pull.data.ok ? (
          <div className="text-[12.5px] text-sage">
            {shortDay(pull.data.businessDate)}: {num(pull.data.rows)} people, {money(pull.data.netSales)}. It waits on Shift report for the manager to sign.
          </div>
        ) : (
          <div className="text-[12.5px] text-oxblood">{pull.data.error}</div>
        ))}
      <ErrorNote error={pull.error} what="Collecting" />
      {!d.ready.toast && <div className="text-[12.5px] text-oxblood">The BLM Toast key is not installed on the server yet.</div>}
    </div>
  );
}

function Delivery({ d }: { d: Data }) {
  const rotate = useRotatePosKey();
  const c = d.connection;
  if (!c)
    return (
      <section>
        <SectionTitle>Where figures go</SectionTitle>
        <Empty>Set up the import and this store gets its own address and upload link.</Empty>
      </section>
    );
  return (
    <section className="min-w-0 space-y-6">
      <SectionTitle>Where figures go</SectionTitle>
      {c.method === "toast_sftp" && (
        <div>
          <div className="eyebrow mb-2 flex items-center gap-2">
            <KeyRound className="size-3.5" /> BLM key for Toast
          </div>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft">
            <li>In Toast Web open Reports, then Settings, then SSH Keys.</li>
            <li>Add the key below. Toast shows the SFTP username next to it.</li>
            <li>Under Data Exports, view the restaurant mapping for this location's export ID.</li>
            <li>Paste both into the connection and test it.</li>
          </ol>
          {d.toastPublicKey ? <CopyLink url={d.toastPublicKey} /> : <div className="text-[12.5px] text-oxblood">The BLM key is not installed on the server yet.</div>}
        </div>
      )}
      <div>
        <div className="eyebrow mb-2 flex items-center gap-2">
          <Mail className="size-3.5" /> Store email address
        </div>
        <p className="mb-2 text-[13px] leading-relaxed text-ink-soft">Schedule the nightly server sales report to email this address as a CSV.</p>
        <CopyLink url={c.address} />
        {!d.ready.inbound && <div className="mt-1.5 text-[12px] text-gold-deep">Email delivery switches on once inbound mail is connected. Until then, use the upload link or Shift report.</div>}
      </div>
      <div>
        <div className="eyebrow mb-2 flex items-center gap-2">
          <Upload className="size-3.5" /> Upload link
        </div>
        <p className="mb-2 text-[13px] leading-relaxed text-ink-soft">For a script or relay: post the CSV to this link. Add ?date=YYYY-MM-DD to name the night.</p>
        <CopyLink url={c.uploadUrl} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (confirm("Make a new address and link? The old ones stop working at once.")) rotate.mutate({ storeId: d.store.id });
          }}
          disabled={rotate.isPending}
          className="btn btn-line !h-9"
        >
          <RefreshCw className="size-4" /> New address
        </button>
        {rotate.isSuccess && <span className="text-[12.5px] text-sage">Done. Update the POS with the new address.</span>}
      </div>
      <ErrorNote error={rotate.error} what="Making a new address" />
      {c.lastError && (
        <div className="rounded-[2px] bg-oxblood/5 p-3 text-[12.5px] text-oxblood">
          <span className="font-semibold">Last problem:</span> {c.lastError}
        </div>
      )}
      {c.lastImportAt && <div className="text-[12px] text-ink-soft">Last figures arrived {when(c.lastImportAt)}.</div>}
    </section>
  );
}

function Nights({ d }: { d: Data }) {
  return (
    <section className="mt-12">
      <SectionTitle>Last two weeks</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {d.nights.map((n) => {
          const tone = n.signed ? "border-sage/50 bg-sage/5" : n.pos === "ok" ? "border-gold/60 bg-gold/10" : n.pos === "missing" || n.pos === "failed" ? "border-oxblood/40 bg-oxblood/5" : "border-paper-line";
          const label = n.signed ? "Signed" : n.pos === "ok" ? "Waiting to sign" : n.pos === "missing" ? "Missing" : n.pos === "failed" ? "Failed" : "Nothing yet";
          return (
            <Link key={n.date} href={`/shift-report?date=${n.date}`} className={cn("block rounded-[2px] border p-3 hover:border-ink", tone)}>
              <div className="text-[12px] font-semibold">{shortDay(n.date)}</div>
              <div className={cn("text-[11.5px]", n.signed ? "text-sage" : n.pos === "ok" ? "text-gold-deep" : n.pos === "none" ? "text-ink-soft" : "text-oxblood")}>{label}</div>
              <div className="mt-1 font-display text-[16px] leading-none">{n.netSales != null ? money(n.netSales) : "·"}</div>
              {n.signed && n.pos === "ok" && <div className="mt-1 text-[10.5px] text-ink-soft">From the POS</div>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Log({ d }: { d: Data }) {
  return (
    <section className="mt-12">
      <SectionTitle>Import log</SectionTitle>
      {!d.log.length ? (
        <Empty>Nothing has arrived yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Arrived</th>
                <th>Night</th>
                <th>From</th>
                <th>Result</th>
                <th className="r">People</th>
                <th className="r">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {d.log.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{when(l.createdAt)}</td>
                  <td className="whitespace-nowrap">{shortDay(l.businessDate)}</td>
                  <td className="text-ink-soft">{SOURCE_LABEL[l.source] ?? l.source}</td>
                  <td className={cn(l.status === "ok" ? "text-sage" : "text-oxblood")}>
                    {l.status === "ok" ? "Read" : l.status === "missing" ? "Missing" : l.status === "partial" ? "Partly read" : "Failed"}
                    {l.message && <div className="max-w-[360px] text-[12px] text-ink-soft">{l.message}</div>}
                  </td>
                  <td className="r">{l.status === "ok" ? num(l.rows) : ""}</td>
                  <td className="r">{l.netSales != null ? money(l.netSales) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
