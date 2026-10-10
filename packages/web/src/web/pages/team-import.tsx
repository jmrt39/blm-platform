import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, FileUp, Upload } from "lucide-react";
import { Page } from "../components/shell";
import { useViewer } from "../components/viewer";
import { useImportRoster } from "../queries/setup";
import { ROLE_LABEL, type StoreRole } from "../../shared/domain";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";

const SAMPLE = `name,role,hire date,email,phone,trainer,hours
Maya Torres,Server,2024-03-11,maya@example.com,555-0101,yes,full time
Jonah Price,Bartender,04/22/2023,,555-0102,no,part time
Ava Lindqvist,Host,2026-09-28,,,,PT
Theo Banks,Food Runner,2025-01-06,,,,FT`;

type Parsed = { name: string; role: string; hireDate: string; email: string; phone: string; isTrainer: boolean; employment: "full_time" | "part_time"; problem?: string };

/** "Part time", "PT", "part", "P" read as part time. Anything else, or blank, is full time. */
const partTime = (raw: string) => /^(p|pt|part|part[ _]?time|parttime)$/i.test(raw.trim());

/** Minimal CSV splitter: handles quoted fields with commas and doubled quotes. Tabs work too (pasted from a sheet). */
function splitLine(line: string): string[] {
  const sep = line.includes("\t") && !line.includes(",") ? "\t" : ",";
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** YYYY-MM-DD, M/D/YYYY, M/D/YY → ISO. */
function isoDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

const HEADERS: Record<string, keyof Parsed> = {
  name: "name",
  "full name": "name",
  employee: "name",
  role: "role",
  position: "role",
  job: "role",
  "hire date": "hireDate",
  hired: "hireDate",
  "start date": "hireDate",
  hiredate: "hireDate",
  email: "email",
  phone: "phone",
  mobile: "phone",
  trainer: "isTrainer",
  hours: "employment",
  status: "employment",
  employment: "employment",
  "full/part time": "employment",
  "full or part time": "employment",
  "ft/pt": "employment",
  type: "employment",
};

function parse(text: string): Parsed[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = splitLine(lines[0]!).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => HEADERS[h]);
  const order: (keyof Parsed)[] = hasHeader
    ? first.map((h) => HEADERS[h] ?? ("problem" as const))
    : ["name", "role", "hireDate", "email", "phone", "isTrainer"];
  return lines.slice(hasHeader ? 1 : 0).map((l) => {
    const cells = splitLine(l);
    const r: Parsed = { name: "", role: "", hireDate: "", email: "", phone: "", isTrainer: false, employment: "full_time" };
    order.forEach((k, i) => {
      const val = cells[i] ?? "";
      if (k === "isTrainer") r.isTrainer = /^(y|yes|true|1|x)$/i.test(val);
      else if (k === "employment") r.employment = partTime(val) ? "part_time" : "full_time";
      else if (k !== "problem") r[k] = val;
    });
    const iso = isoDate(r.hireDate);
    if (r.name.length < 2) r.problem = "Missing name";
    else if (!r.role) r.problem = "Missing role";
    else if (!iso) r.problem = `Hire date "${r.hireDate}" not understood`;
    else r.hireDate = iso;
    return r;
  });
}

