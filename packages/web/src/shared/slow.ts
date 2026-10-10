// Slow nights: protect people's hours without paying for an empty room.

export const SLOW_ACTIONS = {
  voluntary_out: { label: "Went home early (volunteered)", short: "Volunteered out", keepsPay: false },
  cut: { label: "Cut for the night", short: "Cut", keepsPay: false },
  sister_store: { label: "Picked up a shift at a sister store", short: "Sister store", keepsPay: true },
  outreach: { label: "Guest outreach: VIP calls, future bookings, private events", short: "Outreach", keepsPay: true },
  training: { label: "Paid training or certification study", short: "Training", keepsPay: true },
} as const;
export type SlowAction = keyof typeof SLOW_ACTIONS;
export const SLOW_ACTION_KEYS = Object.keys(SLOW_ACTIONS) as [SlowAction, ...SlowAction[]];

/** Hours a dinner shift is worth when we only know someone worked it. */
export const SHIFT_HOURS = 6;
/** Covers one server can carry well on a dinner shift. Used to suggest how many to keep. */
export const COVERS_PER_SERVER = 22;
export const COVERS_PER_BARTENDER = 30;

export const SLOW_PRINCIPLES = [
  {
    h: "Cut by the data, not by habit",
    p: "Forecast tonight's covers from the same weekday over the last four weeks, then keep enough sections to serve them well. Anything beyond that is labour with no sales behind it.",
  },
  {
    h: "Keep the people who make money on",
    p: "When people have to go, the ones selling below tonight's floor average per ticket go before the ones above it. On a slow night every table matters more, so put it in the best hands. New hires under 30 days stay on: they need the reps.",
  },
  {
    h: "Redeploy before you cut",
    p: "A sister store short a server tonight is the cheapest fix there is: the hours stay in the group and nobody loses a shift.",
  },
  {
    h: "Volunteers first, then fairness",
    p: "Ask who wants to go. Among people selling at a similar level, the person furthest above their weekly hours goal goes next, and the ledger makes sure the same person isn't always the one sent home.",
  },
  {
    h: "Paid alternatives only when they pay back",
    p: "Guest outreach (calling VIPs, booking future tables, chasing private events) and certification study keep someone earning, but they cost wages. Use them only when there's a real payback: a private event to chase, a lapsed regular to call, a certification about to expire.",
  },
];
