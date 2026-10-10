// Implementation Studio plumbing: the standard copy, the drafting queue and the publish step.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { insertChunked, replaceTemplates } from "./core";
import { adaptItem, createItem, type DraftContext } from "./studio-ai";
import { STANDARD_LIBRARY, type Library } from "../../shared/library/standard";
import { SCHEMA_BY_TYPE, type ContentType } from "../../shared/library/schemas";
import type { Module, Quiz, Rubric } from "../../shared/program";
import type { Reward } from "../../shared/library/rewards";

type Item = typeof s.contentItems.$inferSelect;

export const EMPTY_BRIEF: s.StudioBrief = { findings: "", priorities: [], preferences: "", reputation: "", standards: "", storeTargets: [] };

/** Every client starts from a full copy of the BLM standard program. */
export function standardRows(implId: string) {
  const L = STANDARD_LIBRARY;
  const row = (type: ContentType, slug: string, title: string, data: unknown) => ({ implId, type, slug, title, data, origin: "standard" as const });
  return [
    ...L.modules.map((m) => row("module", m.slug, `${m.n}. ${m.title}`, m)),
    ...L.quizzes.map((q) => row("quiz", q.slug, q.title, q)),
    ...L.rubrics.map((r) => row("rubric", r.slug, r.title, r)),
    ...L.rewards.map((r) => row("reward", r.key, r.title, r)),
    row("checklist", "opening", "Opening checklist", { type: "opening", lines: L.checklists.opening }),
    row("checklist", "closing", "Closing checklist", { type: "closing", lines: L.checklists.closing }),
    row("talking_points", "line-up", "Line up talking points", { points: L.talkingPoints }),
  ];
}

export async function copyStandard(implId: string) {
  await insertChunked(s.contentItems, standardRows(implId), 20);
}

export function standardFor(type: ContentType, slug: string) {
  return standardRows("").find((r) => r.type === type && r.slug === slug)?.data ?? null;
}

export function titleOf(type: ContentType, data: Record<string, unknown>) {
  if (type === "module") return `${data.n}. ${data.title}`;
  if (type === "checklist") return data.type === "closing" ? "Closing checklist" : "Opening checklist";
  if (type === "talking_points") return "Line up talking points";
  return String(data.title ?? "Untitled");
}

export async function draftContext(impl: typeof s.implementations.$inferSelect): Promise<DraftContext> {
  const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, impl.orgId));
  const [sources, items] = await Promise.all([
    db.select().from(s.studioSources).where(eq(s.studioSources.implId, impl.id)),
    db.select().from(s.contentItems).where(eq(s.contentItems.implId, impl.id)),
  ]);
  const live = items.filter((i) => i.status !== "excluded");
  return {
    orgName: org?.name ?? "The restaurant",
    brief: impl.brief,
    sources: sources.filter((x) => x.text.trim()).map((x) => ({ kind: x.kind, title: x.title, text: x.text })),
    modules: live
      .filter((i) => i.type === "module")
      .map((i) => {
        const m = i.data as Module;
        return { slug: m.slug, n: m.n, title: m.title };
      })
      .sort((a, b) => a.n - b.n),
    quizzes: live.filter((i) => i.type === "quiz").map((i) => i.slug),
    rubrics: live.filter((i) => i.type === "rubric").map((i) => i.slug),
  };
}

/** Keep identity fields stable on a rewrite, whatever the model returned. */
function pin(type: ContentType, item: Item, data: Record<string, unknown>) {
  const prev = item.data as Record<string, unknown>;
  if (type === "reward") data.key = prev.key;
  else if (type === "checklist") data.type = prev.type;
  else if (type !== "talking_points") data.slug = item.slug;
  if (type === "quiz") {
    const qs = (data.questions as { id: string }[]) ?? [];
    const seen = new Set<string>();
    qs.forEach((q, i) => {
      let id = q.id?.startsWith(item.slug) ? q.id : `${item.slug}-${i + 1}`;
      while (seen.has(id)) id = `${id}x`;
      seen.add(id);
      q.id = id;
    });
  }
  return data;
}

const running = new Set<string>();

/** Work through queued drafts in the background, a few at a time. Safe to call repeatedly. */
export function kickQueue(implId: string) {
  if (running.has(implId)) return;
  running.add(implId);
  void (async () => {
    try {
      for (;;) {
        const batch = await db
          .select()
          .from(s.contentItems)
          .where(and(eq(s.contentItems.implId, implId), eq(s.contentItems.aiState, "queued")))
          .limit(3);
        if (!batch.length) break;
        const [impl] = await db.select().from(s.implementations).where(eq(s.implementations.id, implId));
        if (!impl) break;
        const ctx = await draftContext(impl);
        await Promise.all(batch.map((it) => draftOne(it, ctx)));
      }
    } finally {
      running.delete(implId);
    }
  })();
}

async function draftOne(it: Item, ctx: DraftContext) {
  await db.update(s.contentItems).set({ aiState: "working", aiError: null }).where(eq(s.contentItems.id, it.id));
  try {
    const instructions = it.ask;
    const type = it.type as ContentType;
    const out = await adaptItem(type, it.data, ctx, instructions);
    const data = pin(type, it, out.item);
    const parsed = SCHEMA_BY_TYPE[type].safeParse(data);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "The draft did not fit the format.");
    await db
      .update(s.contentItems)
      .set({ data: parsed.data, title: titleOf(type, parsed.data as Record<string, unknown>), origin: "ai", status: "draft", note: out.note, aiState: "idle", approvedByName: null, updatedAt: new Date() })
      .where(eq(s.contentItems.id, it.id));
  } catch (e) {
    await db
      .update(s.contentItems)
      .set({ aiState: "failed", aiError: e instanceof Error ? e.message.slice(0, 400) : "Drafting failed." })
      .where(eq(s.contentItems.id, it.id));
  }
}

