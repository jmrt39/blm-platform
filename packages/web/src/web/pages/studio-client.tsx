// One client's build: brief, material, history, the content board, and publishing.
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Eye, FileUp, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { Empty, Stat } from "../components/bits";
import {
  useAddSource,
  useClearHistory,
  useImportHistory,
  usePublishProgram,
  useRemoveSource,
  useSaveBrief,
  useStudioBuild,
  useStudioSource,
  useSuggestPriorities,
} from "../queries/studio";
import { errMsg, money, num } from "../lib/format";
import { cn } from "../lib/utils";
import { StudioBoard } from "../components/studio-board";
import { IntakeTab } from "../components/studio-intake";
import { when } from "./studio";

export type Build = NonNullable<ReturnType<typeof useStudioBuild>["data"]>;
type Brief = Build["impl"]["brief"];

const TABS = [
  { key: "intake", label: "Intake" },
  { key: "brief", label: "Brief" },
  { key: "materials", label: "Materials" },
  { key: "history", label: "Last year" },
  { key: "build", label: "Build" },
  { key: "publish", label: "Publish" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function StudioClient({ orgId }: { orgId: string }) {
  const q = useStudioBuild(orgId);
  const [tab, setTab] = useState<TabKey>(() => (sessionStorage.getItem(`studio-tab-${orgId}`) as TabKey) || "intake");
  useEffect(() => sessionStorage.setItem(`studio-tab-${orgId}`, tab), [tab, orgId]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const b = q.data;
  const approved = b.items.filter((i) => i.status === "approved").length;
  const live = b.items.filter((i) => i.status !== "excluded").length;
  const counts: Partial<Record<TabKey, string>> = {
    materials: String(b.sources.length),
    history: `${b.stores.filter((s) => s.history.days >= 300).length}/${b.stores.length}`,
    build: `${approved}/${live}`,
    publish: b.program ? `v${b.program.version}` : "",
  };
  return (
    <Page
      eyebrow={
        <>
          Build · {b.stores.length} {b.stores.length === 1 ? "store" : "stores"} · {b.owners[0]?.name ?? "no owner on file"}
        </>
      }
      title={b.org.name}
      aside={
        <>
          {b.busy && <span className="chip !border-gold/60 !text-gold-deep">AI is drafting</span>}
          {b.program ? <span className="chip !border-sage/50 !text-sage">Live · version {b.program.version}</span> : <span className="chip">On the standard program</span>}
          <Link href="/studio" className="btn btn-line">
            <ArrowLeft className="size-4" /> Clients
          </Link>
        </>
      }
    >
      <div className="-mt-3 mb-7 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-paper-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 pb-3 pt-1 text-[12px] font-bold uppercase tracking-[0.14em]",
              tab === t.key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {counts[t.key] && <span className="figure text-[12px] tracking-normal text-gold-deep">{counts[t.key]}</span>}
          </button>
        ))}
      </div>
      {tab === "intake" && <IntakeTab orgId={b.org.id} orgName={b.org.name} onTab={setTab} />}
      {tab === "brief" && <BriefTab b={b} />}
      {tab === "materials" && <MaterialsTab b={b} />}
      {tab === "history" && <HistoryTab b={b} />}
      {tab === "build" && <StudioBoard b={b} />}
      {tab === "publish" && <PublishTab b={b} onBuild={() => setTab("build")} />}
    </Page>
  );
}

/* ───────────────────────── Brief ───────────────────────── */

