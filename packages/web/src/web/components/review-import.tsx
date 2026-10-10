import { useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Check, FileUp, Plug } from "lucide-react";
import { useImportFeedback } from "../queries/guests";
import { useStores } from "../queries/stores";
import { FEEDBACK_SOURCES } from "../../shared/program";
import { PLATFORM_INFO, REVIEW_PLATFORMS } from "../../shared/reviews";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";

type Source = (typeof FEEDBACK_SOURCES)[number];
type Row = { source: Source; receivedOn: string; rating: number | null; guestName: string; quote: string; externalUrl: string | null; externalId: string | null };

/** A small CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

const HEAD: Record<string, keyof Row> = {
  platform: "source",
  source: "source",
  site: "source",
  date: "receivedOn",
  received: "receivedOn",
  "review date": "receivedOn",
  stars: "rating",
  rating: "rating",
  "star rating": "rating",
  guest: "guestName",
  reviewer: "guestName",
  name: "guestName",
  "reviewer name": "guestName",
  review: "quote",
  text: "quote",
  comment: "quote",
  "review text": "quote",
  link: "externalUrl",
  url: "externalUrl",
  "review link": "externalUrl",
  id: "externalId",
  "review id": "externalId",
};

function toDate(x: string) {
  const t = x.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toSource(x: string, fallback: Source): Source {
  const t = x.trim().toLowerCase();
  return FEEDBACK_SOURCES.find((s) => s.toLowerCase() === t || t.includes(s.toLowerCase())) ?? fallback;
}

/** Rows we can import, plus how many lines were skipped and why. */
function readRows(text: string, fallback: Source): { rows: Row[]; bad: number } {
  const grid = parseCsv(text);
  if (grid.length < 2) return { rows: [], bad: 0 };
  const cols = grid[0]!.map((h) => HEAD[h.trim().toLowerCase()] ?? null);
  const rows: Row[] = [];
  let bad = 0;
  for (const line of grid.slice(1)) {
    const get = (k: keyof Row) => {
      const i = cols.indexOf(k);
      return i < 0 ? "" : (line[i] ?? "").trim();
    };
    const quote = get("quote");
    const receivedOn = toDate(get("receivedOn"));
    const stars = Number.parseInt(get("rating"), 10);
    const url = get("externalUrl");
    if (quote.length < 8 || !receivedOn) {
      bad++;
      continue;
    }
    rows.push({
      source: toSource(get("source"), fallback),
      receivedOn,
      rating: stars >= 1 && stars <= 5 ? stars : null,
      guestName: get("guestName").slice(0, 80),
      quote: quote.slice(0, 4000),
      externalUrl: /^https?:\/\//i.test(url) ? url : null,
      externalId: get("externalId") || null,
    });
  }
  return { rows, bad };
}

const SAMPLE = `platform,date,stars,guest,review,link
Google,2026-05-02,5,Dana R.,"Camille made our anniversary. Perfect wine pick.",https://maps.app.goo.gl/example
Yelp,2026-05-03,3,Marc T.,"Food was lovely but we waited 40 minutes for mains.",https://www.yelp.com/biz/example`;

