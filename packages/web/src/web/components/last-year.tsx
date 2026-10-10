// Year over year, from the full year of daily totals the restaurant hands over before launch.
import { HowCalculated } from "./how";
import { Stat } from "./bits";
import { money, money2, num, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Totals = { sales: number; tickets: number; covers: number; spt: number };
export type YearCompare = {
  days: number;
  thisYear: Totals;
  lastYear: Totals;
  salesChange: number | null;
  ticketsChange: number | null;
  sptChange: number | null;
} | null;
export type OnThisDay = ({ date: string; stores: number } & Totals) | null;

export function Change({ v, className }: { v: number | null | undefined; className?: string }) {
  if (v == null) return <span className={cn("text-ink-soft", className)}>no match</span>;
  const flat = Math.abs(v) < 0.005;
  return (
    <span className={cn("font-semibold", flat ? "text-ink-soft" : v > 0 ? "text-sage" : "text-oxblood", className)}>
      {flat ? "•" : v > 0 ? "▲" : "▼"} {Math.abs(v * 100).toFixed(1)}%
    </span>
  );
}

function sptLine(c: NonNullable<YearCompare>) {
  return (
    <>
      Spend per ticket {money2(c.thisYear.spt)} vs {money2(c.lastYear.spt)} <Change v={c.sptChange} />
    </>
  );
}

/** Home: tonight a year ago, last night against the same night, and the last 30 days. */
export function LastYearStrip({ night, month, today, lastNight }: { night: YearCompare; month: YearCompare; today: OnThisDay; lastNight: string }) {
  if (!night && !month && !today) {
    return (
      <div className="border-b rule py-5 text-[13px] text-ink-soft">
        <span className="eyebrow mr-2">On this day last year</span>
        No sales history loaded yet. Once last year's daily totals are in, every night is compared with the same weekday a year ago.
      </div>
    );
  }
  return (
    <div className="border-b rule py-8">
      <div className="eyebrow mb-4">
        On this day last year <HowCalculated metric="lastYear" period="same weekday, 52 weeks back" />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-3">
        <Stat
          label="Tonight, a year ago"
          value={today ? money(today.sales) : "No history"}
          sub={today ? <>{shortDay(today.date)} · {num(today.tickets)} tickets · {money2(today.spt)} per ticket</> : "Nothing on file for this date"}
        />
        <Stat
          label={<>Last night vs {shortDay(lastNightLy(lastNight))} last year</>}
          value={night ? <Change v={night.salesChange} className="text-[inherit]" /> : "No match"}
          sub={night ? <>{money(night.thisYear.sales)} vs {money(night.lastYear.sales)} · {sptLine(night)}</> : "Last year has no matching night"}
        />
        <Stat
          label="Last 30 days vs a year ago"
          value={month ? <Change v={month.salesChange} className="text-[inherit]" /> : "No match"}
          sub={month ? <>{num(month.days)} matched store nights · {sptLine(month)}</> : "Last year has no matching nights"}
        />
      </div>
    </div>
  );
}

/** Reports: one line for the whole period. */
export function LastYearLine({ c }: { c: YearCompare }) {
  if (!c) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-ink">
      <span className="eyebrow">
        vs last year <HowCalculated metric="lastYear" period={`${c.days} matched store nights`} />
      </span>
      <span>
        Net sales {money(c.thisYear.sales)} vs {money(c.lastYear.sales)} <Change v={c.salesChange} />
      </span>
      <span>
        Tickets {num(c.thisYear.tickets)} vs {num(c.lastYear.tickets)} <Change v={c.ticketsChange} />
      </span>
      <span>{sptLine(c)}</span>
    </div>
  );
}

function lastNightLy(d: string) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 364);
  return t.toISOString().slice(0, 10);
}
