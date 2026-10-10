// Implementation Studio. BLM staff only: collect a client's material and turn it into their program.
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { base } from "../__core/app";
import { auth } from "../auth";
import { db } from "../database";
import * as s from "../database/schema";
import { randomDigits, uniqueStoreNumber } from "../lib/access";
import { seedTemplates } from "../lib/core";
import { historyCoverage } from "../lib/history";
import { compile, copyStandard, draftNew, EMPTY_BRIEF, kickQueue, publish, standardFor, titleOf } from "../lib/studio";
import { suggestPriorities, transcribe } from "../lib/studio-ai";
import { CONTENT_TYPES, SCHEMA_BY_TYPE, type ContentType } from "../../shared/library/schemas";
import { DEFAULT_TICKET_TARGET } from "../../shared/metrics";

const userBase = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Sign in first." });
  return next({ context: { user: session.user } });
});

const studioBase = userBase.use(async ({ context, next }) => {
  const [staff] = await db.select().from(s.studioStaff).where(eq(s.studioStaff.userId, context.user.id));
  if (!staff) throw new ORPCError("FORBIDDEN", { message: "The Studio is for BLM staff." });
  return next({ context: { staff } });
});

async function implFor(orgId: string) {
  const [impl] = await db.select().from(s.implementations).where(eq(s.implementations.orgId, orgId));
  if (!impl) throw new ORPCError("NOT_FOUND", { message: "No build started for this client." });
  return impl;
}

async function itemIn(id: string) {
  const [it] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, id));
  if (!it) throw new ORPCError("NOT_FOUND", { message: "Item not found." });
  return it;
}

const touch = (implId: string) => db.update(s.implementations).set({ updatedAt: new Date() }).where(eq(s.implementations.id, implId));

const briefSchema = z.object({
  findings: z.string().max(20000),
  priorities: z.array(z.object({ title: z.string().min(1).max(160), detail: z.string().max(600), weight: z.enum(["high", "medium", "low"]) })).max(12),
  preferences: z.string().max(8000),
  reputation: z.string().max(8000),
  standards: z.string().max(8000),
  storeTargets: z.array(z.object({ storeId: z.string(), ticketTarget: z.number().min(0).max(2000) })).max(60),
});

const SOURCE_KINDS = ["menu", "wine", "bar", "steps_of_service", "standards", "protocols", "pos", "other"] as const;
const MAX_FILE = 8 * 1024 * 1024;

