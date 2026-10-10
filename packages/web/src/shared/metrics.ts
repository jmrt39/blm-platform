// One vocabulary for every number on the platform. Web, mobile and reports all read from here.

export type MetricKey = "netSales" | "spendPerTicket" | "tickets" | "serverSpend" | "onTime" | "covers" | "opportunity" | "lastYear";

/** Bartender tickets are smaller (often one or two drinks), so a bartender's target is this share of the store target. */
export const BAR_TARGET_SHARE = 0.4;
/** Used when a store is created without a target. Owners should set their own from last year's numbers. */
export const DEFAULT_TICKET_TARGET = 150;
export const barTarget = (target: number) => Math.round(target * BAR_TARGET_SHARE);
export const targetForRole = (role: string, target: number) => (role === "bartender" ? barTarget(target) : target);

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
    exclusions: "Tax, tips, service charges, gift card sales, post-close adjustments",
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
    what: "How much each ticket comes to. Replaces ADS, PPA, average check and spend per guest on every screen.",
    formula: "Net sales ÷ tickets",
    source: "Shift report totals: net sales and ticket count from the POS",
    exclusions: "Same as net sales. Voided tickets are left out. Nights without a shift report are left out, not counted as zero",
  },
  serverSpend: {
    label: "Server spend per ticket",
    what: "Spend per ticket for one person's section.",
    formula: "That server's net sales ÷ that server's tickets",
    source: "Server lines on each shift report (POS server sales report)",
    exclusions: "Bartenders are ranked separately against 40% of the store target. Servers inside their first 30 days are shown as ramping, never ranked",
  },
  onTime: {
    label: "On time checklist completion",
    what: "Checklists signed off by a manager before their due time.",
    formula: "Checklists submitted on time ÷ checklists expected",
    source: "Checklist sign-offs (manager signature time vs due time)",
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
