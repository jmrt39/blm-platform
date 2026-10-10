// Recognition and rewards. Eligibility is computed from the platform's data;
// managers record the award when it is given. Values here are the BLM standard; each group can set its own in the Studio.

export type RewardKey =
  | "day_off"
  | "guest_quote"
  | "ads_bonus"
  | "first_pick"
  | "chefs_table"
  | "certification"
  | "peer_dinner"
  | "winery_visit"
  | "most_surveys"
  | "above_beyond"
  | "named_ten";

export type Reward = {
  key: RewardKey;
  n: number;
  title: string;
  value: string;
  cadence: "Quarterly" | "Each shift" | "Monthly" | "Annual" | "Every 10";
  /** How it is earned, in one line. */
  rule: string;
  /** When the winner picks their prize: the options, in the order shown. */
  choices?: string[];
};

export const REWARDS: Reward[] = [
  {
    key: "day_off",
    n: 1,
    title: "Paid day off",
    value: "One paid day",
    cadence: "Quarterly",
    rule: "At or above your own spend per ticket target on solo shifts for the whole quarter, with at least 8 solo shifts a month.",
  },
  {
    key: "guest_quote",
    n: 2,
    title: "Guest quote recognition",
    value: "Read aloud at line up",
    cadence: "Each shift",
    rule: "Named by a guest in a review, survey or comment card. The quote is pinned to the line up.",
  },
  {
    key: "ads_bonus",
    n: 3,
    title: "Monthly spend per ticket bonus",
    value: "$150 cash",
    cadence: "Monthly",
    rule: "$150 cash at 5% or more over your own target on the rolling 30 days ending the last day of the month, with at least 8 solo shifts. Paid on the first payday after, and never later than 30 days after the month ends.",
  },
  {
    key: "first_pick",
    n: 4,
    title: "First pick of sections & shifts",
    value: "First choice next month",
    cadence: "Monthly",
    rule: "Highest share of their own target last month, at target or better, with at least 8 solo shifts.",
  },
  {
    key: "chefs_table",
    n: 5,
    title: "Chef's Table for two",
    value: "With sommelier pairing",
    cadence: "Quarterly",
    rule: "Highest floor grade average in the quarter (4.5 stars or better), with every required module signed off.",
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
    rule: "At target for the quarter on solo shifts, no strikes in the last 90 days, and named by a guest at least once.",
  },
  {
    key: "winery_visit",
    n: 8,
    title: "Winery or distillery visit",
    value: "Top performer of the year",
    cadence: "Annual",
    rule: "Highest overall rating in the store for the year.",
  },
  {
    key: "most_surveys",
    n: 9,
    title: "Most guest surveys",
    value: "$50 to spend at the restaurant",
    cadence: "Monthly",
    rule: "The most guest reviews and surveys naming them this month wins $50 to spend at the restaurant: dinner for them or a guest. Ties share it.",
  },
  {
    key: "above_beyond",
    n: 10,
    title: "Above and beyond",
    value: "$500 + one paid day off",
    cadence: "Quarterly",
    rule: "A guest describes them going above and beyond and a manager marks the review. The most marked reviews this quarter wins: $500 cash plus a paid day off (8 hours at the training rate).",
  },
  {
    key: "named_ten",
    n: 11,
    title: "Ten guests, by name",
    value: "Pick one of three",
    cadence: "Every 10",
    rule: "Every 10 guest reviews or surveys where the guest used your name. A manager only tag doesn't count: the guest has to say it. You pick one: your section on a Friday or Saturday, one shift with no side work, or $50 to spend at the restaurant.",
    choices: ["Your pick of section on a Friday or Saturday", "One shift with no side work", "$50 to spend at the restaurant"],
  },
];

export const REWARD_BY_KEY = Object.fromEntries(REWARDS.map((r) => [r.key, r])) as Record<RewardKey, Reward>;
export const REWARD_KEYS = REWARDS.map((r) => r.key) as [RewardKey, ...RewardKey[]];
