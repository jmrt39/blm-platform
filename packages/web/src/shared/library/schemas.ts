// Validation for program content. Used by the Studio editors, the AI drafts and the publish step.
import { z } from "zod";

export const ROLE_KEYS = ["server", "bartender", "sommelier", "host", "busser", "food_runner", "barback", "expo"] as const;
export const MODULE_CATEGORIES = ["House", "Service", "Menu", "Wine & bar", "Standards"] as const;

export const sectionSchema = z.object({
  h: z.string().min(1).max(160).describe("Section heading"),
  p: z.string().max(4000).optional().describe("A paragraph of plain prose"),
  list: z.array(z.string().max(600)).max(40).optional().describe("Bullet points"),
  table: z
    .object({ head: z.array(z.string().max(80)).min(1).max(6), rows: z.array(z.array(z.string().max(300)).max(6)).max(80) })
    .optional()
    .describe("A table, for menus, wine lists and specs. Every row has the same number of cells as head."),
  say: z.string().max(600).optional().describe("A line staff should say word for word"),
  note: z.string().max(600).optional().describe("A short standard or warning"),
});

export const moduleSchema = z.object({
  slug: z.string().min(2).max(80),
  n: z.number().int().min(1).max(99),
  title: z.string().min(2).max(120),
  category: z.enum(MODULE_CATEGORIES),
  summary: z.string().min(2).max(600),
  minutes: z.number().int().min(1).max(120),
  roles: z.array(z.enum(ROLE_KEYS)).min(1),
  manual: z.string().max(120),
  sections: z.array(sectionSchema).min(1).max(30),
  quiz: z.string().max(80).optional(),
  rubric: z.string().max(80).optional(),
});

export const questionSchema = z.object({
  id: z.string().min(1).max(100),
  q: z.string().min(3).max(600),
  choices: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0).max(5),
  why: z.string().max(600),
});

export const quizSchema = z.object({
  slug: z.string().min(2).max(80),
  title: z.string().min(2).max(120),
  module: z.string().max(80).optional(),
  level: z.enum(["Core", "Advanced"]),
  kind: z.enum(["knowledge", "pos"]).optional(),
  questions: z.array(questionSchema).min(1).max(30),
});

export const rubricSchema = z.object({
  slug: z.string().min(2).max(80),
  title: z.string().min(2).max(120),
  kind: z.enum(["floor", "skill"]),
  summary: z.string().max(600),
  module: z.string().max(80),
  roles: z.array(z.enum(ROLE_KEYS)).min(1),
  criteria: z.array(z.object({ key: z.string().min(1).max(60), label: z.string().min(1).max(120), look: z.string().max(600) })).min(2).max(12),
  repeat: z.enum(["weekly", "monthly"]).optional(),
});

export const rewardSchema = z.object({
  key: z.enum(["day_off", "guest_quote", "ads_bonus", "first_pick", "chefs_table", "certification", "peer_dinner", "winery_visit"]),
  n: z.number().int(),
  title: z.string().min(2).max(120),
  value: z.string().max(200),
  cadence: z.enum(["Quarterly", "Each shift", "Monthly", "Annual"]),
  rule: z.string().max(600),
});

export const checklistSchema = z.object({
  type: z.enum(["opening", "closing"]),
  lines: z.array(z.object({ area: z.string().min(1).max(60), title: z.string().min(2).max(240) })).min(1).max(80),
});

export const talkingPointsSchema = z.object({
  points: z.array(z.object({ text: z.string().min(3).max(400), tag: z.string().max(60) })).min(1).max(120),
});

export const CONTENT_TYPES = ["module", "quiz", "rubric", "reward", "checklist", "talking_points"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SCHEMA_BY_TYPE = {
  module: moduleSchema,
  quiz: quizSchema,
  rubric: rubricSchema,
  reward: rewardSchema,
  checklist: checklistSchema,
  talking_points: talkingPointsSchema,
} as const;

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  module: "Training modules",
  quiz: "Quizzes and POS checks",
  rubric: "Floor exercises and skills checks",
  reward: "Rewards and incentives",
  checklist: "Opening and closing checklists",
  talking_points: "Line up talking points",
};
