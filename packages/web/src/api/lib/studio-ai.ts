// The Studio's writer: turns a client's handed-over material and the audit brief into their program.
// Every output is a draft. BLM reviews and approves before anything reaches the client.
import { createGateway, generateText, NoObjectGeneratedError, Output } from "ai";
import dedent from "dedent";
import { z } from "zod";
import { SCHEMA_BY_TYPE, type ContentType } from "../../shared/library/schemas";
import type { StudioBrief } from "../database/schema";

const gateway = createGateway({
  baseURL: process.env.AI_GATEWAY_BASE_URL,
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
const MODEL = "anthropic/claude-sonnet-5";

export type SourceDoc = { kind: string; title: string; text: string };
export type DraftContext = {
  orgName: string;
  brief: StudioBrief;
  sources: SourceDoc[];
  /** Slugs that already exist, so references stay valid. */
  modules: { slug: string; n: number; title: string }[];
  quizzes: string[];
  rubrics: string[];
};

const VOICE = dedent`
  You write for Bottom Line Multiplied (BLM), a fine dining consultancy that installs a training and operating
  program in each client restaurant. The program is front of house only: servers, bartenders, sommeliers, hosts,
  bussers, food runners, barbacks and expo.

  House style:
  - Warm, exact, confident. Short sentences. Written to a colleague, never to a customer.
  - Never use em dashes, en dashes or hyphens anywhere in the copy. Rewrite compound words as two words or one
    ("follow up", "upsell", "pre shift"). Use commas, full stops or colons instead of dashes.
  - US spelling and dollar prices.
  - Spend per ticket (net sales divided by tickets) is the money metric. Never write PPA, ADS, average check or
    spend per guest.

  Facts:
  - Use the restaurant's own menu items, wines, cocktails, prices, steps of service and protocols from the
    material provided. Quote names and prices exactly as they appear.
  - Never invent a dish, wine, producer, vintage, price or rule that is not in the material. When the material
    does not cover something the standard program covers, keep the standard wording and say so in the note.
`;

const KIND_FOCUS: Record<ContentType, string[]> = {
  module: ["menu", "wine", "bar", "steps_of_service", "standards", "protocols", "pos", "other"],
  quiz: ["menu", "wine", "bar", "steps_of_service", "standards", "protocols", "pos", "other"],
  rubric: ["steps_of_service", "standards", "protocols", "other"],
  reward: ["standards", "other"],
  checklist: ["protocols", "standards", "other"],
  talking_points: ["menu", "wine", "bar", "steps_of_service", "standards", "other"],
};

/** Material in priority order for this kind of content, kept inside a sensible context budget. */
function materialFor(type: ContentType, sources: SourceDoc[], budget = 90_000) {
  const order = KIND_FOCUS[type];
  const sorted = [...sources].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let left = budget;
  const parts: string[] = [];
  for (const src of sorted) {
    if (left <= 0) break;
    const body = src.text.slice(0, left);
    left -= body.length;
    parts.push(`### ${src.title} (${src.kind.replace(/_/g, " ")})\n${body}`);
  }
  return parts.length ? parts.join("\n\n") : "No material has been handed over yet.";
}

function briefText(ctx: DraftContext) {
  const b = ctx.brief;
  const pr = b.priorities.length
    ? b.priorities.map((p, i) => `${i + 1}. [${p.weight}] ${p.title}${p.detail ? `: ${p.detail}` : ""}`).join("\n")
    : "None recorded yet.";
  return dedent`
    Restaurant group: ${ctx.orgName}

    Audit findings:
    ${b.findings || "Not recorded yet."}

    Priorities from the audit, most important first:
    ${pr}

    Owner preferences:
    ${b.preferences || "None recorded."}

    Reputation the owner wants:
    ${b.reputation || "None recorded."}

    House standards the owner insists on:
    ${b.standards || "None recorded."}
  `;
}

const TYPE_RULES: Record<ContentType, string> = {
  module: dedent`
    A training module. Keep the slug, n, roles, quiz and rubric references unless told otherwise.
    Sections are short: a heading, then prose, a list, a table (menus and wine lists go in tables with the same
    number of cells in every row as the head), a line to say word for word, or a note. Swap the standard
    examples for this restaurant's real dishes, wines, cocktails and standards.
  `,
  quiz: dedent`
    A multiple choice knowledge check. 6 to 12 questions, 3 or 4 choices each, exactly one right answer
    (answer is the zero based index), and a one sentence why. Questions test what a guest would actually ask
    or what a manager would actually check. Spread the right answer position. Question ids are unique and
    start with the quiz slug. A POS knowledge check (kind "pos") tests the restaurant's own POS: ringing in,
    modifiers, allergies on the seat, splits, comps and voids with manager codes, transfers, closing out.
  `,
  rubric: dedent`
    A graded floor exercise (kind "floor", graded on a live table turn) or a skills check (kind "skill").
    4 to 8 criteria, each with a key (snake case), a short label and "look", what a 5 star version looks like on
    the floor, specific enough that two graders would agree. If the exercise should be repeated after sign off,
    set repeat to "weekly" or "monthly".
  `,
  reward: dedent`
    One of the eight BLM incentives. Keep the key. Tailor the title, value and rule to the owner's preferences
    and budget. Rules are measurable from the platform's data.
  `,
  checklist: dedent`
    An opening or closing checklist for the front of house. Keep the type. Each line has an area (Floor, Bar,
    Host stand, Service station, Restrooms, Safety, Cash, Manager) and a concrete title that a manager can
    verify by looking. Fold in the restaurant's own protocols (allergies, cash, comps, voids, alarms).
  `,
  talking_points: dedent`
    Line up talking points: one sentence each, tagged (Spend per ticket, Steps of service, Standards, Allergies,
    Guest recovery, Comps and voids, Team, Reputation, Menu, Wine). Tie at least half to the audit priorities.
    20 to 40 points.
  `,
};

/** Models sometimes return a nested value as a JSON string. Undo that before validating. */
function unwrap(v: unknown): unknown {
  if (typeof v === "string") {
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return unwrap(JSON.parse(t));
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(unwrap);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)]));
  return v;
}

