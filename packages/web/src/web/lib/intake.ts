// Reads a filled BLM intake workbook (public/templates/blm-client-intake.xlsx) into the shape the Studio imports.
// Column names are matched loosely, rows that start with "Example" are skipped, and every problem is reported by tab and row.
import type { WorkBook, WorkSheet } from "xlsx";

export const TEMPLATE_URL = "/templates/blm-client-intake.xlsx";

type Cell = string | number | boolean | Date | null | undefined;
export type Problem = { tab: string; row: number; message: string };

export type IntakeData = {
  group: { ownerName: string; ownerEmail: string; preferences: string; reputation: string; standards: string; gaps: string };
  stores: {
    name: string;
    city: string;
    pin: string;
    dinnerFull: number | null;
    dinnerPart: number | null;
    lunchFull: number | null;
    lunchPart: number | null;
    trainingRate: number | null;
    openingDueBy: string;
    closingDueBy: string;
    links: Record<string, string>;
  }[];
  team: { store: string; name: string; role: string; hireDate: string; employment: "full_time" | "part_time"; isTrainer: boolean; email: string; phone: string }[];
  history: { store: string; date: string; netSales: number; tickets: number; covers: number }[];
  materials: { what: string; have: string; how: string; notes: string }[];
};

const key = (x: unknown) =>
  String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const text = (c: Cell) => (c instanceof Date ? "" : String(c ?? "").trim());
const pad = (n: number) => String(n).padStart(2, "0");