function Area({ label, hint, value, onChange, rows = 5 }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {hint && <span className="-mt-1 mb-1.5 block text-[12px] text-ink-soft/80">{hint}</span>}
      <textarea aria-label={label} className="field !h-auto py-2.5 leading-relaxed" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function BriefTab({ b }: { b: Build }) {
  const save = useSaveBrief();
  const suggest = useSuggestPriorities();
  const [f, setF] = useState<Brief>(() => ({
    ...b.impl.brief,
    storeTargets: b.stores.map((s) => ({ storeId: s.id, ticketTarget: b.impl.brief.storeTargets.find((t) => t.storeId === s.id)?.ticketTarget ?? s.ticketTarget })),
  }));
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(b.impl.brief);
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => (setF({ ...f, [k]: v }), setSaved(false));
  const setP = (i: number, patch: Partial<Brief["priorities"][number]>) => set("priorities", f.priorities.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="eyebrow">From the audit</div>
        <Area
          label="Audit findings"
          hint="What you saw on the floor and in the numbers. Paste your audit notes; the AI uses them for every draft."
          rows={10}
          value={f.findings}
          onChange={(v) => set("findings", v)}
        />
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="label !mb-0">Priorities, most important first</span>
            <button
              type="button"
              className="btn btn-line !h-8 !px-3 !text-[12px]"
              disabled={suggest.isPending || f.findings.trim().length < 20}
              onClick={async () => {
                const r = await suggest.mutateAsync({ findings: f.findings, preferences: f.preferences }).catch(() => null);
                if (r) set("priorities", r);
              }}
            >
              <Sparkles className="size-3.5" /> {suggest.isPending ? "Reading the findings…" : f.priorities.length ? "Suggest again" : "Suggest from findings"}
            </button>
          </div>
          <ErrorNote error={suggest.error} />
          {f.priorities.length === 0 ? (
            <Empty>No priorities yet. Write the findings, then suggest them or add your own.</Empty>
          ) : (
            <ol className="space-y-2">
              {f.priorities.map((p, i) => (
                <li key={i} className="grid grid-cols-[22px_1fr] items-start gap-2 border border-paper-line bg-paper-2/40 p-2.5">
                  <span className="figure pt-2 text-[15px] text-gold-deep">{i + 1}</span>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input aria-label="Priority" className="field !h-9 min-w-0 flex-1 font-semibold" value={p.title} onChange={(e) => setP(i, { title: e.target.value })} placeholder="Sell the bottle at tables of three or more" />
                      <select aria-label="Weight" className="field !h-9 !w-[92px] shrink-0 !px-2 text-[12.5px]" value={p.weight} onChange={(e) => setP(i, { weight: e.target.value as "high" | "medium" | "low" })}>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <button type="button" aria-label="Remove priority" className="shrink-0 text-ink-soft hover:text-oxblood" onClick={() => set("priorities", f.priorities.filter((_, j) => j !== i))}>
                        <X className="size-4" />
                      </button>
                    </div>
                    <textarea aria-label="Detail" className="field !h-auto resize-y py-2 text-[13px] leading-snug" rows={3} value={p.detail} onChange={(e) => setP(i, { detail: e.target.value })} placeholder="Why, and what good looks like" />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {f.priorities.length < 12 && (
            <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink" onClick={() => set("priorities", [...f.priorities, { title: "", detail: "", weight: "medium" }])}>
              <Plus className="size-3.5" /> Add a priority
            </button>
          )}
        </div>
      </div>
      <div className="space-y-6">
        <div className="eyebrow">From the owner</div>
        <Area label="Owner preferences" hint="How they want the room to feel, what they will and will not do." value={f.preferences} onChange={(v) => set("preferences", v)} />
        <Area label="Reputation they want" hint="What guests should say on the way out, and in reviews." rows={4} value={f.reputation} onChange={(v) => set("reputation", v)} />
        <Area label="House standards" hint="Non negotiables: dress, greeting time, table maintenance, phones." value={f.standards} onChange={(v) => set("standards", v)} />
        <div>
          <span className="label">Store targets, spend per ticket</span>
          <table className="tbl">
            <tbody>
              {b.stores.map((s) => {
                const t = f.storeTargets.find((x) => x.storeId === s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <div className="text-[11.5px] text-ink-soft">Now {money(s.ticketTarget)}</div>
                    </td>
                    <td className="r w-[130px]">
                      <input
                        aria-label={`Target for ${s.name}`}
                        className="field figure !h-9 text-right"
                        inputMode="decimal"
                        value={t?.ticketTarget ?? ""}
                        onChange={(e) => set("storeTargets", f.storeTargets.map((x) => (x.storeId === s.id ? { ...x, ticketTarget: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-1.5 text-[12px] text-ink-soft">Applied to the stores when you publish.</div>
        </div>
        <ErrorNote error={save.error} />
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ink"
            disabled={save.isPending || !dirty}
            onClick={async () => {
              await save.mutateAsync({ orgId: b.org.id, brief: { ...f, priorities: f.priorities.filter((p) => p.title.trim()) } });
              setSaved(true);
            }}
          >
            {save.isPending ? "Saving…" : "Save the brief"}
          </button>
          {saved && !dirty && <span className="text-[12.5px] text-sage">Saved. New drafts will use it.</span>}
          {dirty && <span className="text-[12.5px] text-ink-soft">Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Materials ───────────────────────── */

const KINDS = [
  { value: "menu", label: "Food menu" },
  { value: "wine", label: "Wine list" },
  { value: "bar", label: "Bar and cocktail list" },
  { value: "steps_of_service", label: "Steps of service" },
  { value: "standards", label: "Standards" },
  { value: "protocols", label: "Protocols (opening, closing, allergies, comps, voids, cash)" },
  { value: "pos", label: "POS guide" },
  { value: "other", label: "Other" },
] as const;
type Kind = (typeof KINDS)[number]["value"];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label.split(" (")[0] ?? k;

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

function MaterialsTab({ b }: { b: Build }) {
  const add = useAddSource();
  const remove = useRemoveSource();
  const [kind, setKind] = useState<Kind>("menu");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const missing = KINDS.filter((k) => k.value !== "other" && k.value !== "pos" && !b.sources.some((s) => s.kind === k.value));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr]">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (file && file.size > 8 * 1024 * 1024) return setErr("Files up to 8 MB. Split a longer manual into parts.");
          try {
            const f = file ? { name: file.name, mediaType: file.type || "application/octet-stream", base64: await readBase64(file) } : null;
            await add.mutateAsync({ orgId: b.org.id, kind, title: title.trim() || file?.name || kindLabel(kind), text, file: f });
            setTitle("");
            setText("");
            setFile(null);
            setKey((k) => k + 1);
          } catch (x) {
            setErr(errMsg(x));
          }
        }}
      >
        <div className="eyebrow">Add material</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">What it is</span>
            <select aria-label="What it is" className="field" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Title</span>
            <input aria-label="Title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner menu, fall" />
          </label>
        </div>
        <label className="block">
          <span className="label">Paste the text</span>
          <textarea aria-label="Paste the text" className="field !h-auto py-2.5 text-[13px] leading-relaxed" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a menu, a wine list, the steps of service…" />
        </label>
        <label className="flex cursor-pointer items-center gap-3 border border-dashed border-paper-line px-4 py-3 text-[13px] text-ink-soft hover:border-ink">
          <FileUp className="size-4 text-gold-deep" />
          <span className="flex-1 truncate">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Or attach a PDF, a photo of the menu, or a text file"}</span>
          <input aria-label="Attach a file" key={key} type="file" className="hidden" accept="application/pdf,image/*,.txt,.md,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && (
            <button type="button" aria-label="Remove file" onClick={(e) => (e.preventDefault(), setFile(null), setKey((k) => k + 1))}>
              <X className="size-4" />
            </button>
          )}
        </label>
        {file && /pdf|image/.test(file.type) && <div className="text-[12px] text-ink-soft">PDFs and photos are read by the AI word for word. A long manual takes a minute.</div>}
        {err && <div className="rounded-[2px] border border-oxblood/40 bg-oxblood/5 px-3 py-2 text-[13px] text-oxblood">{err}</div>}
        <button className="btn btn-ink" disabled={add.isPending || (!text.trim() && !file)}>
          <Upload className="size-4" /> {add.isPending ? (file && /pdf|image/.test(file.type) ? "Reading the file…" : "Adding…") : "Add to the build"}
        </button>
      </form>
      <div>
        <div className="eyebrow mb-3">Collected · {b.sources.length}</div>
        {missing.length > 0 && <div className="mb-4 text-[12.5px] text-ink-soft">Still to collect: {missing.map((m) => kindLabel(m.value)).join(", ")}.</div>}
        {b.sources.length === 0 ? (
          <Empty>Nothing yet. The AI only uses facts from material collected here, so start with the menu.</Empty>
        ) : (
          <ul className="divide-y divide-paper-line border-y border-paper-line">
            {b.sources.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{s.title}</span>
                      <span className="chip">{kindLabel(s.kind)}</span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-soft">
                      {num(s.chars)} characters{s.fileName ? ` · from ${s.fileName}` : ""} · {when(s.createdAt)}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-soft">{s.preview}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button aria-label="View" className="grid size-8 place-items-center text-ink-soft hover:text-ink" onClick={() => setView(s.id)}>
                      <Eye className="size-4" />
                    </button>
                    <button
                      aria-label="Remove"
                      className="grid size-8 place-items-center text-ink-soft hover:text-oxblood"
                      onClick={() => confirm(`Remove ${s.title}?`) && remove.mutate({ id: s.id })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {view && <SourceViewer id={view} onClose={() => setView(null)} />}
    </div>
  );
}

function SourceViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useStudioSource(id);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="sheet relative h-full w-full max-w-[720px] overflow-y-auto p-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{q.data ? kindLabel(q.data.kind) : "Material"}</div>
            <div className="font-display text-[28px] text-ink">{q.data?.title ?? "Loading"}</div>
          </div>
          <button aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        {q.data && <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{q.data.text}</pre>}
      </div>
    </div>
  );
}

/* ───────────────────────── Last year ───────────────────────── */

type Row = { date: string; netSales: number; tickets: number; covers: number };

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if ((ch === "," || ch === "\t") && !q) {
      out.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function isoDate(v: string) {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  return null;
}

const numOf = (v: string | undefined) => Number((v ?? "").replace(/[$,\s]/g, "")) || 0;

/** Daily totals from a POS export. Column names are matched loosely. */
export function parseHistory(raw: string): { rows: Row[]; skipped: number; error?: string } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, error: "Paste a header row and at least one day." };
  const head = splitCsv(lines[0]!).map((h) => h.toLowerCase());
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const di = find(/date|day/);
  const si = find(/net/) >= 0 ? find(/net/) : find(/sales/);
  const ti = find(/ticket|check|order|transaction/);
  const ci = find(/cover|guest/);
  if (di < 0 || si < 0 || ti < 0) return { rows: [], skipped: 0, error: "Need columns for date, net sales and tickets." };
  const rows: Row[] = [];
  let skipped = 0;
  for (const l of lines.slice(1)) {
    const c = splitCsv(l);
    const date = isoDate(c[di] ?? "");
    const tickets = Math.round(numOf(c[ti]));
    if (!date) {
      skipped++;
      continue;
    }
    rows.push({ date, netSales: Math.round(numOf(c[si]) * 100) / 100, tickets, covers: ci >= 0 ? Math.round(numOf(c[ci])) : 0 });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, skipped };
}

function downloadTemplate() {
  const csv = "date,net_sales,tickets,covers\n2025-10-10,18450.25,96,212\n2025-10-11,22310.00,118,254\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "last-year-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function HistoryTab({ b }: { b: Build }) {
  const [storeId, setStoreId] = useState(b.stores[0]?.id ?? "");
  const store = b.stores.find((s) => s.id === storeId);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
      <div>
        <div className="eyebrow mb-3">A full year of daily totals, per store</div>
        <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
          With last year loaded, every night is compared to the same weekday a year ago: net sales, tickets and spend per ticket. Export the daily sales summary from the POS and drop it in.
        </p>
        <ul className="divide-y divide-paper-line border-y border-paper-line">
          {b.stores.map((s) => (
            <li key={s.id}>
              <button onClick={() => setStoreId(s.id)} className={cn("flex w-full items-center justify-between gap-3 px-2 py-3 text-left", s.id === storeId && "bg-paper-2/60")}>
                <div>
                  <div className="font-semibold text-ink">{s.name}</div>
                  <div className="text-[12px] text-ink-soft">{s.history.days ? `${s.history.from} to ${s.history.to}` : "Nothing loaded"}</div>
                </div>
                <span className={cn("chip", s.history.days >= 300 ? "!border-sage/50 !text-sage" : s.history.days ? "!border-gold/60 !text-gold-deep" : "")}>{s.history.days} days</span>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          <Download className="size-3.5" /> Download the CSV template
        </button>
      </div>
      {store && <HistoryImport key={store.id} store={store} />}
    </div>
  );
}

function HistoryImport({ store }: { store: Build["stores"][number] }) {
  const imp = useImportHistory();
  const clear = useClearHistory();
  const [raw, setRaw] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const parsed = useMemo(() => (raw.trim() ? parseHistory(raw) : null), [raw]);
  const totals = parsed?.rows.reduce((a, r) => ({ sales: a.sales + r.netSales, tickets: a.tickets + r.tickets }), { sales: 0, tickets: 0 });

  return (
    <div className="space-y-4">
      <div className="font-display text-[26px] text-ink">{store.name}</div>
      <label className="flex cursor-pointer items-center gap-3 border border-dashed border-paper-line px-4 py-3 text-[13px] text-ink-soft hover:border-ink">
        <FileUp className="size-4 text-gold-deep" /> Choose a CSV export
        <input
          aria-label="CSV export"
          type="file"
          className="hidden"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setRaw(await f.text());
            setDone(null);
          }}
        />
      </label>
      <textarea
        aria-label="Paste CSV"
        className="field !h-auto py-2.5 font-mono text-[12px]"
        rows={8}
        value={raw}
        onChange={(e) => (setRaw(e.target.value), setDone(null))}
        placeholder={"date,net_sales,tickets,covers\n2025-10-10,18450.25,96,212"}
      />
      {parsed?.error && <div className="text-[13px] text-oxblood">{parsed.error}</div>}
      {parsed && !parsed.error && totals && (
        <div className="grid grid-cols-3 gap-4 border border-paper-line bg-paper-2/40 p-4">
          <Stat label="Days" value={num(parsed.rows.length)} sub={parsed.rows.length ? `${parsed.rows[0]!.date} to ${parsed.rows[parsed.rows.length - 1]!.date}` : undefined} />
          <Stat label="Net sales" value={money(totals.sales)} />
          <Stat label="Spend per ticket" value={totals.tickets ? money(totals.sales / totals.tickets, 2) : "·"} sub={parsed.skipped ? `${parsed.skipped} rows skipped` : undefined} />
        </div>
      )}
      {err && <div className="text-[13px] text-oxblood">{err}</div>}
      {done && <div className="text-[13px] text-sage">{done}</div>}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn btn-ink"
          disabled={imp.isPending || !parsed || !!parsed.error || !parsed.rows.length}
          onClick={async () => {
            setErr(null);
            try {
              const rows = parsed!.rows;
              let last: { days: number } | null = null;
              for (let i = 0; i < rows.length; i += 800) last = await imp.mutateAsync({ storeId: store.id, rows: rows.slice(i, i + 800) });
              setDone(`Imported ${num(rows.length)} days. ${store.name} now has ${num(last?.days ?? 0)} days on file.`);
              setRaw("");
            } catch (x) {
              setErr(errMsg(x));
            }
          }}
        >
          {imp.isPending ? "Importing…" : "Import"}
        </button>
        {store.history.days > 0 && (
          <button className="btn btn-line" disabled={clear.isPending} onClick={() => confirm(`Clear all ${store.history.days} days for ${store.name}?`) && clear.mutate({ storeId: store.id })}>
            Clear history
          </button>
        )}
      </div>
      <p className="text-[12px] text-ink-soft">Importing a date that is already on file replaces it. Net sales are after comps, voids and discounts, before tax and tips.</p>
    </div>
  );
}

/* ───────────────────────── Publish ───────────────────────── */

function PublishTab({ b, onBuild }: { b: Build; onBuild: () => void }) {
  const pub = usePublishProgram();
  const [result, setResult] = useState<{ version: number } | null>(null);
  const drafts = b.items.filter((i) => i.status === "draft");
  const foreign = b.items.filter((i) => i.foreign && i.status === "approved");
  const c = b.preview.counts;
  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="eyebrow mb-4">What the client will get</div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Modules" value={c.modules} />
          <Stat label="Quizzes" value={c.quizzes} />
          <Stat label="Floor and skills" value={c.rubrics} />
          <Stat label="Rewards" value={c.rewards} />
        </div>
        <ul className="mt-7 space-y-2 text-[13.5px] text-ink">
          <li>Only approved items are published. {drafts.length > 0 && <button className="font-semibold underline" onClick={onBuild}>{drafts.length} still in draft.</button>}</li>
          <li>Checklists replace each store's opening and closing lists only if you approved them.</li>
          <li>Store targets from the brief are applied: {b.impl.brief.storeTargets.map((t) => `${b.stores.find((s) => s.id === t.storeId)?.name ?? "Store"} ${money(t.ticketTarget)}`).join(", ") || "none set"}.</li>
          <li>Staff progress is kept. Completed modules stay completed when a slug is unchanged.</li>
        </ul>
        {foreign.length > 0 && (
          <div className="mt-6 border border-oxblood/30 bg-oxblood/5 p-4">
            <div className="eyebrow mb-2 !text-oxblood">Still written for 1906</div>
            <p className="text-[13px] text-oxblood">
              {foreign.length} approved {foreign.length === 1 ? "item still names" : "items still name"} the 1906 demo house: its menu, cocktails or table setting. Adapt {foreign.length === 1 ? "it" : "them"} to {b.org.name} or exclude {foreign.length === 1 ? "it" : "them"} before you publish.{" "}
              <button className="font-semibold underline" onClick={onBuild}>
                Go to the build
              </button>
            </p>
            <p className="mt-2 text-[12.5px] text-oxblood/80">{foreign.map((i) => i.title).join(", ")}</p>
          </div>
        )}
        {b.preview.warnings.length > 0 && (
          <div className="mt-6 border border-oxblood/30 bg-oxblood/5 p-4">
            <div className="eyebrow mb-2 !text-oxblood">Check before publishing</div>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-oxblood">
              {b.preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="border border-paper-line bg-paper-2/40 p-6">
        <div className="eyebrow mb-2">{b.program ? `Live: version ${b.program.version}` : "Not published yet"}</div>
        <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
          {b.program
            ? `Published ${when(b.program.publishedAt)} by ${b.program.publishedByName}. Publishing again replaces it with version ${b.program.version + 1}.`
            : `${b.org.name} is on the BLM standard program until you publish.`}
        </p>
        <ErrorNote error={pub.error} />
        {result && <div className="mb-3 text-[13px] text-sage">Version {result.version} is live for {b.org.name}.</div>}
        <button
          className="btn btn-gold mt-2 w-full"
          disabled={pub.isPending || b.busy || c.modules === 0}
          onClick={async () => {
            if (!confirm(`${foreign.length ? `${foreign.length} approved items still name 1906. ` : ""}Publish to every store in ${b.org.name}? Their staff see it right away.`)) return;
            const r = await pub.mutateAsync({ orgId: b.org.id }).catch(() => null);
            if (r) setResult(r);
          }}
        >
          {pub.isPending ? "Publishing…" : b.busy ? "Waiting for drafts to finish" : b.program ? `Publish version ${b.program.version + 1}` : "Publish the program"}
        </button>
      </div>
    </div>
  );
}