export const studio = {
  /** Whether this account can open the Studio. */
  me: base.handler(async ({ context }) => {
    const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
    if (!session) return { signedIn: false, staff: false, name: null as string | null };
    const [staff] = await db.select().from(s.studioStaff).where(eq(s.studioStaff.userId, session.user.id));
    return { signedIn: true, staff: !!staff, name: session.user.name };
  }),

  /** Enter the BLM studio code once; the account stays unlocked. */
  unlock: userBase.input(z.object({ code: z.string().min(1).max(100) })).handler(async ({ input, context }) => {
    const want = process.env.BLM_STUDIO_CODE;
    if (!want) throw new ORPCError("PRECONDITION_FAILED", { message: "The studio code has not been set up yet." });
    if (input.code.trim() !== want) throw new ORPCError("UNAUTHORIZED", { message: "That code isn't right." });
    const [have] = await db.select().from(s.studioStaff).where(eq(s.studioStaff.userId, context.user.id));
    if (!have) await db.insert(s.studioStaff).values({ userId: context.user.id, name: context.user.name, email: context.user.email.toLowerCase() });
    return { ok: true };
  }),

  /** Every client group, and where their build stands. */
  clients: studioBase.handler(async () => {
    const [orgs, impls, programs, stores, owners] = await Promise.all([
      db.select().from(s.orgs).orderBy(desc(s.orgs.createdAt)),
      db.select().from(s.implementations),
      db.select({ orgId: s.orgPrograms.orgId, version: s.orgPrograms.version, publishedAt: s.orgPrograms.publishedAt }).from(s.orgPrograms),
      db.select({ orgId: s.stores.orgId, n: count() }).from(s.stores).groupBy(s.stores.orgId),
      db.select({ orgId: s.orgAccess.orgId, name: s.orgAccess.name, email: s.orgAccess.email }).from(s.orgAccess).where(eq(s.orgAccess.role, "owner")),
    ]);
    const counts = impls.length
      ? await db
          .select({ implId: s.contentItems.implId, status: s.contentItems.status, n: count() })
          .from(s.contentItems)
          .where(inArray(s.contentItems.implId, impls.map((i) => i.id)))
          .groupBy(s.contentItems.implId, s.contentItems.status)
      : [];
    // Demo groups are spun up per visitor; only the newest one is worth showing.
    const demo = orgs.find((o) => o.isDemo);
    return orgs
      .filter((o) => !o.isDemo || o.id === demo?.id || impls.some((i) => i.orgId === o.id))
      .map((o) => {
        const impl = impls.find((i) => i.orgId === o.id);
        const c = counts.filter((x) => x.implId === impl?.id);
        const p = programs.find((x) => x.orgId === o.id);
        const owner = owners.find((x) => x.orgId === o.id);
        return {
          orgId: o.id,
          name: o.name,
          isDemo: o.isDemo,
          stores: stores.find((x) => x.orgId === o.id)?.n ?? 0,
          owner: owner ? { name: owner.name, email: owner.email } : null,
          build: impl
            ? {
                updatedAt: impl.updatedAt.getTime(),
                approved: c.find((x) => x.status === "approved")?.n ?? 0,
                total: c.filter((x) => x.status !== "excluded").reduce((a, x) => a + x.n, 0),
              }
            : null,
          program: p ? { version: p.version, publishedAt: p.publishedAt.getTime() } : null,
        };
      });
  }),

  /** A new client: their group, owner invite, stores, and a fresh copy of the standard program. */
  createClient: studioBase
    .input(
      z.object({
        groupName: z.string().min(2).max(80),
        ownerName: z.string().min(2).max(80),
        ownerEmail: z.string().email().max(120),
        stores: z.array(z.object({ name: z.string().min(2).max(80), city: z.string().max(80).default(""), ticketTarget: z.number().min(10).max(2000).default(DEFAULT_TICKET_TARGET) })).min(1).max(40),
      }),
    )
    .handler(async ({ input, context }) => {
      const orgId = crypto.randomUUID();
      await db.insert(s.orgs).values({ id: orgId, name: input.groupName });
      await db.insert(s.orgAccess).values({ orgId, email: input.ownerEmail.toLowerCase(), name: input.ownerName, role: "owner" });
      const made: { id: string; name: string; number: string; pin: string }[] = [];
      for (const st of input.stores) {
        const id = crypto.randomUUID();
        const number = await uniqueStoreNumber();
        const pin = randomDigits(4);
        await db.insert(s.stores).values({ id, orgId, number, pin, name: st.name, city: st.city, ticketTarget: st.ticketTarget });
        await seedTemplates(id);
        made.push({ id, name: st.name, number, pin });
      }
      const implId = crypto.randomUUID();
      await db.insert(s.implementations).values({
        id: implId,
        orgId,
        brief: { ...EMPTY_BRIEF, storeTargets: made.map((m, i) => ({ storeId: m.id, ticketTarget: input.stores[i]!.ticketTarget })) },
        createdByName: context.staff.name,
      });
      await copyStandard(implId);
      return { orgId, stores: made };
    }),

  /** Start a build for a group that signed up on its own. */
  start: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input, context }) => {
    const [have] = await db.select().from(s.implementations).where(eq(s.implementations.orgId, input.orgId));
    if (have) return { implId: have.id };
    const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, input.orgId));
    if (!org) throw new ORPCError("NOT_FOUND");
    const stores = await db.select().from(s.stores).where(eq(s.stores.orgId, org.id));
    const implId = crypto.randomUUID();
    await db.insert(s.implementations).values({
      id: implId,
      orgId: org.id,
      brief: { ...EMPTY_BRIEF, storeTargets: stores.map((x) => ({ storeId: x.id, ticketTarget: x.ticketTarget })) },
      createdByName: context.staff.name,
    });
    await copyStandard(implId);
    return { implId };
  }),

  /** Everything on one client's build. */
  get: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input }) => {
    const impl = await implFor(input.orgId);
    const [org] = await db.select().from(s.orgs).where(eq(s.orgs.id, input.orgId));
    const [stores, sources, items, [program], owners] = await Promise.all([
      db.select().from(s.stores).where(eq(s.stores.orgId, input.orgId)),
      db.select().from(s.studioSources).where(eq(s.studioSources.implId, impl.id)).orderBy(desc(s.studioSources.createdAt)),
      db.select().from(s.contentItems).where(eq(s.contentItems.implId, impl.id)),
      db.select().from(s.orgPrograms).where(eq(s.orgPrograms.orgId, input.orgId)),
      db.select().from(s.orgAccess).where(and(eq(s.orgAccess.orgId, input.orgId), eq(s.orgAccess.role, "owner"))),
    ]);
    stores.sort((a, b) => a.name.localeCompare(b.name));
    const cov = await historyCoverage(stores.map((x) => x.id));
    const order = (t: string) => CONTENT_TYPES.indexOf(t as ContentType);
    const nOf = (i: (typeof items)[number]) => (i.type === "module" ? Number((i.data as { n?: number }).n ?? 0) : 0);
    items.sort((a, b) => order(a.type) - order(b.type) || nOf(a) - nOf(b) || a.title.localeCompare(b.title));
    const { warnings, counts } = compile(items, "", 0);
    return {
      org: { id: org!.id, name: org!.name, isDemo: org!.isDemo },
      owners: owners.map((o) => ({ name: o.name, email: o.email, linked: !!o.userId })),
      impl: { id: impl.id, brief: impl.brief, createdByName: impl.createdByName, updatedAt: impl.updatedAt.getTime() },
      stores: stores.map((x) => ({ id: x.id, name: x.name, city: x.city, number: x.number, ticketTarget: x.ticketTarget, history: cov.get(x.id)! })),
      sources: sources.map((x) => ({ id: x.id, kind: x.kind, title: x.title, fileName: x.fileName, chars: x.text.length, preview: x.text.slice(0, 280), createdAt: x.createdAt.getTime() })),
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        slug: i.slug,
        title: i.title,
        origin: i.origin,
        status: i.status,
        note: i.note,
        ask: i.ask,
        aiState: i.aiState,
        aiError: i.aiError,
        approvedByName: i.approvedByName,
        updatedAt: i.updatedAt.getTime(),
        /** The standard program was written for the 1906 demo house. Flag anything that still names it. */
        foreign: !org!.isDemo && /\b1906\b/.test(JSON.stringify(i.data)),
        kind: i.type === "quiz" ? ((i.data as { kind?: string }).kind ?? "knowledge") : i.type === "rubric" ? (i.data as { kind?: string }).kind : null,
        repeat: i.type === "rubric" ? ((i.data as { repeat?: string }).repeat ?? null) : null,
        size:
          i.type === "quiz"
            ? ((i.data as { questions?: unknown[] }).questions?.length ?? 0)
            : i.type === "module"
              ? ((i.data as { sections?: unknown[] }).sections?.length ?? 0)
              : i.type === "rubric"
                ? ((i.data as { criteria?: unknown[] }).criteria?.length ?? 0)
                : i.type === "checklist"
                  ? ((i.data as { lines?: unknown[] }).lines?.length ?? 0)
                  : i.type === "talking_points"
                    ? ((i.data as { points?: unknown[] }).points?.length ?? 0)
                    : 0,
      })),
      program: program ? { version: program.version, publishedAt: program.publishedAt.getTime(), publishedByName: program.publishedByName } : null,
      preview: { warnings, counts },
      busy: items.some((i) => i.aiState === "queued" || i.aiState === "working"),
    };
  }),

  saveBrief: studioBase.input(z.object({ orgId: z.string(), brief: briefSchema })).handler(async ({ input }) => {
    const impl = await implFor(input.orgId);
    await db.update(s.implementations).set({ brief: input.brief, updatedAt: new Date() }).where(eq(s.implementations.id, impl.id));
    return { ok: true };
  }),

  /** Draft the priorities list from the audit findings. Nothing is saved until BLM saves the brief. */
  suggestPriorities: studioBase.input(z.object({ findings: z.string().min(20).max(20000), preferences: z.string().max(8000).default("") })).handler(async ({ input }) => {
    try {
      return await suggestPriorities(input.findings, input.preferences);
    } catch (e) {
      console.error("studio.suggestPriorities", e);
      throw new ORPCError("BAD_GATEWAY", { message: "The AI could not read those findings this time. Try again, or write the priorities yourself." });
    }
  }),

  /** Material from the client: pasted text, or a PDF or photo the AI transcribes. */
  addSource: studioBase
    .input(
      z.object({
        orgId: z.string(),
        kind: z.enum(SOURCE_KINDS),
        title: z.string().min(1).max(160),
        text: z.string().max(400_000).default(""),
        file: z.object({ name: z.string().max(200), mediaType: z.string().max(100), base64: z.string() }).nullish(),
      }),
    )
    .handler(async ({ input }) => {
      const impl = await implFor(input.orgId);
      let text = input.text.trim();
      if (input.file) {
        const data = Buffer.from(input.file.base64, "base64");
        if (data.length > MAX_FILE) throw new ORPCError("BAD_REQUEST", { message: "Files up to 8 MB. Split a longer manual into parts." });
        const mt = input.file.mediaType;
        if (mt.startsWith("text/") || /\.(txt|md|csv)$/i.test(input.file.name)) text = [text, data.toString("utf8")].filter(Boolean).join("\n\n");
        else if (mt === "application/pdf" || mt.startsWith("image/")) {
          const t = await transcribe({ data, mediaType: mt, name: input.file.name }).catch((e: unknown) => {
            throw new ORPCError("BAD_GATEWAY", { message: `Could not read the file: ${e instanceof Error ? e.message : "unknown error"}` });
          });
          text = [text, t].filter(Boolean).join("\n\n");
        } else throw new ORPCError("BAD_REQUEST", { message: "Upload a PDF, a photo, or a text file. For Word files, save as PDF first." });
      }
      if (!text) throw new ORPCError("BAD_REQUEST", { message: "Paste the text or attach a file." });
      const id = crypto.randomUUID();
      await db.insert(s.studioSources).values({ id, implId: impl.id, kind: input.kind, title: input.title, text: text.slice(0, 400_000), fileName: input.file?.name ?? null });
      await touch(impl.id);
      return { id, chars: text.length };
    }),

  source: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const [x] = await db.select().from(s.studioSources).where(eq(s.studioSources.id, input.id));
    if (!x) throw new ORPCError("NOT_FOUND");
    return { id: x.id, kind: x.kind, title: x.title, text: x.text, fileName: x.fileName };
  }),

  removeSource: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    await db.delete(s.studioSources).where(eq(s.studioSources.id, input.id));
    return { ok: true };
  }),

  /** One item in full, with the standard version beside it for comparison. */
  item: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const it = await itemIn(input.id);
    return {
      id: it.id,
      type: it.type,
      slug: it.slug,
      title: it.title,
      data: it.data,
      origin: it.origin,
      status: it.status,
      note: it.note,
      ask: it.ask,
      aiState: it.aiState,
      aiError: it.aiError,
      approvedByName: it.approvedByName,
      standard: standardFor(it.type as ContentType, it.slug),
    };
  }),

  /** BLM's own edit. Goes back to draft until approved again. */
  saveItem: studioBase.input(z.object({ id: z.string(), data: z.unknown() })).handler(async ({ input }) => {
    const it = await itemIn(input.id);
    const type = it.type as ContentType;
    const parsed = SCHEMA_BY_TYPE[type].safeParse(input.data);
    if (!parsed.success) {
      const iss = parsed.error.issues[0];
      throw new ORPCError("BAD_REQUEST", { message: `${iss?.path.join(".") || "item"}: ${iss?.message ?? "invalid"}` });
    }
    const data = parsed.data as Record<string, unknown>;
    if (type === "reward") data.key = (it.data as Record<string, unknown>).key;
    else if (type === "checklist") data.type = (it.data as Record<string, unknown>).type;
    else if (type !== "talking_points") data.slug = it.slug;
    await db
      .update(s.contentItems)
      .set({ data, title: titleOf(type, data), origin: "edited", status: "draft", approvedByName: null, updatedAt: new Date() })
      .where(eq(s.contentItems.id, it.id));
    await touch(it.implId);
    return { ok: true };
  }),

  /** Approve, exclude, or send back to draft. Only approved items are published. */
  setStatus: studioBase
    .input(z.object({ ids: z.array(z.string()).min(1).max(200), status: z.enum(["draft", "approved", "excluded"]) }))
    .handler(async ({ input, context }) => {
      await db
        .update(s.contentItems)
        .set({ status: input.status, approvedByName: input.status === "approved" ? context.staff.name : null, updatedAt: new Date() })
        .where(and(inArray(s.contentItems.id, input.ids), sql`${s.contentItems.aiState} not in ('queued','working')`));
      return { ok: true };
    }),

  /** Queue AI rewrites. The Studio keeps working while they run. */
  draft: studioBase
    .input(z.object({ ids: z.array(z.string()).min(1).max(200), instructions: z.string().max(4000).default("") }))
    .handler(async ({ input }) => {
      const rows = await db.select().from(s.contentItems).where(inArray(s.contentItems.id, input.ids));
      if (!rows.length) throw new ORPCError("NOT_FOUND");
      const implId = rows[0]!.implId;
      const patch: Partial<typeof s.contentItems.$inferInsert> = { aiState: "queued", aiError: null };
      if (input.ids.length === 1 || input.instructions) patch.ask = input.instructions;
      await db
        .update(s.contentItems)
        .set(patch)
        .where(and(inArray(s.contentItems.id, rows.filter((r) => r.implId === implId && r.aiState !== "working").map((r) => r.id))));
      kickQueue(implId);
      return { queued: rows.length };
    }),

  /** Clear a stuck or failed draft. */
  cancelDraft: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    await db.update(s.contentItems).set({ aiState: "idle", aiError: null }).where(eq(s.contentItems.id, input.id));
    return { ok: true };
  }),

  /** Put the BLM standard version back. */
  reset: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const it = await itemIn(input.id);
    const std = standardFor(it.type as ContentType, it.slug);
    if (!std) throw new ORPCError("BAD_REQUEST", { message: "This item is new for this client; there is no standard version." });
    await db
      .update(s.contentItems)
      .set({ data: std, title: titleOf(it.type as ContentType, std as Record<string, unknown>), origin: "standard", status: "draft", note: "", approvedByName: null, updatedAt: new Date() })
      .where(eq(s.contentItems.id, it.id));
    return { ok: true };
  }),

  /** A new item written by AI from the brief and the material: a POS check, a repeatable drill, a wine list module. */
  create: studioBase
    .input(z.object({ orgId: z.string(), type: z.enum(CONTENT_TYPES), instructions: z.string().min(5).max(4000) }))
    .handler(async ({ input }) => {
      const impl = await implFor(input.orgId);
      if (input.type === "reward" || input.type === "talking_points" || input.type === "checklist")
        throw new ORPCError("BAD_REQUEST", { message: "Rewards, checklists and talking points are edited in place." });
      try {
        const id = await draftNew(impl, input.type, input.instructions);
        await touch(impl.id);
        return { id };
      } catch (e) {
        if (e instanceof ORPCError) throw e;
        throw new ORPCError("BAD_GATEWAY", { message: e instanceof Error ? e.message : "Drafting failed." });
      }
    }),

  /** Delete an item that was written for this client. Standard items are excluded instead. */
  remove: studioBase.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const it = await itemIn(input.id);
    if (standardFor(it.type as ContentType, it.slug)) throw new ORPCError("BAD_REQUEST", { message: "Exclude standard items instead of deleting them." });
    await db.delete(s.contentItems).where(eq(s.contentItems.id, it.id));
    return { ok: true };
  }),

  /** Compile every approved item into the program the client's platform runs on. */
  publish: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input, context }) => {
    const impl = await implFor(input.orgId);
    const busy = await db
      .select({ n: count() })
      .from(s.contentItems)
      .where(and(eq(s.contentItems.implId, impl.id), inArray(s.contentItems.aiState, ["queued", "working"])));
    if (busy[0]!.n) throw new ORPCError("CONFLICT", { message: "Drafts are still being written. Publish when they finish." });
    try {
      return await publish(impl, context.staff.name);
    } catch (e) {
      throw new ORPCError("BAD_REQUEST", { message: e instanceof Error ? e.message : "Publish failed." });
    }
  }),

  /** Last year's daily totals for one store. Re-importing a date replaces it. */
  importHistory: studioBase
    .input(
      z.object({
        storeId: z.string(),
        rows: z
          .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), netSales: z.number().min(0).max(10_000_000), tickets: z.number().int().min(0).max(100_000), covers: z.number().int().min(0).max(100_000).default(0) }))
          .min(1)
          .max(800),
      }),
    )
    .handler(async ({ input }) => {
      const [store] = await db.select().from(s.stores).where(eq(s.stores.id, input.storeId));
      if (!store) throw new ORPCError("NOT_FOUND", { message: "Store not found." });
      const uniq = new Map(input.rows.map((r) => [r.date, r]));
      const rows = [...uniq.values()];
      for (let i = 0; i < rows.length; i += 80) {
        await db
          .insert(s.historyDays)
          .values(rows.slice(i, i + 80).map((r) => ({ orgId: store.orgId, storeId: store.id, ...r })))
          .onConflictDoUpdate({
            target: [s.historyDays.storeId, s.historyDays.date],
            set: { netSales: sql`excluded.net_sales`, tickets: sql`excluded.tickets`, covers: sql`excluded.covers` },
          });
      }
      const cov = (await historyCoverage([store.id])).get(store.id)!;
      return { imported: rows.length, ...cov };
    }),

  clearHistory: studioBase.input(z.object({ storeId: z.string() })).handler(async ({ input }) => {
    await db.delete(s.historyDays).where(eq(s.historyDays.storeId, input.storeId));
    return { ok: true };
  }),
};