function isoFrom(c: Cell): string | null {
  if (c instanceof Date && !Number.isNaN(c.getTime())) return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
  if (typeof c === "number" && c > 20000 && c < 80000) {
    // An Excel serial day number.
    const d = new Date(Date.UTC(1899, 11, 30) + c * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = text(c);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return null;
}

function timeFrom(c: Cell): string | null {
  if (c == null || c === "") return "";
  if (c instanceof Date) return `${pad(c.getHours())}:${pad(c.getMinutes())}`;
  if (typeof c === "number" && c >= 0 && c < 1) {
    const mins = Math.round(c * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = text(c).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h < 24 ? `${pad(h)}:${m[2] ?? "00"}` : null;
}

function numFrom(c: Cell): number | null {
  if (typeof c === "number") return c;
  const s = text(c).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const yes = (c: Cell) => c === true || /^(y|yes|true|1|x)$/i.test(text(c));

/** Rows as objects keyed by the normalised header, with the sheet row number for error messages. */
function rowsOf(XLSX: typeof import("xlsx"), ws: WorkSheet | undefined, first: string) {
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const hi = grid.findIndex((r) => key(r[0]).startsWith(first));
  if (hi < 0) return [];
  const head = grid[hi]!.map(key);
  return grid
    .slice(hi + 1)
    .map((r, i) => ({ n: hi + i + 2, get: (...names: string[]) => r[head.findIndex((h) => names.some((x) => h.startsWith(x)))] as Cell, first: r[0] as Cell, blank: r.every((c) => c == null || text(c) === "") }))
    .filter((r) => !r.blank && !/^(example|e\.g\.)/i.test(text(r.first)));
}

function sheet(wb: WorkBook, ...names: string[]) {
  const n = wb.SheetNames.find((x) => names.some((y) => key(x).startsWith(key(y))));
  return n ? wb.Sheets[n] : undefined;
}

export async function readIntake(file: File): Promise<{ data: IntakeData; problems: Problem[] }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const problems: Problem[] = [];
  const bad = (tab: string, row: number, message: string) => problems.push({ tab, row, message });

  // Owner and brief: question in column A, answer in column B.
  const group: IntakeData["group"] = { ownerName: "", ownerEmail: "", preferences: "", reputation: "", standards: "", gaps: "" };
  const bws = sheet(wb, "Owner and brief", "Owner", "Brief");
  if (bws) {
    const grid = XLSX.utils.sheet_to_json<Cell[]>(bws, { header: 1, raw: true, defval: null });
    const map: [string, keyof IntakeData["group"]][] = [
      ["ownername", "ownerName"],
      ["owneremail", "ownerEmail"],
      ["howyouwanttheroom", "preferences"],
      ["whatguestsshouldsay", "reputation"],
      ["housestandards", "standards"],
      ["whatyouwouldfix", "gaps"],
    ];
    for (const r of grid) {
      const k = key(r[0]);
      const hit = map.find(([m]) => k.startsWith(m));
      if (hit) group[hit[1]] = text(r[1]);
    }
  }

  const stores: IntakeData["stores"] = [];
  for (const r of rowsOf(XLSX, sheet(wb, "Stores"), "storename")) {
    const name = text(r.get("storename"));
    if (name.length < 2) {
      bad("Stores", r.n, "Store name is missing");
      continue;
    }
    const money = (label: string, ...k: string[]) => {
      const v = numFrom(r.get(...k));
      if (v != null && (v < 5 || v > 2000)) {
        bad("Stores", r.n, `${name}: ${label} of ${v} looks wrong. Use dollars per ticket, like 78`);
        return null;
      }
      return v;
    };
    const pinRaw = r.get("storepin", "pin");
    const pin = typeof pinRaw === "number" ? String(pinRaw) : text(pinRaw).replace(/\s/g, "");
    if (pin && !/^\d{4,6}$/.test(pin)) bad("Stores", r.n, `${name}: store PIN must be 4 to 6 digits`);
    const open = timeFrom(r.get("openingchecklist", "opening"));
    const close = timeFrom(r.get("closingchecklist", "closing"));
    if (open == null) bad("Stores", r.n, `${name}: opening due time should look like 11:00`);
    if (close == null) bad("Stores", r.n, `${name}: closing due time should look like 01:00`);
    const rate = numFrom(r.get("trainingrate"));
    const links: Record<string, string> = {};
    const link = (k: string, ...h: string[]) => {
      const v = text(r.get(...h));
      if (v) links[k] = v;
    };
    link("Google", "googlereview", "googlepage");
    link("googlePlaceId", "googleplace");
    link("Yelp", "yelp");
    link("OpenTable", "opentable");
    link("Tripadvisor", "tripadvisor");
    link("Resy", "resy");
    stores.push({
      name,
      city: text(r.get("city")),
      pin: /^\d{4,6}$/.test(pin) ? pin : "",
      dinnerFull: money("dinner full time target", "dinnertargetfull", "dinnerfull", "dinnertarget"),
      dinnerPart: money("dinner part time target", "dinnertargetpart", "dinnerpart"),
      lunchFull: money("lunch full time target", "lunchtargetfull", "lunchfull", "lunchtarget"),
      lunchPart: money("lunch part time target", "lunchtargetpart", "lunchpart"),
      trainingRate: rate != null && rate >= 1 && rate <= 200 ? rate : null,
      openingDueBy: open ?? "",
      closingDueBy: close ?? "",
      links,
    });
  }

  const team: IntakeData["team"] = [];
  for (const r of rowsOf(XLSX, sheet(wb, "Team", "Roster"), "store")) {
    const name = text(r.get("fullname", "name"));
    if (name.length < 2) {
      bad("Team", r.n, "Full name is missing");
      continue;
    }
    const role = text(r.get("role", "position", "job"));
    if (!role) {
      bad("Team", r.n, `${name}: role is missing`);
      continue;
    }
    const hireDate = isoFrom(r.get("hiredate", "hire", "start"));
    if (!hireDate) {
      bad("Team", r.n, `${name}: hire date is missing or not a date`);
      continue;
    }
    team.push({
      store: text(r.get("store")),
      name,
      role,
      hireDate,
      employment: /part/i.test(text(r.get("fullorpart", "employment", "status"))) ? "part_time" : "full_time",
      isTrainer: yes(r.get("trainer")),
      email: text(r.get("email")),
      phone: text(r.get("phone")),
    });
  }

  const history: IntakeData["history"] = [];
  for (const r of rowsOf(XLSX, sheet(wb, "Last year", "History", "Sales"), "store")) {
    const date = isoFrom(r.get("date", "day"));
    const sales = numFrom(r.get("netsales", "sales"));
    const tickets = numFrom(r.get("tickets", "checks"));
    if (!date || sales == null || tickets == null) {
      bad("Last year", r.n, "Needs a date, net sales and tickets");
      continue;
    }
    history.push({ store: text(r.get("store")), date, netSales: Math.round(sales * 100) / 100, tickets: Math.round(tickets), covers: Math.round(numFrom(r.get("covers", "guests")) ?? 0) });
  }

  const materials: IntakeData["materials"] = [];
  for (const r of rowsOf(XLSX, sheet(wb, "Material"), "what")) {
    const what = text(r.get("what"));
    if (what) materials.push({ what, have: text(r.get("doyouhave", "have")), how: text(r.get("howyou", "how")), notes: text(r.get("notes")) });
  }

  return { data: { group, stores, team, history, materials }, problems };
}
