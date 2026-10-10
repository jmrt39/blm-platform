// One vocabulary for every number on the platform. Web, mobile and reports all read from here.

export type MetricKey = "netSales" | "spendPerGuest" | "avgCheck" | "serverSpend" | "onTime" | "covers" | "opportunity";

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
  spendPerGuest: {
    label: "Spend per guest",
    what: "How much each guest spends. Replaces ADS, PPA and average dollar sale on every screen.",
    formula: "Net sales ÷ covers",
    source: "Shift report totals",
    exclusions: "Same as net sales. Nights without a shift report are left out, not counted as zero",
  },
  avgCheck: {
    label: "Average check",
    what: "How much each table's bill comes to.",
    formula: "Net sales ÷ checks",
    source: "Shift report: check count from the POS",
    exclusions: "Voided checks, split checks count once per printed check",
  },
  serverSpend: {
    label: "Server spend per guest",
    what: "Spend per guest for one person's section.",
    formula: "That server's net sales ÷ that server's covers",
    source: "Server lines on each shift report (POS server sales report)",
    exclusions: "Bartenders are ranked separately. Servers inside their first 30 days are shown as ramping, never ranked",
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
    formula: "(Top two spend per guest − priority two spend per guest) ÷ 2 × priority two covers × (365 ÷ days in period)",
    source: "Server lines on shift reports for the period",
    exclusions: "Ramping servers (under 30 days), servers with fewer than 3 shifts, bartenders. Sales, not profit or contribution",
  },
};
