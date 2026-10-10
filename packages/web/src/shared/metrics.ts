// One vocabulary for every number on the platform. Web, mobile and reports all read from here.

export type MetricKey = "netSales" | "spendPerTicket" | "tickets" | "serverSpend" | "onTime" | "covers" | "opportunity" | "lastYear";

/** Bartender tickets are smaller (often one or two drinks), so a bartender's target is this share of their grid target. */
export const BAR_TARGET_SHARE = 0.4;
/** The headline target: average dollar sale per ticket, dinner, full time. Owners set their own from last year's numbers. */
export const DEFAULT_TICKET_TARGET = 78;
export const barTarget = (target: number) => Math.round(target * BAR_TARGET_SHARE * 100) / 100;

/* ── Targets: each person is measured against the shifts they were given ─────────────── */

export const EMPLOYMENT = ["full_time", "part_time"] as const;
export type Employment = (typeof EMPLOYMENT)[number];
export const EMPLOYMENT_LABEL: Record<Employment, string> = { full_time: "Full time", part_time: "Part time" };

/**
 * A store's four targets. Full time servers are usually the veterans who get first call on large parties,
 * so their target sits higher. Lunch tickets are smaller than dinner tickets.
 * Left blank, the other three follow from the dinner full time target.
 */
export type TargetGrid = { dinnerFull: number; dinnerPart: number; lunchFull: number; lunchPart: number };
export const GRID_SHARE = { dinnerPart: 0.92, lunchFull: 0.7, lunchPart: 0.65 } as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
export function targetGrid(st: { ticketTarget: number; dinnerPartTarget?: number | null; lunchTarget?: number | null; lunchPartTarget?: number | null }): TargetGrid {
  const T = st.ticketTarget;
  return {
    dinnerFull: T,
    dinnerPart: st.dinnerPartTarget ?? Math.round(T * GRID_SHARE.dinnerPart),
    lunchFull: st.lunchTarget ?? Math.round(T * GRID_SHARE.lunchFull),
    lunchPart: st.lunchPartTarget ?? Math.round(T * GRID_SHARE.lunchPart),
  };
}

export type PersonTargetInput = { role: string; employment?: Employment | null; targetAdjust?: number | null };
/** The target for one person on one shift: their grid cell, plus any personal adjustment, then the bar share for bartenders. */
export function targetFor(grid: TargetGrid, p: PersonTargetInput, shift: "lunch" | "dinner" = "dinner") {
  const pt = p.employment === "part_time";
  const base = shift === "lunch" ? (pt ? grid.lunchPart : grid.lunchFull) : pt ? grid.dinnerPart : grid.dinnerFull;
  const t = Math.max(1, base + (p.targetAdjust ?? 0));
  return r2(p.role === "bartender" ? barTarget(t) : t);
}
/** Back compat: a person's dinner target from the store's headline target alone. */
export const targetForRole = (role: string, target: number) => (role === "bartender" ? barTarget(target) : target);

/* ── What counts ──────────────────────────────────────────────────────────────────────── */

/** How a person worked a shift. Only solo serving counts toward their average, the 8 shift minimum and every reward. */
export const SHIFT_KINDS = ["solo", "training_other", "being_trained", "other_work", "event", "short"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];
export const SHIFT_KIND_LABEL: Record<ShiftKind, string> = {
  solo: "Serving solo",
  training_other: "Training someone",
  being_trained: "Being trained",
  other_work: "Other work",
  event: "Private event",
  short: "Cut short",
};
export const SHIFT_KIND_HELP: Record<ShiftKind, string> = {
  solo: "Their own section, on their own. Counts.",
  training_other: "A trainer with a trainee shadowing. Doesn't count.",
  being_trained: "Shadowing or in training. Doesn't count.",
  other_work: "Host, expo, bar back or events setup. Doesn't count.",
  event: "Private event or buyout on a fixed price menu. Doesn't count.",
  short: "Sent home or left under 3 hours in. Doesn't count.",
};
export const isCounted = (kind: string | null | undefined) => !kind || kind === "solo";

/* ── Comparing people who work different shifts ───────────────────────────────────────── */

/**
 * Lunch and dinner, full time and part time, floor and bar all carry different targets, and most people work a
 * mix. Raw dollars per ticket can't rank them fairly: a lunch heavy part timer will always look weaker than a
 * full time closer. So every comparison runs on what each ticket should have sold:
 *
 *   expected sales = Σ (the target frozen on each shift line × that line's tickets)
 *   vs own target  = actual sales ÷ expected sales        (100% = exactly on their own mix)
 *   mix target     = expected sales ÷ tickets             (the dollar target their mix adds up to)
 *
 * People are ranked, coached and paid on "vs own target". Stores compare their spend per ticket with the mix
 * target of the shifts they actually ran, not the dinner full time headline.
 */