/** Import reviews from a platform export or a spreadsheet, and the honest state of each live connection. */
export function ReviewImport({ storeId, onDone }: { storeId: string; onDone?: () => void }) {
  const imp = useImportFeedback();
  const [text, setText] = useState("");
  const [fallback, setFallback] = useState<Source>("Google");
  const { rows, bad } = readRows(text, fallback);
  return (
    <div className="mb-10 rounded-[2px] border-2 border-ink p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Import reviews</div>
          <h3 className="font-display text-[24px] leading-tight">From Google, Yelp, OpenTable, Tripadvisor or Resy</h3>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-soft">
            Export reviews from the platform (or copy them into a spreadsheet) and paste or upload the file. Columns: platform, date, stars, guest, review, link. Only date and review are required. Names are found and tagged automatically, and
            anything already in is skipped.
          </p>
        </div>
        <label className="btn btn-line cursor-pointer">
          <FileUp className="size-4" /> Upload CSV
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            aria-label="Upload CSV"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </label>
      </div>
      <textarea aria-label="Paste reviews" className="field mt-4 !h-36 py-2 font-mono !text-[12px]" placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-2">
          <span className="text-ink-soft">No platform column? Treat them as</span>
          <select aria-label="Default platform" className="field !h-8 !w-auto !py-0 !text-[12.5px]" value={fallback} onChange={(e) => setFallback(e.target.value as Source)}>
            {FEEDBACK_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" className="font-semibold text-gold-deep hover:underline" onClick={() => setText(SAMPLE)}>
          Fill in an example
        </button>
        <span className="text-ink-soft">
          {text.trim() ? `${rows.length} review${rows.length === 1 ? "" : "s"} ready${bad ? ` · ${bad} line${bad === 1 ? "" : "s"} missing a date or review` : ""}` : ""}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ink" disabled={!rows.length || imp.isPending} onClick={() => imp.mutate({ storeId, rows })}>
          Import {rows.length || ""} review{rows.length === 1 ? "" : "s"}
        </button>
        {imp.data && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-sage">
            <Check className="size-4" /> {imp.data.added} added, {imp.data.tagged} tagged to a colleague{imp.data.skipped ? `, ${imp.data.skipped} already in` : ""}.
            {onDone && (
              <button type="button" className="ml-2 font-semibold text-ink hover:underline" onClick={onDone}>
                Done
              </button>
            )}
          </span>
        )}
        {imp.error && <span className="text-[13px] text-oxblood">{errMsg(imp.error)}</span>}
      </div>
    </div>
  );
}

const LIVE_LABEL = { possible: "Live sync possible", read_only: "Read only API", partner: "Partners only" } as const;

/** Per platform: is the store's page linked, where the owner replies, and what a live connection would take. */
export function PlatformConnections({ storeId }: { storeId: string }) {
  const stores = useStores();
  const st = stores.data?.find((s) => s.id === storeId);
  if (!st) return null;
  return (
    <section className="mt-12 border-t-2 border-ink pt-6" aria-label="Review platforms">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="eyebrow">Review platforms · {st.name}</div>
          <h3 className="font-display text-[24px] leading-tight">Where guests review you, and where you reply</h3>
        </div>
        <Link href="/stores" className="text-[12.5px] font-semibold text-gold-deep hover:underline">
          Edit the store's links →
        </Link>
      </div>
      <p className="mt-1 max-w-3xl text-[13px] text-ink-soft">
        Every Respond button opens the review where it was posted, in a new tab, so the reply goes out under your verified owner account. Live import isn't switched on yet: each platform needs its own approval first, noted below.
        Until then, import an export file above.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REVIEW_PLATFORMS.map((p) => {
          const info = PLATFORM_INFO[p];
          const page = st.reviewLinks[p] || (p === "Google" && st.reviewLinks.googlePlaceId ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(st.reviewLinks.googlePlaceId)}` : "");
          return (
            <div key={p} className="flex flex-col rounded-[2px] border rule p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[19px]">{p}</span>
                <span className={cn("chip", page ? "border-sage/50 text-sage" : "border-paper-line text-ink-soft")}>{page ? "Page linked" : "No page linked"}</span>
              </div>
              <p className="mt-2 text-[12.5px] text-ink">{info.reply}</p>
              <p className="mt-2 flex-1 text-[12px] text-ink-soft">
                <Plug className="mr-1 inline size-3.5 -translate-y-px" />
                <span className="font-semibold">{LIVE_LABEL[info.live]}.</span> {info.api}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-[12.5px]">
                {page && (
                  <a href={page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">
                    Store page <ArrowUpRight className="size-3.5" />
                  </a>
                )}
                <a href={info.owner} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-gold-deep hover:underline">
                  {info.ownerLabel} <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
