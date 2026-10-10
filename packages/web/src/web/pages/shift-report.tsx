import { useCallback, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { motion } from "motion/react";
import { FileUp, Plus, Trash2, Download } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { SignaturePad, SignatureView, SignedStamp } from "../components/signature";
import { StoreTabs } from "./checklists";
import { useRoster, useShift, useShiftList, useSubmitShift } from "../queries/shifts";
import { dayLabel, errMsg, money, money2, num, shortDay, timeOf } from "../lib/format";
import { ROLE_LABEL } from "../../shared/domain";
import { cn } from "../lib/utils";

type Line = { key: string; memberId: string | null; name: string; role: string; netSales: string; covers: string; checks: string; wineBottles: string; desserts: string };
type RosterRow = { id: string; name: string; role: string; initials: string };

const SELLERS = new Set(["server", "bartender", "sommelier"]);
const blank = (): Line => ({ key: crypto.randomUUID(), memberId: null, name: "", role: "server", netSales: "", covers: "", checks: "", wineBottles: "", desserts: "" });
const n = (s: string) => {
  const v = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : 0;
};

const SAMPLE = `name,role,net_sales,covers,checks,wine_bottles,desserts
Maya Collins,server,2140.50,24,8,3,6
Sam Whitaker,server,1890.00,22,7,2,5
Camille Rhodes,server,1312.75,19,7,1,3
Chris Ortega,bartender,1045.00,20,14,0,1
`;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t" || ch === ";") {
      cur.push(cell);
      cell = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell);
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
      cell = "";
    } else cell += ch;
  }
  cur.push(cell);
  if (cur.some((c) => c.trim())) rows.push(cur);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "employee", "server", "staff", "employee name", "server name"],
  role: ["role", "job", "position", "job title"],
  netSales: ["net_sales", "net sales", "sales", "net", "netsales", "total sales"],
  covers: ["covers", "guests", "guest count", "pax", "guest_count"],
  checks: ["checks", "tickets", "check count", "check_count"],
  wineBottles: ["wine_bottles", "wine bottles", "wine", "bottles"],
  desserts: ["desserts", "dessert", "dessert count"],
};

function linesFromCsv(text: string, roster: RosterRow[]): { lines: Line[]; unmatched: string[]; error?: string } {
  const rows = parseCsv(text.trim());
  if (rows.length < 2) return { lines: [], unmatched: [], error: "Need a header row and at least one person." };
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (k: string) => head.findIndex((h) => ALIASES[k]!.includes(h));
  const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));
  if (idx.name! < 0 || idx.netSales! < 0 || idx.covers! < 0) return { lines: [], unmatched: [], error: "Columns needed: name, net_sales, covers." };
  const unmatched: string[] = [];
  const lines = rows.slice(1).map((r) => {
    const name = (r[idx.name!] ?? "").trim();
    const lower = name.toLowerCase();
    const m =
      roster.find((x) => x.name.toLowerCase() === lower) ??
      roster.find((x) => {
        const [f, ...rest] = x.name.toLowerCase().split(" ");
        const [f2, ...rest2] = lower.split(" ");
        return f === f2 && rest.join(" ")[0] === rest2.join(" ")[0];
      });
    if (!m) unmatched.push(name);
    const get = (k: string) => (idx[k]! >= 0 ? (r[idx[k]!] ?? "").trim() : "");
    return {
      key: crypto.randomUUID(),
      memberId: m?.id ?? null,
      name: m?.name ?? name,
      role: m?.role ?? (get("role").toLowerCase() || "server"),
      netSales: get("netSales"),
      covers: get("covers"),
      checks: get("checks"),
      wineBottles: get("wineBottles"),
      desserts: get("desserts"),
    };
  });
  return { lines: lines.filter((l) => l.name), unmatched };
}

export default function ShiftReportPage() {
  const v = useViewer();
  const search = new URLSearchParams(useSearch());
  const [tab, setTab] = useState<"enter" | "history">(search.get("date") ? "history" : "enter");
  const [viewDate, setViewDate] = useState<string | null>(search.get("date"));
  return (
    <Page
      eyebrow={`${v.store?.name} · Store ${v.store?.number}`}
      title="End-of-night shift report"
      aside={
        <Seg
          value={tab}
          onChange={(t) => {
            setTab(t);
            setViewDate(null);
          }}
          options={[
            { value: "enter", label: "Enter a night" },
            { value: "history", label: "Past nights" },
          ]}
        />
      }
    >
      <StoreTabs />
      {tab === "enter" ? (
        <Entry key={v.storeId} onSubmitted={(d) => (setViewDate(d), setTab("history"))} />
      ) : viewDate ? (
        <NightView date={viewDate} onBack={() => setViewDate(null)} />
      ) : (
        <History onOpen={setViewDate} />
      )}
    </Page>
  );
}

