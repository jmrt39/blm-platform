// Shared front-of-house domain: roles, groups and labels. Used by API and web.

export const MANAGEMENT_ROLES = ["gm", "agm", "floor_manager", "bar_manager"] as const;
export const STAFF_ROLES = [
  "server",
  "bartender",
  "barback",
  "host",
  "busser",
  "food_runner",
  "sommelier",
  "expo",
] as const;
export const STORE_ROLES = [...MANAGEMENT_ROLES, ...STAFF_ROLES] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  area_manager: "Area Manager",
  gm: "General Manager",
  agm: "Assistant GM",
  floor_manager: "Floor Manager",
  bar_manager: "Bar Manager",
  server: "Server",
  bartender: "Bartender",
  barback: "Barback",
  host: "Host",
  busser: "Busser",
  food_runner: "Food Runner",
  sommelier: "Sommelier",
  expo: "Expo",
};

export const ROLE_SHORT: Record<string, string> = {
  owner: "Owner",
  area_manager: "Area",
  gm: "GM",
  agm: "AGM",
  floor_manager: "Floor Mgr",
  bar_manager: "Bar Mgr",
};

export function isManagementRole(role: string) {
  return (MANAGEMENT_ROLES as readonly string[]).includes(role);
}

export type ViewerLevel = "owner" | "area" | "manager" | "staff";

