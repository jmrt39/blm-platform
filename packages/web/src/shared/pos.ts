// Nightly POS figures: the systems we know, and one parser that turns whatever file a POS sends
// (a Toast nightly export, or a plain per person sheet) into the shift report's own CSV.

export type PosMethod = "toast_sftp" | "email" | "upload" | "manual";

export const POS_METHOD_LABEL: Record<PosMethod, string> = {
  toast_sftp: "Toast nightly export (we collect it)",
  email: "The POS emails a nightly report",
  upload: "A script or relay posts the file",
  manual: "Typed in or uploaded at close",
};

export const POS_SYSTEMS = [
  {
    key: "toast",
    name: "Toast",
    methods: ["toast_sftp", "email", "upload", "manual"] as PosMethod[],
    note: "Toast writes a full export every night after closeout. Add our key in Toast Web, then copy the SFTP username and the export ID for this location here.",
  },
  {
    key: "square",
    name: "Square",
    methods: ["email", "upload", "manual"] as PosMethod[],
    note: "A direct Square connection is next. Until then, schedule the Sales by Team Member report to email this store's address, or upload it at close.",
  },
  {
    key: "clover",
    name: "Clover",
    methods: ["email", "upload", "manual"] as PosMethod[],
    note: "A direct Clover connection is next. Until then, email the Employee Sales report to this store's address, or upload it at close.",
  },
  {
    key: "spoton",
    name: "SpotOn",
    methods: ["email", "upload", "manual"] as PosMethod[],
    note: "SpotOn issues an export key per location to approved partners. Until ours is approved, email the server sales report to this store's address.",
  },
  {
    key: "aloha",
    name: "Aloha (NCR Voyix)",
    methods: ["email", "upload", "manual"] as PosMethod[],
    note: "Have your Aloha reseller schedule the end of day server sales report to email this store's address.",
  },
  {
    key: "lightspeed",
    name: "Lightspeed",
    methods: ["email", "upload", "manual"] as PosMethod[],
    note: "Export the Staff Report each night and email it to this store's address. A direct K Series connection is planned.",
  },
  { key: "other", name: "Another system", methods: ["email", "upload", "manual"] as PosMethod[], note: "Any per person sales sheet works: name, net sales and checks, with covers if you have them." },
] as const;

export type PosSystemKey = (typeof POS_SYSTEMS)[number]["key"];
export const posSystem = (k: string) => POS_SYSTEMS.find((s) => s.key === k) ?? POS_SYSTEMS[POS_SYSTEMS.length - 1]!;

/** Files a Toast export folder holds that we read. */
export const TOAST_FILES = ["OrderDetails.csv", "ItemSelectionDetails.csv"];

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let q = false;
  const delim = sniff(text);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      cur.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
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

/** Comma, tab or semicolon: whichever the header row uses most. */
function sniff(text: string) {
  const nl = text.search(/\r|\n/);
  const head = nl < 0 ? text : text.slice(0, nl);
  const count = (c: string) => head.split(c).length;
  const best = [",", "\t", ";"].sort((a, b) => count(b) - count(a))[0]!;
  return count(best) > 1 ? best : ",";
}

export const ALIASES: Record<string, string[]> = {
  name: ["name", "employee", "server", "staff", "employee name", "server name", "team member", "staff member"],
  role: ["role", "job", "position", "job title"],
  netSales: ["net_sales", "net sales", "sales", "net", "netsales", "total sales", "net amount"],
  covers: ["covers", "guests", "guest count", "pax", "guest_count", "# of guests"],
  checks: ["checks", "tickets", "check count", "check_count", "# checks", "orders", "# orders", "transactions"],
  wineBottles: ["wine_bottles", "wine bottles", "wine", "bottles"],
  desserts: ["desserts", "dessert", "dessert count"],
  shift: ["shift", "daypart", "meal", "meal period", "service"],
  kind: ["type", "kind", "shift type", "shift_type", "worked as", "worked_as"],
};

/** Lunch or dinner from whatever word the POS or the manager used. */
export const shiftOf = (s: string): "lunch" | "dinner" => (/lun|brunch|breakfast|\bam\b|day/i.test(s) ? "lunch" : "dinner");

