// Studio, Intake tab: the owner's workbook in, and the running list of what is still missing.
import { useState } from "react";
import { AlertCircle, Check, Download, FileUp, RefreshCw, Sparkles, X } from "lucide-react";
import { ErrorNote, Loading } from "./shell";
import { useImportIntake, useIntakeMissing, useRefreshStandard } from "../queries/intake";
import { useDraftItems } from "../queries/studio";
import { readIntake, TEMPLATE_URL, type IntakeData, type Problem } from "../lib/intake";
import { errMsg, num } from "../lib/format";
import { cn } from "../lib/utils";
import { when } from "../pages/studio";

type Tab = "brief" | "materials" | "history" | "build" | "publish";
const TAB_LABEL: Record<Tab, string> = { brief: "Open the brief", materials: "Open materials", history: "Open last year", build: "Open the build", publish: "Open publish" };

export function IntakeTab({ orgId, orgName, onTab }: { orgId: string; orgName: string; onTab: (t: Tab) => void }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr]">
      <IntakeSheet orgId={orgId} orgName={orgName} />
      <Missing orgId={orgId} onTab={onTab} />
    </div>
  );
}

function IntakeSheet({ orgId, orgName }: { orgId: string; orgName: string }) {
  const imp = useImportIntake();
  const [read, setRead] = useState<{ file: string; data: IntakeData; problems: Problem[] } | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [report, setReport] = useState<{ section: string; line: string; ok: boolean }[] | null>(null);
  const d = read?.data;
  const answers = d ? [d.group.preferences, d.group.reputation, d.group.standards, d.group.gaps].filter(Boolean).length : 0;
  const storesIn = d ? new Set(d.team.map((t) => t.store || "(one store)")) : new Set<string>();

  return (
    <div>
      <div className="eyebrow mb-3">The intake sheet</div>
      <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
        Send this workbook to the owner. When it comes back, import it here. Stores and targets, review pages, the team, last year's sales and the owner's own answers each land in their place. Importing again updates what is there; nothing doubles.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={TEMPLATE_URL} download="BLM client intake.xlsx" className="btn btn-line">
          <Download className="size-4" /> Download the intake sheet
        </a>
        <label className="btn btn-ink cursor-pointer">
          <FileUp className="size-4" /> Import a filled sheet
          <input
            aria-label="Filled intake sheet"
            type="file"
            className="hidden"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setReport(null);
              setReadErr(null);
              try {
                const r = await readIntake(f);
                setRead({ file: f.name, ...r });
              } catch (x) {
                setRead(null);
                setReadErr(`Could not read ${f.name}. Save it as an Excel workbook (.xlsx) and try again. ${errMsg(x)}`);
              }
            }}
          />
        </label>
      </div>
      {readErr && <div className="mt-4 text-[13px] text-oxblood">{readErr}</div>}

      {d && read && (
        <div className="mt-6 border border-paper-line bg-paper-2/40 p-5">
          <div className="eyebrow mb-1">Ready to import into {orgName}</div>
          <div className="mb-4 text-[12.5px] text-ink-soft">{read.file}</div>
          <table className="tbl">
            <tbody>
              <Line label="Owner" value={d.group.ownerEmail ? `${d.group.ownerName || "No name"}, ${d.group.ownerEmail}` : "Not filled in"} where="Owner access" />
              <Line label="Owner's answers" value={`${answers} of 4`} where="Brief" />
              <Line label="Stores" value={d.stores.length ? d.stores.map((x) => x.name).join(", ") : "None"} where="Stores, targets, review pages" />
              <Line label="Team" value={d.team.length ? `${num(d.team.length)} people${storesIn.size > 1 ? ` across ${storesIn.size} stores` : ""}` : "None"} where="Roster, with PINs and 30/60/90 plans" />
              <Line label="Last year" value={d.history.length ? `${num(d.history.length)} days` : "None"} where="Last year tab" />
              <Line label="Material" value={`${d.materials.filter((m) => m.have || m.how || m.notes).length} answers`} where="Missing list" />
            </tbody>
          </table>
          {read.problems.length > 0 && (
            <div className="mt-4 border border-oxblood/30 bg-oxblood/5 p-3">
              <div className="eyebrow mb-1.5 !text-oxblood">
                {read.problems.length} {read.problems.length === 1 ? "row needs" : "rows need"} a fix. The rest imports fine.
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-auto text-[12.5px] text-oxblood">
                {read.problems.map((p, i) => (
                  <li key={i}>
                    {p.tab}, row {p.row}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ErrorNote error={imp.error} />
          <div className="mt-4 flex gap-3">
            <button
              className="btn btn-gold"
              disabled={imp.isPending}
              onClick={async () => {
                const r = await imp.mutateAsync({ orgId, fileName: read.file, ...d }).catch(() => null);
                if (r) {
                  setReport(r.report);
                  setRead(null);
                }
              }}
            >
              {imp.isPending ? "Importing…" : "Import"}
            </button>
            <button className="btn btn-line" onClick={() => setRead(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="mt-6 border border-sage/40 bg-sage/5 p-5">
          <div className="eyebrow mb-3 !text-sage">Imported</div>
          <ul className="space-y-1.5 text-[13px]">
            {report.map((r, i) => (
              <li key={i} className={cn("flex gap-2", r.ok ? "text-ink" : "text-oxblood")}>
                {r.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-sage" /> : <AlertCircle className="mt-0.5 size-3.5 shrink-0" />}
                <span>
                  <b className="font-semibold">{r.section}.</b> {r.line}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-soft">New people get a personal PIN each; managers see them on the Team page. Files from the Material tab go in under Materials.</p>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, where }: { label: string; value: string; where: string }) {
  return (
    <tr>
      <td className="w-[120px] font-semibold">{label}</td>
      <td>{value}</td>
      <td className="r text-[12px] text-ink-soft">to {where}</td>
    </tr>
  );
}

function Missing({ orgId, onTab }: { orgId: string; onTab: (t: Tab) => void }) {
  const q = useIntakeMissing(orgId);
  const refresh = useRefreshStandard();
  const draft = useDraftItems();
  const [msg, setMsg] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const m = q.data;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="eyebrow">What's missing before the first shift</div>
        <div className="text-[12.5px] text-ink-soft">
          <b className="text-oxblood">{m.missing} missing</b> · <b className="text-gold-deep">{m.check} to check</b> · {m.done} of {m.total} done
        </div>
      </div>
      {m.lastImport && (
        <p className="mb-4 text-[12px] text-ink-soft">
          Last sheet: {m.lastImport.file}, imported {when(m.lastImport.at)} by {m.lastImport.by}.
        </p>
      )}
      {msg && <div className="mb-3 text-[13px] text-sage">{msg}</div>}
      <ErrorNote error={refresh.error ?? draft.error} />
      <div className="space-y-6">
        {m.groups.map((g) => (
          <section key={g.title}>
            <div className="mb-1.5 flex items-center justify-between border-b border-ink/80 pb-1.5">
              <div className="font-display text-[19px] text-ink">{g.title}</div>
              <div className="text-[11.5px] text-ink-soft">
                {g.gaps.filter((x) => x.state === "done").length} of {g.gaps.length}
              </div>
            </div>
            <ul className="divide-y divide-paper-line">
              {g.gaps.map((x) => (
                <li key={x.key} className="grid grid-cols-[20px_1fr_auto] items-start gap-2.5 py-2.5">
                  <span className="pt-0.5">
                    {x.state === "done" ? <Check className="size-4 text-sage" /> : x.state === "missing" ? <X className="size-4 text-oxblood" /> : <AlertCircle className="size-4 text-gold-deep" />}
                  </span>
                  <div>
                    <div className={cn("text-[13.5px] font-semibold", x.state === "done" ? "text-ink" : x.state === "missing" ? "text-oxblood" : "text-ink")}>{x.label}</div>
                    <div className="text-[12.5px] leading-snug text-ink-soft">{x.detail}</div>
                  </div>
                  {x.state !== "done" && x.fix?.action === "refresh" ? (
                    <button
                      className="btn btn-line !h-8 !px-3 !text-[12px]"
                      disabled={refresh.isPending}
                      onClick={async () => {
                        const r = await refresh.mutateAsync({ orgId }).catch(() => null);
                        if (r) setMsg(`${r.updated} items brought up to the latest text${r.added ? `, ${r.added} new ones added as drafts for you to approve` : ""}. Publish again to send it to the client.`);
                      }}
                    >
                      <RefreshCw className="size-3.5" /> {refresh.isPending ? "Updating…" : "Bring in the latest"}
                    </button>
                  ) : x.state !== "done" && x.fix?.action === "rewrite" && x.fix.ids?.length ? (
                    <button
                      className="btn btn-line !h-8 !px-3 !text-[12px]"
                      disabled={draft.isPending}
                      onClick={async () => {
                        const r = await draft
                          .mutateAsync({
                            ids: x.fix!.ids!,
                            instructions:
                              "This item was written for the 1906 demo house. Rewrite every mention of 1906 for this client: their name, their story, their own cocktails, dishes and table setting, taken from their material and brief. Where the material does not say, write it plainly for this house and do not invent names, recipes or prices. Keep the structure, the section headings quizzes point to, and anything that is not about 1906.",
                          })
                          .catch(() => null);
                        if (r) setMsg(`${r.queued} items are being rewritten. They show as drafts on the build; check each one, then approve and publish.`);
                      }}
                    >
                      <Sparkles className="size-3.5" /> {draft.isPending ? "Queuing…" : "Rewrite for this house"}
                    </button>
                  ) : x.state !== "done" && x.fix?.tab ? (
                    <button className="whitespace-nowrap pt-0.5 text-[12px] font-semibold text-ink-soft underline hover:text-ink" onClick={() => onTab(x.fix!.tab!)}>
                      {TAB_LABEL[x.fix.tab]}
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