export const vsTarget = (sales: number, expected: number) => (expected > 0 ? sales / expected : null);
export const mixTarget = (expected: number, tickets: number) => (tickets > 0 ? Math.round((expected / tickets) * 100) / 100 : null);
export const pctOfTarget = (x: number | null | undefined) => (x == null ? "·" : `${Math.round(x * 100)}%`);
export const MIX_RULE =
  "Everyone is measured against their own mix: each shift carries the target for that shift (lunch or dinner, full or part time, floor or bar), weighted by tickets. Rankings use the percentage of that target, so people who work different shifts compare fairly.";

/* ── Rewards ──────────────────────────────────────────────────────────────────────────── */

/** "At target" is always the rolling 30 day average. */
export const ROLLING_DAYS = 30;
/** Counted shifts needed in the 30 days before any reward is earned. */
export const MIN_SHIFTS = 8;
/** Servers inside their first 30 days are ramping: shown, never ranked against people with a full month on the floor. */
export const RAMP_DAYS = 30;
/** Cash starts this far above target. Hitting target earns the non cash rewards. */
export const CASH_OVER = 0.05;
export const CASH_BONUS = 150;
/** The cash bonus for a result against a target, given enough shifts. */
export function cashBonus(spt: number, target: number) {
  return spt >= target * (1 + CASH_OVER) ? CASH_BONUS : 0;
}
export const BONUS_RULE = `$${CASH_BONUS} cash at ${Math.round(CASH_OVER * 100)}% or more over target on the rolling ${ROLLING_DAYS} days, with at least ${MIN_SHIFTS} solo serving shifts. Hitting target earns the non cash rewards.`;
export const PAYOUT_RULE = "Decided on the 30 days ending the last day of the month. Paid on the first payday after, and never later than 30 days after the month ends.";
export const CONDUCT_BLOCK_RULE =
  "No reward of any kind for a period in which a written warning, performance plan or termination was active on any day. Eligibility returns from the next full period.";

export type MetricDef = {
  label: string;
  /** Short plain-English definition. */
  what: string;
  formula: string;
  source: string;
  exclusions: string;
};

export const NET_SALES_RULE =
  "Gross food, beverage and wine sales after comps, voids, discounts and refunds. Excludes sales tax, tips and service charges paid to staff, gift card sales (counted when redeemed) and manager adjustments made after close.";

export const METRICS: Record<MetricKey, MetricDef> = {
  netSales: {
    label: "Net sales",
    what: "What the room actually sold.",
    formula: "Gross sales − comps − voids − discounts − refunds",
    source: "POS end of day, entered or uploaded on the nightly shift report",
    exclusions: "Tax, tips, service charges, gift card sales, post close adjustments",
  },
  covers: {
    label: "Covers",
    what: "Guests served, as counted by the POS.",
    formula: "Sum of guest counts on closed checks",
    source: "POS end of day (shift report)",
    exclusions: "Bar seats without a guest count, staff meals, voided checks",
  },
  tickets: {
    label: "Tickets",
    what: "Closed checks printed by the POS. One table, one ticket, unless it was split.",
    formula: "Count of closed checks",
    source: "POS end of day (shift report)",
    exclusions: "Voided checks. A split check counts once per printed ticket",
  },
  spendPerTicket: {
    label: "Spend per ticket",
    what: "The average dollar sale per ticket. Replaces ADS, PPA, average check and spend per guest on every screen.",
    formula: "Net sales ÷ tickets",
    source: "Shift report totals: net sales and ticket count from the POS",
    exclusions: "Same as net sales. Voided tickets are left out. Nights without a shift report are left out, not counted as zero",
  },
  serverSpend: {
    label: "Server spend per ticket",
    what: "Spend per ticket for one person's section.",
    formula: "That server's net sales ÷ that server's tickets",
    source: "Server lines on each shift report (POS server sales report)",
    exclusions: "Only solo serving shifts count: not training, being trained, other work, private events or shifts cut short. Each shift is measured against its own target (lunch or dinner, full or part time), and people are ranked on the percentage of their own ticket weighted target, never on raw dollars across different shifts. Bartenders are ranked separately on 40% of that. Servers inside their first 30 days are shown as ramping, never ranked",
  },
  onTime: {
    label: "On time checklist completion",
    what: "Checklists signed off by a manager before their due time.",
    formula: "Checklists submitted on time ÷ checklists expected",
    source: "Checklist sign offs (manager signature time vs due time)",
    exclusions: "Today's checklists are only counted once their due time has passed. N/A lines count as done when a reason is given",
  },
  opportunity: {
    label: "Modeled annual sales opportunity",
    what: "A model of what's possible, not verified loss or guaranteed improvement.",
    formula: "(Top two spend per ticket − priority two spend per ticket) ÷ 2 × priority two tickets × (365 ÷ days in period)",
    source: "Server lines on shift reports for the period",
    exclusions: "Ramping servers (under 30 days), servers with fewer than 3 shifts, bartenders. Sales, not profit or contribution",
  },
  lastYear: {
    label: "On this day last year",
    what: "The same weekday, 52 weeks earlier, from the year of sales history the restaurant handed over before launch.",
    formula: "This period ÷ the same period 364 days earlier − 1",
    source: "Last year: the history import. This year: nightly shift reports",
    exclusions: "Days missing from either year are left out of both, so the comparison is like for like",
  },
};
