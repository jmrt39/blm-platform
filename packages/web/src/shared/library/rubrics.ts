// Grading rubrics for floor exercises and skills checks. Each criterion is scored 1–5 stars.
import type { Rubric } from "../program";

export const STAR_LABELS = ["", "Not yet", "Needs coaching", "Meets standard", "Strong", "Sets the standard"] as const;

export const RUBRICS: Rubric[] = [
  {
    slug: "floor-service",
    repeat: "monthly",
    title: "Floor grade · full turn",
    kind: "floor",
    summary: "A trainer or manager follows one full table turn and grades the six competencies.",
    module: "steps-of-service",
    roles: ["server", "bartender", "sommelier"],
    criteria: [
      { key: "greeting", label: "Greeting", look: "Within 60 seconds; introduces self; regulars by name; reads the table." },
      { key: "menu", label: "Menu Introduction", look: "Two specials, market fish and the 86 list without reading the menu; tells a story." },
      { key: "upsell", label: "Leading Questions & Upsell", look: "Choice questions not yes/no; offers a call brand; wine with the entrée; dessert to every table." },
      { key: "pos", label: "Order & POS Accuracy", look: "Seat numbers on every item; modifiers from buttons; allergies flagged; coursing right." },
      { key: "delivery", label: "Food & Drink Delivery Etiquette", look: "Food from the left, clear from the right; plates announced; no auctioning." },
      { key: "rapport", label: "Rapport, Recovery & Thank You", look: "Checks back in two bites; handles any issue with LAST; thanks by name at the farewell." },
    ],
  },
  {
    slug: "wine-presentation",
    title: "Wine presentation",
    kind: "skill",
    summary: "Present, open and pour a bottle at a practice table.",
    module: "wine-service",
    roles: ["server", "sommelier"],
    criteria: [
      { key: "present", label: "Presentation", look: "Label to the host; producer, wine and vintage said clearly." },
      { key: "open", label: "Foil & cork", look: "Clean foil cut below the lip; cork out quietly; placed to the host's right." },
      { key: "taste", label: "Taste pour", look: "Small taste to the host; waits for approval." },
      { key: "pour", label: "Pouring order & measure", look: "Ladies first, clockwise, host last; 5 oz; no drips." },
      { key: "story", label: "One sentence of story", look: "Producer, place and why it suits the dish, in one sentence." },
    ],
  },
  {
    slug: "cocktail-spec",
    title: "Cocktail spec check",
    kind: "skill",
    summary: "Build three house cocktails from memory to spec.",
    module: "specialty-cocktails",
    roles: ["bartender", "server", "barback"],
    criteria: [
      { key: "spec", label: "Spec from memory", look: "Correct spirits and measures without the card." },
      { key: "method", label: "Method", look: "Stirred vs shaken chosen correctly; proper dilution." },
      { key: "glass", label: "Glass & ice", look: "Right glass, chilled; right ice." },
      { key: "garnish", label: "Garnish", look: "Expressed, placed and consistent." },
      { key: "speed", label: "Speed & cleanliness", look: "Under 90 seconds a drink; station clean as they go." },
    ],
  },
  {
    slug: "pos-accuracy",
    title: "POS walkthrough with trainer",
    kind: "skill",
    summary: "Ring a four top from open to close with the trainer beside you.",
    module: "pos-walkthrough",
    roles: ["server", "bartender", "sommelier", "host"],
    criteria: [
      { key: "open", label: "Open table & guest count", look: "Own PIN; correct table and covers." },
      { key: "seats", label: "Seat numbers", look: "Every item to a seat." },
      { key: "mods", label: "Modifiers & allergies", look: "Buttons not free text; red ALLERGY modifier." },
      { key: "course", label: "Coursing & fire", look: "Mains held, fired on clear; soufflé flagged." },
      { key: "close", label: "Splits & closing", look: "Split by seat; closes the check before leaving the section." },
    ],
  },
  {
    slug: "glassware-polish",
    title: "Glassware polish",
    kind: "skill",
    summary: "Polish a rack of stems and hold each to the light with the grader.",
    module: "glassware-silverware",
    roles: ["server", "bartender", "sommelier", "host", "busser", "food_runner", "barback", "expo"],
    criteria: [
      { key: "steam", label: "Steam & polish", look: "Two linens; never touches the bowl." },
      { key: "light", label: "Held to the light", look: "No spots, lint or fingerprints." },
      { key: "carry", label: "Handling", look: "By the stem; racks for more than four." },
      { key: "pace", label: "Pace", look: "A rack of 25 in under ten minutes." },
    ],
  },
  {
    slug: "silverware-setting",
    title: "Silverware & table setting",
    kind: "skill",
    summary: "Polish, roll and set a four top to the 1906 standard.",
    module: "table-setting-sidework",
    roles: ["server", "busser", "food_runner", "host", "expo", "barback", "bartender"],
    criteria: [
      { key: "polish", label: "Silver polished", look: "Vinegar water and linen; both sides inspected." },
      { key: "handle", label: "Handled correctly", look: "By the handle only." },
      { key: "roll", label: "Roll-ups", look: "Knife, fork, spoon; seam underneath." },
      { key: "setting", label: "The 1906 setting", look: "Forks left, knives right blades in, bread plate top left, glasses on the diagonal, one inch from the edge." },
    ],
  },
];

export const RUBRIC_BY_SLUG = Object.fromEntries(RUBRICS.map((r) => [r.slug, r])) as Record<string, Rubric>;

export function rubricsFor(role: string) {
  return RUBRICS.filter((r) => r.roles.includes(role));
}

/** Average star score across a scored rubric. */
export function gradeAverage(scores: Record<string, number>) {
  const v = Object.values(scores).filter((n) => n > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : 0;
}