export function initialsOf(name: string) {
  const parts = name
    .replace(/[^A-Za-z\s.'-]/g, "")
    .split(/[\s.]+/)
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** The 30/60/90 onboarding plan every new colleague starts with. */
export function onboardingPlan(role: string): { phase: 30 | 60 | 90; title: string; detail: string }[] {
  const mgmt = isManagementRole(role);
  const bar = role === "bartender" || role === "barback" || role === "bar_manager";
  const floor = ["server", "sommelier", "food_runner", "busser", "expo", "host"].includes(role);
  const plan: { phase: 30 | 60 | 90; title: string; detail: string }[] = [
    { phase: 30, title: "Welcome & paperwork", detail: "I-9, W-4, handbook signed, uniform issued." },
    { phase: 30, title: "Food handler certificate on file", detail: "Upload or record expiry date." },
    { phase: 30, title: "Steps of service walkthrough", detail: "Greeting, recognition, table touches, recovery." },
    { phase: 30, title: "POS walkthrough with trainer", detail: "Ringing in, modifiers, splits, closing a check." },
    {
      phase: 30,
      title: "Opening & closing side work",
      detail: "Shadow one opening and one closing checklist, initial each line.",
    },
    { phase: 30, title: "Menu knowledge check", detail: "Every dish, allergen and the story behind it." },
  ];
  if (bar) {
    plan.push(
      { phase: 30, title: "Alcohol service certification", detail: "TIPS / ServSafe Alcohol on file." },
      { phase: 60, title: "Pour standards & jigger test", detail: "Signed off by the bar manager." },
      { phase: 60, title: "Specialty cocktail build out", detail: "Every house cocktail to spec, unassisted." },
    );
  }
  if (floor) {
    plan.push(
      { phase: 60, title: "Wine list: by the glass and top 20 bottles", detail: "Pairings, region, price point." },
      { phase: 60, title: "Glassware & silverware polish standard", detail: "Graded on the floor, signed off." },
    );
  }
  plan.push(
    { phase: 60, title: "First solo section", detail: "Manager observes one full turn and gives notes." },
    { phase: 60, title: "Spend per ticket at or near store target", detail: "Reviewed against the shift reports." },
    { phase: 90, title: "Full floor sign off", detail: "All competencies rated by a manager." },
    { phase: 90, title: "90 day review with GM", detail: "Goals, feedback, and the next step." },
  );
  if (mgmt) {
    plan.push(
      { phase: 30, title: "Store PIN & manager tools", detail: "Shift report, checklist sign off, team." },
      { phase: 60, title: "Run a pre shift line up", detail: "Focus, specials, 86 list, VIPs." },
      { phase: 90, title: "Close and submit a full week", detail: "Seven signed checklists and shift reports." },
    );
  }
  return plan;
}

/** Where an onboarding step is done on the platform. A step with a quiz ticks itself when the quiz is passed. */
export type OnboardingLink = { quiz?: string; module?: string; how: string };
const ONBOARDING_LINKS: Record<string, OnboardingLink> = {
  "Menu knowledge check": { quiz: "q-menu", module: "menu-allergens", how: "Read Menu & Allergens, then pass the check at 80%. It ticks itself when you pass." },
  "Wine list: by the glass and top 20 bottles": { quiz: "q-wine", module: "wine-list", how: "Read the Wine List module, then pass the check at 80%. It ticks itself when you pass." },
  "Steps of service walkthrough": { module: "steps-of-service", how: "Read Steps of Service before your walkthrough. Your trainer ticks it off." },
  "POS walkthrough with trainer": { module: "pos-walkthrough", how: "Read the POS Walkthrough before you sit with your trainer. Your trainer ticks it off." },
  "Opening & closing side work": { module: "table-setting-sidework", how: "Read Side Work, Opening & Closing before your shadow shifts. A manager ticks it off." },
  "Glassware & silverware polish standard": { module: "glassware-silverware", how: "Read Glassware & Silverware before you are graded on the floor." },
  "Specialty cocktail build out": { module: "specialty-cocktails", how: "Learn every spec in Specialty Cocktails before the build out." },
};
export function onboardingLink(title: string): OnboardingLink | null {
  // Older rows were saved with hyphens ("by-the-glass", "build-out"); match them the same way.
  return ONBOARDING_LINKS[title] ?? ONBOARDING_LINKS[title.replace(/-/g, " ")] ?? null;
}

export const DEFAULT_OPENING: { area: string; title: string }[] = [
  { area: "Bar", title: "Ice placed in the ice bin and poured into the wells behind the bar" },
  { area: "Bar", title: "Garnish tray cut and set: lemons, limes, oranges, cherries" },
  { area: "Bar", title: "Back bar wiped, bottles faced, speed rails stocked" },
  { area: "Bar", title: "Beer lines checked, taps pulled and tasted" },
  { area: "Dining room", title: "Centerpieces set on every table, candles checked" },
  { area: "Dining room", title: "Tables set to standard: two forks, two knives, bread plate, three glasses" },
  { area: "Dining room", title: "Glassware polished and spotted against the light" },
  { area: "Dining room", title: "Silverware polished, rolled and stocked at stations" },
  { area: "Service station", title: "Water carafes filled, coffee and tea station stocked" },
  { area: "Service station", title: "Check presenters, pens and guest cards stocked" },
  { area: "Host stand", title: "Reservations reviewed: VIPs, allergies, large parties noted" },
  { area: "Host stand", title: "Restrooms checked and stocked" },
];

export const DEFAULT_CLOSING: { area: string; title: string }[] = [
  { area: "Dining room", title: "Centerpieces removed and stored" },
  { area: "Dining room", title: "Tables stripped and wiped down, chairs pushed in" },
  { area: "Dining room", title: "Linens changed for tomorrow, soiled linen bagged" },
  { area: "Dining room", title: "Floor vacuumed, including under banquettes" },
  { area: "Service station", title: "Silverware rolled and put away for tomorrow" },
  { area: "Service station", title: "Coffee station broken down and cleaned" },
  { area: "Bar", title: "Bar wiped, mats washed, bottles capped and wiped" },
  { area: "Bar", title: "Garnishes wrapped and refrigerated, fruit flies covered" },
  { area: "Bar", title: "Ice bin burned down and dried" },
  { area: "Bar", title: "Liquor room and coolers locked" },
  { area: "Office", title: "Checks closed out, drawers counted and dropped" },
  { area: "Office", title: "Doors locked, alarm set" },
];

/** "servers, sommeliers and bartenders": a list of roles as a sentence. */
export function rolesList(roles: string[]) {
  const w = roles.map((r) => {
    const l = (ROLE_LABEL[r] ?? r).toLowerCase();
    return l.endsWith("s") ? l : `${l}s`;
  });
  return w.length < 2 ? (w[0] ?? "") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

/** What the demo group is called on screen, everywhere. */
export const DEMO_ORG_NAME = "Sample Restaurant Group";