function History({ onOpen }: { onOpen: (d: string) => void }) {
  const v = useViewer();
  const q = useShiftList(v.storeId);
  const target = v.store?.ppaTarget ?? 78;
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <Empty>No shift reports yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Night</th>
            <th className="r">Net sales</th>
            <th className="r">Covers</th>
            <th className="r">Spend / guest</th>
            <th className="r">Comps + voids</th>
            <th>Source</th>
            <th>Submitted by</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-paper-2/50" onClick={() => onOpen(r.businessDate)}>
              <td className="font-semibold">{shortDay(r.businessDate)}</td>
              <td className="r figure text-[16px]">{money(r.netSales)}</td>
              <td className="r">{num(r.covers)}</td>
              <td className={cn("r font-semibold", r.ppa >= target ? "text-sage" : "text-oxblood")}>{money2(r.ppa)}</td>
              <td className="r">{money(r.comps + r.voids)}</td>
              <td>
                <span className="chip">{r.source === "csv" ? "CSV import" : "Typed in"}</span>
              </td>
              <td className="text-ink-soft">
                {r.submittedByName} · {timeOf(r.submittedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NightView({ date, onBack }: { date: string; onBack: () => void }) {
  const v = useViewer();
  const q = useShift(v.storeId, date);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const r = q.data?.report;
  const target = q.data?.store.ppaTarget ?? 78;
  return (
    <div>
      <button onClick={onBack} className="mb-5 text-[12.5px] font-semibold text-gold-deep hover:underline">
        ← All nights
      </button>
      {!r ? (
        <Empty>No report for {dayLabel(date)}.</Empty>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="mb-6 font-display text-[26px]">{dayLabel(date)}</div>
          <div className="grid grid-cols-2 gap-6 border-b rule pb-8 md:grid-cols-4">
            <Stat label="Net sales" value={money(r.netSales)} />
            <Stat label="Covers" value={num(r.covers)} sub={`${r.checks} checks`} />
            <Stat label="Average check" value={money2(r.ppa)} tone={r.ppa >= target ? "good" : "bad"} sub={`Target ${money(target)}`} />
            <Stat label="Comps · voids · discounts" value={money(r.comps + r.voids + r.discounts)} sub={`${r.walkouts} walkouts`} />
          </div>
          <table className="tbl mt-6">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="r">Net sales</th>
                <th className="r">Covers</th>
                <th className="r">Spend / guest</th>
                <th className="r">Wine btl</th>
                <th className="r">Desserts</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => {
                const p = l.covers ? l.netSales / l.covers : 0;
                return (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.memberId ? <Link href={`/team/${l.memberId}`} className="hover:underline">{l.name}</Link> : l.name}</td>
                    <td className="text-ink-soft">{ROLE_LABEL[l.role] ?? l.role}</td>
                    <td className="r">{money2(l.netSales)}</td>
                    <td className="r">{l.covers}</td>
                    <td className={cn("r font-semibold", SELLERS.has(l.role) && l.role !== "bartender" ? (p >= target ? "text-sage" : "text-oxblood") : "")}>{money2(p)}</td>
                    <td className="r">{l.wineBottles}</td>
                    <td className="r">{l.desserts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(r.eightySixed || r.notes) && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {r.eightySixed && (
                <div>
                  <div className="eyebrow mb-1">86'd</div>
                  <div className="text-[13.5px]">{r.eightySixed}</div>
                </div>
              )}
              {r.notes && (
                <div>
                  <div className="eyebrow mb-1">Manager notes</div>
                  <div className="whitespace-pre-wrap text-[13.5px]">{r.notes}</div>
                </div>
              )}
            </div>
          )}
          <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t-2 border-ink pt-6">
            <div>
              <div className="eyebrow mb-1">Submitted by</div>
              <div className="font-display text-[20px]">{r.submittedByName}</div>
              <SignatureView value={r.signature} className="mt-1 h-12" />
            </div>
            <SignedStamp name={r.submittedByName} when={`${r.source === "csv" ? "CSV" : "Typed"} · ${timeOf(r.submittedAt)}`} />
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Entry({ onSubmitted }: { onSubmitted: (date: string) => void }) {
  const v = useViewer();
  const roster = useRoster(v.storeId);
  const submit = useSubmitShift();
  const [date, setDate] = useState(v.me.today ?? new Date().toISOString().slice(0, 10));
  const existing = useShift(v.storeId, date);
  const [source, setSource] = useState<"manual" | "csv">("manual");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [extra, setExtra] = useState({ comps: "", voids: "", discounts: "", walkouts: "", eightySixed: "", notes: "" });
  const [csv, setCsv] = useState("");
  const [csvMsg, setCsvMsg] = useState<{ error?: string; unmatched: string[] } | null>(null);
  const [sig, setSig] = useState("");
  const onSig = useCallback((s: string) => setSig(s), []);
  const target = v.store?.ppaTarget ?? 78;
  const people = useMemo(() => (roster.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roster.data]);

  const filled = lines.filter((l) => l.name && (n(l.netSales) > 0 || n(l.covers) > 0));
  const sales = filled.reduce((a, l) => a + n(l.netSales), 0);
  const covers = filled.reduce((a, l) => a + n(l.covers), 0);
  const ppa = covers ? sales / covers : 0;

  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addSellers = () => {
    const have = new Set(lines.map((l) => l.memberId));
    const add = people.filter((p) => SELLERS.has(p.role) && !have.has(p.id)).map((p) => ({ ...blank(), memberId: p.id, name: p.name, role: p.role }));
    setLines((ls) => [...ls.filter((l) => l.name), ...add]);
  };
  const importCsv = (text: string) => {
    setCsv(text);
    const r = linesFromCsv(text, people);
    setCsvMsg({ error: r.error, unmatched: r.unmatched });
    if (!r.error) setLines(r.lines);
  };

  const send = async () => {
    const r = await submit
      .mutateAsync({
        storeId: v.storeId,
        businessDate: date,
        source,
        signature: sig,
        comps: n(extra.comps),
        voids: n(extra.voids),
        discounts: n(extra.discounts),
        walkouts: Math.round(n(extra.walkouts)),
        eightySixed: extra.eightySixed,
        notes: extra.notes,
        lines: filled.map((l) => ({
          memberId: l.memberId,
          name: l.name,
          role: l.role,
          netSales: n(l.netSales),
          covers: Math.round(n(l.covers)),
          checks: Math.round(n(l.checks)),
          wineBottles: Math.round(n(l.wineBottles)),
          desserts: Math.round(n(l.desserts)),
        })),
      })
      .catch(() => null);
    if (r) onSubmitted(date);
  };

  return (
    <div className="grid gap-10 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <span className="label">Business date</span>
            <input aria-label="Business date" type="date" className="field !w-48" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Seg
            value={source}
            onChange={setSource}
            options={[
              { value: "manual", label: "Type it in" },
              { value: "csv", label: "Import CSV" },
            ]}
          />
          {existing.data?.report && (
            <div className="rounded-[2px] bg-gold/15 px-3 py-2 text-[12.5px] text-gold-deep">
              A report exists for this night ({money(existing.data.report.netSales)}). Submitting replaces it.
            </div>
          )}
        </div>

        {source === "csv" && (
          <div className="mb-6 rounded-[2px] border border-dashed border-ink-soft/40 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn btn-ink cursor-pointer">
                <FileUp className="size-4" /> Choose POS export (.csv)
                <input aria-label="POS export file"
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) importCsv(await file.text());
                  }}
                />
              </label>
              <a className="btn btn-line" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="shift-report-sample.csv">
                <Download className="size-4" /> Sample file
              </a>
              <button className="text-[12.5px] font-semibold text-gold-deep hover:underline" onClick={() => importCsv(SAMPLE)}>
                Use the sample
              </button>
            </div>
            <textarea aria-label="…or paste rows here: name, role, net_sales, covers, checks, wine_bottles, desserts"
              className="field mt-4 !h-28 py-2 font-mono text-[12px]"
              placeholder="…or paste rows here: name, role, net_sales, covers, checks, wine_bottles, desserts"
              value={csv}
              onChange={(e) => importCsv(e.target.value)}
            />
            {csvMsg?.error && <div className="mt-2 text-[12.5px] text-oxblood">{csvMsg.error}</div>}
            {csvMsg && !csvMsg.error && (
              <div className="mt-2 text-[12.5px] text-ink-soft">
                {lines.length} rows read.{" "}
                {csvMsg.unmatched.length ? <span className="text-oxblood">Not on the roster: {csvMsg.unmatched.join(", ")} — they'll be saved by name.</span> : "Everyone matched to the roster."}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="min-w-[200px]">Who worked</th>
                <th className="r">Net sales</th>
                <th className="r">Covers</th>
                <th className="r">Checks</th>
                <th className="r">Wine btl</th>
                <th className="r">Desserts</th>
                <th className="r">Avg</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = n(l.covers) ? n(l.netSales) / n(l.covers) : 0;
                return (
                  <tr key={l.key}>
                    <td className="!py-1.5">
                      <select aria-label="Team member"
                        className="field !h-9"
                        value={l.memberId ?? (l.name ? `name:${l.name}` : "")}
                        onChange={(e) => {
                          const m = people.find((x) => x.id === e.target.value);
                          if (m) upd(l.key, { memberId: m.id, name: m.name, role: m.role });
                        }}
                      >
                        <option value="">Choose…</option>
                        {!l.memberId && l.name && <option value={`name:${l.name}`}>{l.name} (not on roster)</option>}
                        {people.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {ROLE_LABEL[m.role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(["netSales", "covers", "checks", "wineBottles", "desserts"] as const).map((k) => (
                      <td key={k} className="!px-1 !py-1.5">
                        <input aria-label={k}
                          className={cn("field !h-9 text-right tabular-nums", k === "netSales" ? "!w-28" : "!w-20")}
                          inputMode="decimal"
                          value={l[k]}
                          placeholder={k === "netSales" ? "$0.00" : "0"}
                          onChange={(e) => upd(l.key, { [k]: e.target.value })}
                        />
                      </td>
                    ))}
                    <td className={cn("r text-[13px] font-semibold", p ? (p >= target ? "text-sage" : "text-oxblood") : "text-ink-soft")}>{p ? money2(p) : "—"}</td>
                    <td className="!px-1">
                      <button type="button" aria-label="Remove row" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} className="text-ink-soft/60 hover:text-oxblood">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setLines((ls) => [...ls, blank()])} className="btn btn-line !h-9">
            <Plus className="size-4" /> Add a person
          </button>
          <button onClick={addSellers} className="btn btn-line !h-9">
            Add all servers & bartenders
          </button>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {(["comps", "voids", "discounts", "walkouts"] as const).map((k) => (
            <div key={k}>
              <span className="label capitalize">{k === "walkouts" ? "Walkouts (count)" : `${k} ($)`}</span>
              <input aria-label={k} className="field text-right tabular-nums" inputMode="decimal" value={extra[k]} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} />
            </div>
          ))}
          <div className="md:col-span-2">
            <span className="label">86'd tonight</span>
            <input aria-label="86'd tonight" className="field" value={extra.eightySixed} onChange={(e) => setExtra({ ...extra, eightySixed: e.target.value })} placeholder="Halibut at 8:40, Barolo by the glass" />
          </div>
          <div className="md:col-span-2">
            <span className="label">Manager notes</span>
            <input aria-label="Manager notes" className="field" value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} placeholder="VIPs, recoveries, staffing" />
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-[2px] bg-noir p-6 text-ivory">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">{shortDay(date)} · tonight</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-[12px] text-[#b9b0a3]">Net sales</div>
              <div className="figure text-[34px] leading-none">{money(sales)}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#b9b0a3]">Covers</div>
              <div className="figure text-[28px] leading-none">{num(covers)}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#b9b0a3]">Spend per guest · target {money(target)}</div>
              <div className={cn("figure text-[34px] leading-none", ppa ? (ppa >= target ? "text-[#9cc59f]" : "text-[#e08b84]") : "text-ivory")}>{money2(ppa)}</div>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="eyebrow mb-2">Submitted by · {v.me.accessName}</div>
          <SignaturePad onChange={onSig} caption="Manager on duty" />
          {submit.error && <div className="mt-2 text-[12.5px] text-oxblood">{errMsg(submit.error)}</div>}
          <button disabled={!filled.length || !sig || submit.isPending} onClick={send} className="btn btn-ink mt-3 w-full">
            {submit.isPending ? "Submitting…" : "Sign & submit the night"}
          </button>
          {!filled.length && <div className="mt-2 text-[12px] text-ink-soft">Add at least one person with sales or covers.</div>}
        </div>
      </aside>
    </div>
  );
}
