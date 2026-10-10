// Training program: types, rules and helpers shared by API, web and mobile.
// The library content itself lives in ./library/*.

export type Section = {
  h: string;
  p?: string;
  list?: string[];
  /** A two-column table, e.g. wine list rows. */
  table?: { head: string[]; rows: string[][] };
  /** Pull-quote / house saying. */
  say?: string;
  note?: string;
};

export type ModuleCategory = "House" | "Service" | "Menu" | "Wine & bar" | "Standards";

export type Module = {
  slug: string;
  n: number;
  title: string;
  category: ModuleCategory;
  summary: string;
  minutes: number;
  /** Store roles this module is required for. */
  roles: string[];
  /** Where it comes from in the house manual. */
  manual: string;
  sections: Section[];
  quiz?: string;
  rubric?: string;
};

export type Criterion = { key: string; label: string; look: string };
export type Rubric = {
  slug: string;
  title: string;
  kind: "floor" | "skill";
  summary: string;
  module: string;
  roles: string[];
  criteria: Criterion[];
};

export type Question = { id: string; q: string; choices: string[]; answer: number; why: string };
export type Quiz = {
  slug: string;
  title: string;
  module?: string;
  level: "Core" | "Advanced";
  questions: Question[];
};

export const PASS_MARK = 0.8;
/** Minimum average on a floor exercise before a module can be signed off. */
export const GRADE_PASS = 3.5;

export const SELLERS = ["server", "bartender", "sommelier"];
export const SUPPORT = ["host", "busser", "food_runner", "barback", "expo"];
export const ALL_FOH = [...SELLERS, ...SUPPORT];

export type ModuleStatus = "not_started" | "reading" | "in_progress" | "ready" | "signed_off";

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  not_started: "Not started",
  reading: "Read",
  in_progress: "In progress",
  ready: "Ready to sign off",
  signed_off: "Signed off",
};

/** What a module still needs before a trainer can sign it off. */
export function moduleNeeds(
  m: Pick<Module, "quiz" | "rubric">,
  p: { read: boolean; quizBest: number | null; gradeBest: number | null; signedOff: boolean },
) {
  const needs: string[] = [];
  if (!p.read) needs.push("Read the module");
  if (m.quiz && (p.quizBest ?? 0) < PASS_MARK) needs.push("Pass the knowledge check (80%)");
  if (m.rubric && (p.gradeBest ?? 0) < GRADE_PASS) needs.push(`Floor exercise graded ${GRADE_PASS}+ stars`);
  let status: ModuleStatus;
  if (p.signedOff) status = "signed_off";
  else if (!needs.length) status = "ready";
  else if (p.read || p.quizBest != null || p.gradeBest != null)
    status = p.read && p.quizBest == null && p.gradeBest == null ? "reading" : "in_progress";
  else status = "not_started";
  return { status, needs };
}

export const CERT_KINDS = {
  food_handler: "Food handler",
  alcohol: "Alcohol service (TIPS / ServSafe)",
  wset2: "WSET Level 2",
  cms_intro: "CMS Introductory Sommelier",
} as const;
export type CertKind = keyof typeof CERT_KINDS;
/** Certifications every front-of-house role must hold. */
export function requiredCerts(role: string): CertKind[] {
  const out: CertKind[] = ["food_handler"];
  if (["server", "bartender", "barback", "sommelier", "bar_manager", "gm", "agm", "floor_manager"].includes(role)) out.push("alcohol");
  return out;
}

export const UPDATE_KINDS = {
  menu: "Menu",
  wine: "Wine",
  cocktails: "Cocktails",
  service: "Service",
  house: "House notes",
} as const;
export type UpdateKind = keyof typeof UPDATE_KINDS;

export const FEEDBACK_SOURCES = ["OpenTable", "Resy", "Google", "Yelp", "Tripadvisor", "Comment card", "Email", "In person"] as const;

export function seasonOf(date: string) {
  const [y, m] = date.split("-").map(Number);
  const season = m! >= 3 && m! <= 5 ? "Spring" : m! >= 6 && m! <= 8 ? "Summer" : m! >= 9 && m! <= 11 ? "Autumn" : "Winter";
  return `${season} ${y}`;
}

export function quarterOf(date: string) {
  const [y, m] = date.split("-").map(Number);
  const q = Math.floor((m! - 1) / 3) + 1;
  const start = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
  return { label: `Q${q} ${y}`, key: `${y}-Q${q}`, start };
}

export function monthOf(date: string) {
  const [y, m] = date.split("-").map(Number);
  const label = new Date(Date.UTC(y!, m! - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { label, key: `${y}-${String(m).padStart(2, "0")}`, start: `${y}-${String(m).padStart(2, "0")}-01` };
}

/** Monthly spend per ticket bonus steps above the target. Bartender tickets are smaller, so their steps are too. */
export function bonusSteps(role: string) {
  return role === "bartender" ? [5, 10] : [12, 25];
}

/** Monthly spend per ticket bonus tiers relative to the person's target. */
export function adsBonus(spt: number, target: number, role = "server") {
  const [a, b] = bonusSteps(role);
  if (spt >= target + b!) return 250;
  if (spt >= target + a!) return 200;
  if (spt >= target) return 150;
  return 0;
}
