// The two things a manager reads out before the doors open: what this night did a year ago, and tonight's talking points.
import { Plus } from "lucide-react";
import { useOnThisDay } from "../queries/history";
import { useLibrary } from "../queries/library";
import { money, money2, num, shortDay } from "../lib/format";

/** Three points a night, rotating through the program so the same line is not read every shift. */
function pick<T>(xs: T[], date: string, n: number) {
  if (xs.length <= n) return xs;
  const day = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 864e5);
  const start = (day * n) % xs.length;
  return Array.from({ length: n }, (_, i) => xs[(start + i) % xs.length]!);
}

export function LineupBrief({ storeId, date, today, target, topics, onAdd }: { storeId: string; date: string; today: string | null; target: number | null; topics: string; onAdd?: (text: string) => void }) {
  const lib = useLibrary();
  const ly = useOnThisDay(date === today ? storeId : null);
  const points = pick(lib.lib.talkingPoints, date, 3);
  const last = ly.data?.lastYear;
  return (
    <div className="grid gap-6 border-y rule py-6 md:grid-cols-[1fr_1.6fr]">
      <div>
        <div className="eyebrow mb-2">On this day last year</div>
        {date !== today ? (
          <div className="text-[13px] text-ink-soft">Shown for tonight's line up.</div>
        ) : last ? (
          <>
            <div className="figure text-[30px] leading-none text-ink">{money(last.sales)}</div>
            <div className="mt-2 text-[12.5px] text-ink-soft">
              {shortDay(last.date)}, same weekday · {num(last.tickets)} tickets · {money2(last.spt)} per ticket
            </div>
            {target != null && (
              <div className="mt-1 text-[12.5px] text-ink">
                Tonight's target {money2(target)} per ticket{" "}
                <span className={last.spt >= target ? "text-sage" : "text-oxblood"}>
                  ({last.spt >= target ? "beat it last year" : `${money2(target - last.spt)} more per ticket than last year`})
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[13px] text-ink-soft">{ly.isLoading ? "Loading…" : "No sales history on file for this date."}</div>
        )}
      </div>
      <div>
        <div className="eyebrow mb-2">Talking points for tonight</div>
        {points.length ? (
          <ul className="space-y-2">
            {points.map((p) => {
              const added = topics.includes(p.text);
              return (
                <li key={p.text} className="flex items-start gap-3">
                  <span className="chip shrink-0">{p.tag}</span>
                  <span className="flex-1 text-[13.5px] leading-snug text-ink">{p.text}</span>
                  {onAdd && <button type="button" disabled={added} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-gold-deep hover:underline disabled:text-ink-soft disabled:no-underline" onClick={() => onAdd(p.text)}>
                    {added ? "In topics" : (
                      <>
                        <Plus className="size-3.5" /> Add to topics
                      </>
                    )}
                  </button>}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-[13px] text-ink-soft">No talking points in this program yet.</div>
        )}
      </div>
    </div>
  );
}
