// The BLM standard program, and the shape every client program takes.
// A client starts from a copy of this in the Studio; once published, their own copy replaces it.
import type { Module, Quiz, Rubric } from "../program";
import { DEFAULT_CLOSING, DEFAULT_OPENING } from "../domain";
import { MODULES } from "./modules";
import { QUIZZES } from "./quizzes";
import { REWARDS, type Reward } from "./rewards";
import { RUBRICS } from "./rubrics";

export type ChecklistLine = { area: string; title: string };
export type TalkingPoint = { text: string; tag: string };

export type Library = {
  /** 0 is the BLM standard. Client programs count up from 1 each time they are published. */
  version: number;
  label: string;
  modules: Module[];
  quizzes: Quiz[];
  rubrics: Rubric[];
  rewards: Reward[];
  checklists: { opening: ChecklistLine[]; closing: ChecklistLine[] };
  talkingPoints: TalkingPoint[];
};

export const STANDARD_TALKING_POINTS: TalkingPoint[] = [
  { tag: "Spend per ticket", text: "Every table hears two named recommendations before they order: one glass, one starter." },
  { tag: "Spend per ticket", text: "Offer the bottle, not the glass, to any table of three or more drinking the same wine." },
  { tag: "Spend per ticket", text: "Dessert is described, never asked about. Name two and say which one you love." },
  { tag: "Steps of service", text: "Greet within 60 seconds of the guest sitting down, even if it is only to say you will be right back." },
  { tag: "Steps of service", text: "Check presented within two minutes of the ask. Watch for the look before they have to say it." },
  { tag: "Standards", text: "Walk it, don't point it. Take every guest where they need to go." },
  { tag: "Standards", text: "Full hand in, full hand out. Nobody crosses the floor empty handed tonight." },
  { tag: "Allergies", text: "Every allergy goes on the seat with the red modifier and is said out loud at the pass." },
  { tag: "Guest recovery", text: "If a guest is unhappy, listen all the way to the end, then get a manager to the table." },
  { tag: "Comps and voids", text: "No void or comp without a manager's code and a reason the guest would recognise." },
  { tag: "Team", text: "Name one teammate who made your last shift easier and tell them before you clock out." },
  { tag: "Reputation", text: "The last five minutes are the first thing they remember. Slow the goodbye down." },
];

export const STANDARD_LIBRARY: Library = {
  version: 0,
  label: "BLM standard program",
  modules: MODULES,
  quizzes: QUIZZES,
  rubrics: RUBRICS,
  rewards: REWARDS,
  checklists: { opening: DEFAULT_OPENING, closing: DEFAULT_CLOSING },
  talkingPoints: STANDARD_TALKING_POINTS,
};

/** The standard program names the house with this token, so every client's copy reads as their own. */
export const HOUSE_TOKEN = "{house}";

/** "Harbor House Group" reads as "Harbor House", "1906 Hospitality Group" as "1906". */
export function houseName(orgName: string | null | undefined) {
  const n = (orgName ?? "").replace(/\s+(hospitality|restaurant|restaurants|dining)?\s*(group|co\.?|company|llc|inc\.?)$/i, "").replace(/\s+hospitality$/i, "").trim();
  return n || "House";
}

/** Fills the house token everywhere in a value (a whole program, one module, one quiz). */
export function forHouse<T>(value: T, house: string): T {
  if (!JSON.stringify(value).includes(HOUSE_TOKEN)) return value;
  return JSON.parse(JSON.stringify(value).split(HOUSE_TOKEN).join(house.replace(/["\\]/g, ""))) as T;
}

/** True when an item still names the 1906 demo house (slugs like "the-1906-standard" are ids, not copy). */
export function namesDemoHouse(data: unknown) {
  return /\b1906\b/.test(JSON.stringify(data).replace(/the-1906-standard/g, ""));
}

/** The BLM standard program written for one house. */
export function standardLibraryFor(house: string): Library {
  return forHouse(STANDARD_LIBRARY, house);
}

/** Lookups over one program. Every route and page reads the program through this. */
export function indexLibrary(lib: Library) {
  const moduleBySlug = Object.fromEntries(lib.modules.map((m) => [m.slug, m])) as Record<string, Module | undefined>;
  const quizBySlug = Object.fromEntries(lib.quizzes.map((q) => [q.slug, q])) as Record<string, Quiz | undefined>;
  const rubricBySlug = Object.fromEntries(lib.rubrics.map((r) => [r.slug, r])) as Record<string, Rubric | undefined>;
  const rewardByKey = Object.fromEntries(lib.rewards.map((r) => [r.key, r])) as Record<string, Reward | undefined>;
  const modulesFor = (role: string) => lib.modules.filter((m) => m.roles.includes(role));
  const rubricsFor = (role: string) => lib.rubrics.filter((r) => r.roles.includes(role));
  /** The floor rubric used for competency averages: the standard one if kept, else the first floor exercise. */
  const floorRubric = rubricBySlug["floor-service"] ?? lib.rubrics.find((r) => r.kind === "floor") ?? lib.rubrics[0];
  /** Quizzes a role is expected to take: their modules' quizzes, any extra checks tied to those modules, and advanced quizzes for sellers. */
  const quizzesFor = (role: string | null, isManager: boolean, sellers: string[]) => {
    if (!role || isManager) return lib.quizzes;
    const mods = modulesFor(role);
    const main = new Set(mods.map((m) => m.quiz));
    const slugs = new Set(mods.map((m) => m.slug));
    return lib.quizzes.filter((q) => main.has(q.slug) || (q.module && slugs.has(q.module)) || (q.level === "Advanced" && sellers.includes(role)));
  };
  return { lib, moduleBySlug, quizBySlug, rubricBySlug, rewardByKey, modulesFor, rubricsFor, quizzesFor, floorRubric };
}

export type LibraryIndex = ReturnType<typeof indexLibrary>;