/** Write a new item straight away (one call, the reviewer waits for it). */
export async function draftNew(impl: typeof s.implementations.$inferSelect, type: ContentType, instructions: string) {
  const ctx = await draftContext(impl);
  const out = await createItem(type, ctx, instructions);
  const taken = new Set(
    (await db.select({ slug: s.contentItems.slug }).from(s.contentItems).where(and(eq(s.contentItems.implId, impl.id), eq(s.contentItems.type, type)))).map((r) => r.slug),
  );
  const data = out.item;
  let slug = String(data.slug ?? data.key ?? `${type}-new`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `${type}-new`;
  while (taken.has(slug)) slug = `${slug}-2`;
  if (type !== "reward" && type !== "checklist" && type !== "talking_points") data.slug = slug;
  if (type === "quiz") (data.questions as { id: string }[]).forEach((q, i) => (q.id = `${slug}-${i + 1}`));
  const parsed = SCHEMA_BY_TYPE[type].safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "The draft did not fit the format.");
  const id = crypto.randomUUID();
  await db.insert(s.contentItems).values({
    id,
    implId: impl.id,
    type,
    slug,
    title: titleOf(type, parsed.data as Record<string, unknown>),
    data: parsed.data,
    origin: "ai",
    status: "draft",
    note: out.note,
  });
  return id;
}

/** Approved items, compiled into the program the client's platform runs on. */
export function compile(items: Item[], label: string, version: number) {
  const ok = items.filter((i) => i.status === "approved");
  const of = <T>(t: ContentType) => ok.filter((i) => i.type === t).map((i) => structuredClone(i.data) as T);
  const quizzes = of<Quiz>("quiz");
  const rubrics = of<Rubric>("rubric");
  const quizSlugs = new Set(quizzes.map((q) => q.slug));
  const rubricSlugs = new Set(rubrics.map((r) => r.slug));
  const modules = of<Module>("module")
    .sort((a, b) => a.n - b.n)
    .map((m) => ({ ...m, quiz: m.quiz && quizSlugs.has(m.quiz) ? m.quiz : undefined, rubric: m.rubric && rubricSlugs.has(m.rubric) ? m.rubric : undefined }));
  const moduleSlugs = new Set(modules.map((m) => m.slug));
  const lists = of<{ type: "opening" | "closing"; lines: { area: string; title: string }[] }>("checklist");
  const points = of<{ points: { text: string; tag: string }[] }>("talking_points").flatMap((p) => p.points);
  const warnings: string[] = [];
  if (!modules.length) warnings.push("No modules approved. Staff would have nothing to train on.");
  for (const r of rubrics) if (!moduleSlugs.has(r.module)) warnings.push(`${r.title} points at a module that is not in the program.`);
  const lib: Library = {
    version,
    label,
    modules,
    quizzes: quizzes.map((q) => ({ ...q, module: q.module && moduleSlugs.has(q.module) ? q.module : undefined })),
    rubrics,
    rewards: of<Reward>("reward").sort((a, b) => a.n - b.n),
    checklists: {
      opening: lists.find((l) => l.type === "opening")?.lines ?? STANDARD_LIBRARY.checklists.opening,
      closing: lists.find((l) => l.type === "closing")?.lines ?? STANDARD_LIBRARY.checklists.closing,
    },
    talkingPoints: points.length ? points : STANDARD_LIBRARY.talkingPoints,
  };
  return { lib, warnings, counts: { modules: modules.length, quizzes: quizzes.length, rubrics: rubrics.length, rewards: lib.rewards.length } };
}

export async function publish(impl: typeof s.implementations.$inferSelect, byName: string) {
  const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, impl.orgId));
  const items = await db.select().from(s.contentItems).where(eq(s.contentItems.implId, impl.id));
  const [prev] = await db.select({ version: s.orgPrograms.version }).from(s.orgPrograms).where(eq(s.orgPrograms.orgId, impl.orgId));
  const version = (prev?.version ?? 0) + 1;
  const { lib, warnings, counts } = compile(items, `The ${org?.name ?? "house"} program`, version);
  if (!lib.modules.length) throw new Error(warnings[0]);
  const row = { orgId: impl.orgId, version, data: lib, publishedAt: new Date(), publishedByName: byName };
  if (prev) await db.update(s.orgPrograms).set(row).where(eq(s.orgPrograms.orgId, impl.orgId));
  else await db.insert(s.orgPrograms).values(row);

  const stores = await db.select().from(s.stores).where(eq(s.stores.orgId, impl.orgId));
  const checklistsApproved = items.some((i) => i.type === "checklist" && i.status === "approved");
  for (const st of stores) {
    if (checklistsApproved) await replaceTemplates(st.id, lib.checklists);
    const t = impl.brief.storeTargets.find((x) => x.storeId === st.id);
    if (t && t.ticketTarget > 0 && t.ticketTarget !== st.ticketTarget) await db.update(s.stores).set({ ticketTarget: t.ticketTarget }).where(eq(s.stores.id, st.id));
  }
  await db.update(s.implementations).set({ status: "published", updatedAt: new Date() }).where(eq(s.implementations.id, impl.id));
  return { version, warnings, counts };
}

export async function itemsByIds(implId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(s.contentItems).where(and(eq(s.contentItems.implId, implId), inArray(s.contentItems.id, ids)));
}