/** Structured output with one repair pass and one retry. */
async function structured<S extends z.ZodTypeAny>(schema: S, args: { system?: string; prompt: string }): Promise<z.infer<S>> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({ model: gateway(MODEL), ...args, output: Output.object({ schema }) });
      return output as z.infer<S>;
    } catch (e) {
      last = e;
      if (!NoObjectGeneratedError.isInstance(e) || !e.text) throw e;
      try {
        let raw = unwrap(JSON.parse(e.text)) as Record<string, unknown>;
        // A whole answer wrapped in its own top level key: {"priorities": {"priorities": [...]}}
        const keys = Object.keys(raw);
        if (keys.length === 1 && raw[keys[0]!] && typeof raw[keys[0]!] === "object" && !Array.isArray(raw[keys[0]!]) && keys[0]! in (raw[keys[0]!] as object))
          raw = raw[keys[0]!] as Record<string, unknown>;
        const fixed = schema.safeParse(raw);
        if (fixed.success) return fixed.data as z.infer<S>;
      } catch {
        // fall through to the retry
      }
    }
  }
  throw last;
}

/** Replace any dash that slipped through. */
function clean<T>(v: T): T {
  if (typeof v === "string") return v.replace(/\s*[—–]\s*/g, ", ").replace(/\s-\s/g, ", ") as T;
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as T;
  return v;
}

/** Models put the right answer in the same slot every time. Shuffle the choices so the answer key is not a pattern. */
function shuffleAnswers(type: ContentType, item: Record<string, unknown>) {
  if (type !== "quiz" || !Array.isArray(item.questions)) return item;
  const questions = (item.questions as Record<string, unknown>[]).map((q) => {
    const choices = q.choices as unknown[];
    const answer = q.answer as number;
    if (!Array.isArray(choices) || typeof answer !== "number" || choices.length <= 2) return q;
    if (choices.some((c) => typeof c === "string" && /of the above/i.test(c))) return q;
    const order = choices.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, choices: order.map((i) => choices[i]), answer: order.indexOf(answer) };
  });
  return { ...item, questions };
}