export function TeamImportPage() {
  const v = useViewer();
  const imp = useImportRoster();
  const [storeId, setStoreId] = useState(v.storeId);
  const [text, setText] = useState("");
  const rows = useMemo(() => parse(text), [text]);
  const good = rows.filter((r) => !r.problem);
  const store = v.me.stores.find((s) => s.id === storeId);
  const res = imp.data;

  if (!v.isManager)
    return (
      <Page eyebrow="Team" title="Import a roster">
        <p className="text-[14px]">Only managers can import a roster.</p>
      </Page>
    );

  if (res)
    return (
      <Page eyebrow={<Link href="/team" className="hover:underline">Team</Link>} title={<>{res.created.length} people added to {store?.name}.</>}>
        <p className="mb-6 max-w-2xl text-[14.5px] leading-relaxed">
          Each person signs in on the floor with store number <b className="figure">{store?.number}</b> and the personal PIN below. Print this or hand them out at line up; PINs only work at this store.
          {res.skipped > 0 && <> {res.skipped} already on the roster were skipped.</>}
        </p>
        {res.errors.length > 0 && (
          <div className="mb-6 rounded-[2px] border border-oxblood/30 bg-oxblood/5 p-4 text-[13px] text-oxblood">
            {res.errors.map((e) => (
              <div key={e.line}>Line {e.line}: {e.message}</div>
            ))}
          </div>
        )}
        <div className="overflow-x-auto rounded-[2px] border rule">
          <table className="w-full text-[13.5px]">
            <thead className="bg-paper-2 text-left text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Personal PIN</th>
              </tr>
            </thead>
            <tbody>
              {res.created.map((c) => (
                <tr key={c.name} className="border-t rule">
                  <td className="px-4 py-2.5">{c.name}</td>
                  <td className="px-4 py-2.5">{ROLE_LABEL[c.role as StoreRole]}</td>
                  <td className="figure px-4 py-2.5 tracking-[0.3em]">{c.pin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex gap-2">
          <Link href="/team" className="btn btn-ink">
            Open the team
          </Link>
          <button onClick={() => (imp.reset(), setText(""))} className="btn btn-line">
            Import another store
          </button>
        </div>
      </Page>
    );

  return (
    <Page
      eyebrow={
        <>
          <Link href="/team" className="hover:underline">
            Team
          </Link>{" "}
          · Import
        </>
      }
      title="Import your roster"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          {v.me.stores.length > 1 && (
            <div className="mb-5 max-w-sm">
              <span className="label">Store</span>
              <select aria-label="Store" className="field" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {v.me.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.number}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span className="label">Paste a CSV or rows from a spreadsheet</span>
          <textarea
            aria-label="Roster CSV"
            className="field min-h-[180px] font-mono text-[12.5px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="btn btn-line cursor-pointer">
              <FileUp className="size-4" /> Upload .csv
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                aria-label="Upload CSV"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                }}
              />
            </label>
            <button type="button" className="btn btn-line" onClick={() => setText(SAMPLE)}>
              Use the sample
            </button>
          </div>

          {rows.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="eyebrow">Preview</div>
                <div className="text-[12.5px] text-ink-soft">
                  {good.length} ready · {rows.length - good.length} need fixing
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2px] border rule">
                <table className="w-full text-[13px]">
                  <thead className="bg-paper-2 text-left text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Hired</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Trainer</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">
                        <span className="sr-only">Status</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={cn("border-t rule", r.problem && "bg-oxblood/5")}>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">{r.role}</td>
                        <td className="figure px-3 py-2">{r.hireDate}</td>
                        <td className="px-3 py-2">{r.email}</td>
                        <td className="px-3 py-2">{r.isTrainer ? "Yes" : ""}</td>
                        <td className="px-3 py-2">{r.employment === "part_time" ? "Part time" : "Full time"}</td>
                        <td className="px-3 py-2 text-[12px]">{r.problem ? <span className="text-oxblood">{r.problem}</span> : <Check className="size-4 text-gold-deep" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {imp.error && <div className="mt-3 text-[13px] text-oxblood">{errMsg(imp.error)}</div>}
              <button
                disabled={!good.length || imp.isPending}
                onClick={() => imp.mutate({ storeId, rows: good.map(({ problem: _p, ...r }) => r) })}
                className="btn btn-ink mt-4"
              >
                <Upload className="size-4" /> Import {good.length} to {store?.name}
              </button>
            </div>
          )}
        </div>

        <aside className="rounded-[2px] bg-paper-2 p-6 text-[13.5px] leading-relaxed">
          <div className="eyebrow mb-2">How it works</div>
          <ul className="space-y-2">
            <li>Export the roster from your scheduler (7shifts, HotSchedules, Homebase) or POS. Columns: name, role, hire date, email, phone, trainer, hours. Hours is full time or part time (FT or PT works); blank means full time. Part time staff are measured against the part time target.</li>
            <li>Roles can be written plainly: Server, Bartender, Host, Food Runner, Busser, Sommelier, Barback, GM, Floor Manager.</li>
            <li>Hire dates matter. Anyone under 30 days shows as ramping and is not ranked; anyone under 90 days gets a 30/60/90 plan.</li>
            <li>Everyone gets a personal PIN. People already on the roster are skipped, so running it twice is safe.</li>
          </ul>
        </aside>
      </div>
    </Page>
  );
}
