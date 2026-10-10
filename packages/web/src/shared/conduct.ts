// Conduct, line-up and discipline rules. Shared by API and web so both say the same thing.

/** Minutes after the scheduled start before someone counts as late. */
export const LATE_GRACE_MIN = 5;
/** Strikes count for this many days, rolling. */
export const STRIKE_WINDOW_DAYS = 90;
/** Share of the overall rating that comes from conduct & attendance. */
export const CONDUCT_WEIGHT = 0.25;

export const SHIFTS = ["lunch", "dinner"] as const;
export type Shift = (typeof SHIFTS)[number];
export const SHIFT_LABEL: Record<Shift, string> = { lunch: "Lunch", dinner: "Dinner" };
export const DEFAULT_CALL: Record<Shift, string> = { lunch: "10:30", dinner: "16:00" };

export const EVENT_TYPES = ["late", "dress_code", "no_show", "swap_protocol"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABEL: Record<EventType, string> = {
  late: "Late",
  dress_code: "Out of dress code",
  no_show: "No-show",
  swap_protocol: "Swap without protocol",
};

export const ARRIVALS = ["pending", "on_time", "late", "no_show", "swap_unapproved", "swapped_out"] as const;
export type Arrival = (typeof ARRIVALS)[number];

export const UNIFORM_ITEMS = [
  "Black shirt, pressed",
  "Black trousers or skirt",
  "Apron",
  "Black non-slip shoes",
  "Name badge",
  "Hair & grooming",
  "Wine key & pens",
] as const;

export const STEPS = ["verbal", "written", "plan", "termination"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = {
  verbal: "Verbal warning",
  written: "Written warning",
  plan: "Performance plan",
  termination: "Termination",
};
export const STEP_SHORT: Record<Step, string> = {
  verbal: "Verbal",
  written: "Written",
  plan: "Plan",
  termination: "Termination",
};

/** 3 strikes = verbal; after that each new strike moves up one step. */
export function stepForStrikes(strikes: number): Step | null {
  if (strikes >= 6) return "termination";
  if (strikes === 5) return "plan";
  if (strikes === 4) return "written";
  if (strikes === 3) return "verbal";
  return null;
}
export const stepRank = (s: Step | null | undefined) => (s ? STEPS.indexOf(s) + 1 : 0);

/**
 * The next write-up the ladder would open, given the strikes in the window and the step already on file,
 * and how many more strikes it takes (verbal at 3, written 4, plan 5, termination 6).
 */
export function nextOnLadder(strikes: number, have: Step | null): { step: Step; in: number } | null {
  const rank = Math.max(stepRank(have), stepRank(stepForStrikes(strikes)));
  const step = STEPS[rank];
  if (!step) return null;
  return { step, in: Math.max(1, rank + 3 - strikes) };
}

export const SWAP_RULE =
  "Attach a screenshot of the text with the person picking up the shift. It must show the date, the start time, and their written agreement to take it. A thumbs-up or emoji is not confirmation.";

export function minutesBetween(from: string, to: string) {
  const [a, b] = from.split(":").map(Number);
  const [c, d] = to.split(":").map(Number);
  return c! * 60 + d! - (a! * 60 + b!);
}

export function clock12(hhmm: string | null | undefined) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const hr = h! % 12 === 0 ? 12 : h! % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${h! < 12 ? "am" : "pm"}`;
}

export function ratingLabel(n: number | null | undefined) {
  if (n == null) return "Not enough data";
  if (n >= 90) return "Exceptional";
  if (n >= 80) return "Strong";
  if (n >= 70) return "Meets standard";
  if (n >= 60) return "Needs attention";
  return "At risk";
}

export type EntryLike = {
  arrival: Arrival;
  minutesLate: number | null;
  scheduledStart: string;
  arrivedAt: string | null;
  uniformOk: boolean | null;
  uniformMissing: string[];
  coverName: string | null;
};

/** What a line-up entry adds to someone's record when the line-up is signed. */
export function infractionsFor(e: EntryLike, shift: Shift) {
  const out: { type: EventType; detail: string; minutesLate?: number }[] = [];
  const sh = SHIFT_LABEL[shift].toLowerCase();
  if (e.arrival === "late" && (e.minutesLate ?? 0) > LATE_GRACE_MIN)
    out.push({
      type: "late",
      minutesLate: e.minutesLate!,
      detail: `${e.minutesLate} min late for the ${sh} shift — scheduled ${clock12(e.scheduledStart)}, arrived ${clock12(e.arrivedAt)}.`,
    });
  if ((e.arrival === "on_time" || e.arrival === "late") && e.uniformOk === false)
    out.push({
      type: "dress_code",
      detail: `Out of dress code at the ${sh} line-up${e.uniformMissing.length ? `: ${e.uniformMissing.join(", ").toLowerCase()}` : ""}.`,
    });
  if (e.arrival === "no_show") out.push({ type: "no_show", detail: `No-show for the ${sh} shift (scheduled ${clock12(e.scheduledStart)}).` });
  if (e.arrival === "swap_unapproved")
    out.push({
      type: "swap_protocol",
      detail: `${e.coverName ? `${e.coverName} covered` : "Someone else covered"} the ${sh} shift without an approved swap (no screenshot showing date, start time and written agreement).`,
    });
  return out;
}