function refs(ctx: DraftContext) {
  return dedent`
    Modules in this program (slug, number, title):
    ${ctx.modules.map((m) => `${m.slug} | ${m.n} | ${m.title}`).join("\n")}
    Quiz slugs: ${ctx.quizzes.join(", ")}
    Floor exercise and skills check slugs: ${ctx.rubrics.join(", ")}
  `;
}

/** Rewrite one standard item for this client. */
export async function adaptItem(type: ContentType, current: unknown, ctx: DraftContext, instructions: string) {
  const schema = SCHEMA_BY_TYPE[type] as z.ZodTypeAny;
  const output = await structured(
    z.object({
      item: schema,
      note: z.string().default("").describe("Two or three sentences for the BLM reviewer: what changed, and anything the material did not cover."),
    }),
    {
    system: VOICE,
    prompt: dedent`
      ${briefText(ctx)}

      ${refs(ctx)}

      What to produce: ${TYPE_RULES[type]}

      Here is the current version (from the BLM standard program or an earlier draft). Rewrite it for this restaurant.
      ${JSON.stringify(current)}

      ${instructions ? `Instructions from the BLM reviewer, follow these first:\n${instructions}` : ""}

      The restaurant's material:
      ${materialFor(type, ctx.sources)}
    `,
  });
  return { item: shuffleAnswers(type, clean(output.item) as Record<string, unknown>), note: clean(output.note) };
}

/** Write a brand new item: an extra quiz, a POS check, a repeatable drill, a module for their wine list. */
export async function createItem(type: ContentType, ctx: DraftContext, instructions: string) {
  const schema = SCHEMA_BY_TYPE[type] as z.ZodTypeAny;
  const output = await structured(
    z.object({
      item: schema,
      note: z.string().default("").describe("Two or three sentences for the BLM reviewer about what this covers and any gaps in the material."),
    }),
    {
    system: VOICE,
    prompt: dedent`
      ${briefText(ctx)}

      ${refs(ctx)}

      What to produce: ${TYPE_RULES[type]}
      This is a new item. Give it a new slug (lowercase words joined by hyphens are fine for slugs only, which are never shown).
      ${type === "module" ? `Number it ${Math.max(0, ...ctx.modules.map((m) => m.n)) + 1}.` : ""}

      What BLM asked for:
      ${instructions}

      The restaurant's material:
      ${materialFor(type, ctx.sources)}
    `,
  });
  return { item: shuffleAnswers(type, clean(output.item) as Record<string, unknown>), note: clean(output.note) };
}

/** A PDF or photo of a menu, wine list or manual, turned into clean text the drafts can quote from. */
export async function transcribe(file: { data: Buffer; mediaType: string; name: string }) {
  const { text } = await generateText({
    model: gateway(MODEL),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: dedent`
              Transcribe this restaurant document (${file.name}) into clean text. Keep every item name, description,
              price, producer, region, vintage, size, spec, step and rule exactly as written. Use markdown headings
              for sections and markdown tables for menus, wine lists and cocktail specs. Do not summarise, do not add
              anything, do not comment.
            `,
          },
          { type: "file", data: file.data, mediaType: file.mediaType },
        ],
      },
    ],
  });
  return text.trim();
}

/** Turn the audit notes into a ranked list of priorities. */
export async function suggestPriorities(findings: string, preferences: string) {
  const output = await structured(
    z.object({
      priorities: z
        .array(z.object({ title: z.string().max(160), detail: z.string().max(600).describe("One or two sentences"), weight: z.enum(["high", "medium", "low"]) }))
        .min(3)
        .max(8),
    }),
    {
    system: VOICE,
    prompt: dedent`
      From these audit findings and owner preferences, write the priorities the program should push hardest,
      most important first. Each title is a short instruction ("Sell the bottle at tables of three or more").

      Audit findings:
      ${findings}

      Owner preferences:
      ${preferences || "None recorded."}
    `,
  });
  return clean(output.priorities);
}