export type PosRow = {
  name: string;
  role: string;
  shift: "lunch" | "dinner";
  kind: string;
  netSales: number;
  covers: number;
  checks: number;
  wineBottles: number;
  desserts: number;
};

export type PosResult =
  | { ok: true; format: "toast" | "sheet"; rows: PosRow[]; businessDate: string | null; netSales: number; warnings: string[] }
  | { ok: false; error: string };

const num = (s: string | undefined) => {
  const v = Number(String(s ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(v) ? v : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const truthy = (s: string | undefined) => /^(true|yes|y|1)$/i.test(String(s ?? "").trim());

function headerIndex(head: string[]) {
  const h = head.map((x) => x.trim().toLowerCase());
  return (label: string) => h.indexOf(label.toLowerCase());
}

/** Toast lists people as "Last, First" in some exports. */
function personName(raw: string) {
  const t = raw.trim().replace(/\s+/g, " ");
  const m = /^([^,]+),\s*(.+)$/.exec(t);
  return m ? `${m[2]} ${m[1]}` : t;
}

/** Toast timestamps are MM/DD/YYYY HH:MM(:SS) with optional AM/PM. Before 4 am counts as the night before. */
function toastBusinessDate(ts: string, cutoffHour = 4): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?/i.exec(ts.trim());
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  let hour = Number(m[4] ?? 12);
  if (m[6]) hour = (hour % 12) + (/p/i.test(m[6]) ? 12 : 0);
  const d = new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  if (hour < cutoffHour) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mode(list: (string | null)[]) {
  const c = new Map<string, number>();
  for (const x of list) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function fromToast(orders: string[][], items: string[][] | null): PosResult {
  const col = headerIndex(orders[0]!);
  const iServer = col("Server");
  const iAmount = col("Amount");
  if (iServer < 0 || iAmount < 0) return { ok: false, error: "This Toast OrderDetails file has no Server or Amount column." };
  const iGuests = col("# of Guests");
  const iChecks = col("Checks");
  const iService = col("Service");
  const iVoided = col("Voided");
  const iOpened = col("Opened");
  const people = new Map<string, PosRow>();
  const dates: (string | null)[] = [];
  let noServer = 0;
  let noServerSales = 0;
  const keyOf = (name: string, service: string) => `${name.toLowerCase()}|${shiftOf(service)}`;
  for (const r of orders.slice(1)) {
    if (iVoided >= 0 && truthy(r[iVoided])) continue;
    const amount = num(r[iAmount]);
    if (iOpened >= 0) dates.push(toastBusinessDate(r[iOpened] ?? ""));
    const name = personName(r[iServer] ?? "");
    if (!name) {
      noServer++;
      noServerSales += amount;
      continue;
    }
    const service = iService >= 0 ? (r[iService] ?? "") : "";
    const k = keyOf(name, service);
    const row = people.get(k) ?? { name, role: "", shift: shiftOf(service), kind: "", netSales: 0, covers: 0, checks: 0, wineBottles: 0, desserts: 0 };
    row.netSales += amount;
    row.covers += iGuests >= 0 ? Math.max(0, Math.round(num(r[iGuests]))) : 0;
    const checks = iChecks >= 0 ? (r[iChecks] ?? "").split(/[,;\s]+/).filter(Boolean).length : 0;
    row.checks += checks || 1;
    people.set(k, row);
  }
  const warnings: string[] = [];
  if (noServer) warnings.push(`${noServer} ${noServer === 1 ? "order" : "orders"} with no server (${money(noServerSales)}), usually online or takeout, left out.`);
  if (items && items.length > 1) {
    const ic = headerIndex(items[0]!);
    const at = (r: string[], label: string) => {
      const i = ic(label);
      return i >= 0 ? (r[i] ?? "") : "";
    };
    for (const r of items.slice(1)) {
      if (truthy(at(r, "Void?"))) continue;
      const name = personName(at(r, "Server"));
      const row = name ? people.get(keyOf(name, at(r, "Service"))) : undefined;
      if (!row) continue;
      const qty = Math.max(0, num(at(r, "Qty")) || 1);
      const group = `${at(r, "Sales Category")} ${at(r, "Menu Group")} ${at(r, "Menu Subgroup(s)")}`;
      const item = at(r, "Menu Item");
      if (/wine/i.test(group) && /\b(btl|bottle)\b/i.test(`${group} ${item}`)) row.wineBottles += qty;
      if (/dessert/i.test(group)) row.desserts += qty;
    }
  } else warnings.push("No ItemSelectionDetails file, so wine bottles and desserts are left at zero.");
  const rows = [...people.values()].map((p) => ({ ...p, netSales: r2(p.netSales), wineBottles: Math.round(p.wineBottles), desserts: Math.round(p.desserts) }));
  rows.sort((a, b) => b.netSales - a.netSales);
  if (!rows.length) return { ok: false, error: "The Toast export had no orders with a server." };
  return { ok: true, format: "toast", rows, businessDate: mode(dates), netSales: r2(rows.reduce((a, p) => a + p.netSales, 0)), warnings };
}

function fromSheet(rows: string[][]): PosResult {
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (k: string) => head.findIndex((h) => ALIASES[k]!.includes(h));
  const i = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, idx(k)])) as Record<string, number>;
  if (i.name! < 0 || i.netSales! < 0 || i.checks! < 0) return { ok: false, error: "Columns needed: name, net sales and checks (tickets). Covers are optional." };
  const get = (r: string[], k: string) => (i[k]! >= 0 ? (r[i[k]!] ?? "").trim() : "");
  const out: PosRow[] = [];
  for (const r of rows.slice(1)) {
    const name = personName(get(r, "name"));
    if (!name || /^(total|totals|grand total|subtotal)$/i.test(name)) continue;
    out.push({
      name,
      role: get(r, "role").toLowerCase(),
      shift: shiftOf(get(r, "shift")),
      kind: get(r, "kind"),
      netSales: r2(num(get(r, "netSales"))),
      covers: Math.round(num(get(r, "covers"))),
      checks: Math.round(num(get(r, "checks"))),
      wineBottles: Math.round(num(get(r, "wineBottles"))),
      desserts: Math.round(num(get(r, "desserts"))),
    });
  }
  if (!out.length) return { ok: false, error: "The sheet had a header but nobody on it." };
  return { ok: true, format: "sheet", rows: out, businessDate: null, netSales: r2(out.reduce((a, p) => a + p.netSales, 0)), warnings: [] };
}

/** One night's files in, per person rows out. Recognises a Toast export folder or any per person sheet. */
export function readPosFiles(files: { name: string; text: string }[]): PosResult {
  const parsed = files
    .filter((f) => /\.(csv|txt|tsv)$/i.test(f.name) || !/\.[a-z0-9]{2,4}$/i.test(f.name))
    .map((f) => ({ name: f.name, rows: parseCsv(f.text.replace(/^﻿/, "").trim()) }))
    .filter((f) => f.rows.length > 0);
  if (!parsed.length) return { ok: false, error: "No CSV file came with it." };
  const isOrders = (r: string[][]) => {
    const h = r[0]!.map((x) => x.trim().toLowerCase());
    return h.includes("order id") && h.includes("server") && h.includes("amount");
  };
  const isItems = (r: string[][]) => {
    const h = r[0]!.map((x) => x.trim().toLowerCase());
    return h.includes("item selection id") && h.includes("menu item");
  };
  const orders = parsed.find((f) => /orderdetails/i.test(f.name) || isOrders(f.rows));
  if (orders && isOrders(orders.rows)) return fromToast(orders.rows, parsed.find((f) => isItems(f.rows))?.rows ?? null);
  const sheet = parsed.find((f) => f.rows.length > 1 && !isItems(f.rows));
  if (!sheet) return { ok: false, error: "No file with one row per person." };
  return fromSheet(sheet.rows);
}

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Back to the shift report's own CSV, so the closing manager reviews and signs it like any import. */
export function toReportCsv(rows: PosRow[]) {
  const head = "name,role,shift,type,net_sales,covers,checks,wine_bottles,desserts";
  return [head, ...rows.map((r) => [q(r.name), q(r.role), r.shift, q(r.kind || "solo"), r.netSales.toFixed(2), r.covers, r.checks, r.wineBottles, r.desserts].join(","))].join("\n") + "\n";
}

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
