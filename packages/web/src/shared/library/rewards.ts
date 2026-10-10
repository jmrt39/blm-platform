// Recognition & Rewards — the eight incentives. Eligibility is computed from the platform's data;
// managers record the award when it is given.

export type RewardKey =
  | "day_off"
  | "guest_quote"
  | "ads_bonus"
  | "first_pick"
  | "chefs_table"
  | "certification"
  | "peer_dinner"
  | "winery_visit";

export type Reward = {
  key: RewardKey;
  n: number;
  title: string;
  value: string;
  cadence: "Quarterly" | "Each shift" | "Monthly" | "Annual";
  /** How it is earned, in one line. */
  rule: string;
};

export const REWARDS: Reward[] = [
  {
    key: "day_off",
    n: 1,
    title: "Paid day off",
    value: "One paid day",
    cadence: "Quarterly",
    rule: "Spend per guest at or above the store target for the whole quarter.",
  },
  {
    key: "guest_quote",
    n: 2,
    title: "Guest-quote recognition",
    value: "Read aloud at pre-shift",
    cadence: "Each shift",
    rule: "Named by a guest in a review or comment card. The quote is pinned to the line-up.",
  },
  {
    key: "ads_bonus",
    n: 3,
    title: "Monthly spend per guest bonus",
    value: "$150–$250",
    cadence: "Monthly",
    rule: "$150 at target, $200 at target + $5, $250 at target + $10 spend per guest for the month.",
  },
  {
    key: "first_pick",
    n: 4,
    title: "First pick of sections & shifts",
    value: "First choice next month",
    cadence: "Monthly",
    rule: "Highest spend per guest in the store last month.",
  },
  {
    key: "chefs_table",
    n: 5,
    title: "Chef's Table for two",
    value: "With sommelier pairing",
    cadence: "Quarterly",
    rule: "Highest floor-grade average in the quarter (4.5 stars or better), with every required module signed off.",
  },
  {
    key: "certification",
    n: 6,
    title: "Certification paid in full",
    value: "WSET Level 2 or CMS Introductory",
    cadence: "Annual",
    rule: "Every required module signed off, the Sommelier's Table quiz passed and six months' tenure.",
  },
  {
    key: "peer_dinner",
    n: 7,
    title: "Dinner for two at a peer restaurant",
    value: "On the house",
    cadence: "Quarterly",
    rule: "At target for the quarter with no strikes in the last 90 days and a guest quote naming them.",
  },
  {
    key: "winery_visit",
    n: 8,
    title: "Winery or distillery visit",
    value: "Top performer of the year",
    cadence: "Annual",
    rule: "Highest overall rating in the store for the year.",
  },
];

export const REWARD_BY_KEY = Object.fromEntries(REWARDS.map((r) => [r.key, r])) as Record<RewardKey, Reward>;
export const REWARD_KEYS = REWARDS.map((r) => r.key) as [RewardKey, ...RewardKey[]];
