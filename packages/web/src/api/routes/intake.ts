// Client intake: one workbook from the owner, imported into the right places, and a running list of what is
// still missing before the client's first shift on the platform. BLM staff only.
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { randomDigits, uniqueStoreNumber } from "../lib/access";
import { seedTemplates } from "../lib/core";
import { historyCoverage, upsertHistory } from "../lib/history";
import { addRoster } from "../lib/roster";
import { standardRows, titleOf } from "../lib/studio";
import { implFor, studioBase } from "./studio";
import { DEFAULT_TICKET_TARGET, targetGrid } from "../../shared/metrics";
import { isManagementRole } from "../../shared/domain";
import { REVIEW_PLATFORMS, type ReviewLinks } from "../../shared/reviews";
import type { ContentType } from "../../shared/library/schemas";

const opt = (max: number) => z.string().trim().max(max).default("");
const money = z.number().min(5).max(2000).nullish();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const intakeSchema = z.object({
  orgId: z.string(),
  fileName: z.string().max(200).default("intake.xlsx"),
  group: z
    .object({ ownerName: opt(80), ownerEmail: opt(120), preferences: opt(8000), reputation: opt(8000), standards: opt(8000), gaps: opt(8000) })
    .default({ ownerName: "", ownerEmail: "", preferences: "", reputation: "", standards: "", gaps: "" }),
  stores: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        city: opt(80),
        pin: z
          .string()
          .regex(/^(\d{4,6})?$/, "Store PIN must be 4 to 6 digits")
          .default(""),
        dinnerFull: money,
        dinnerPart: money,
        lunchFull: money,
        lunchPart: money,
        trainingRate: z.number().min(1).max(200).nullish(),
        openingDueBy: z
          .string()
          .regex(/^(\d{2}:\d{2})?$/)
          .default(""),
        closingDueBy: z
          .string()
          .regex(/^(\d{2}:\d{2})?$/)
          .default(""),
        links: z.record(z.string(), z.string().trim().max(500)).default({}),
      }),
    )
    .max(40)
    .default([]),
  team: z
    .array(
      z.object({
        store: opt(80),
        name: z.string().trim().min(2).max(80),
        role: z.string().trim().min(2).max(40),
        hireDate: date,
        employment: z.enum(["full_time", "part_time"]).default("full_time"),
        isTrainer: z.boolean().default(false),
        email: opt(120),
        phone: opt(40),
      }),
    )
    .max(1000)
    .default([]),
  history: z
    .array(z.object({ store: opt(80), date, netSales: z.number().min(0).max(10_000_000), tickets: z.number().int().min(0).max(100_000), covers: z.number().int().min(0).max(100_000).default(0) }))
    .max(20_000)
    .default([]),
  materials: z
    .array(z.object({ what: z.string().trim().min(1).max(120), have: opt(40), how: opt(200), notes: opt(600) }))
    .max(40)
    .default([]),
});

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

type Fix = { tab?: "brief" | "materials" | "history" | "build" | "publish"; action?: "refresh" | "rewrite"; ids?: string[] };
type Gap = { key: string; label: string; state: "done" | "missing" | "check"; detail: string; fix?: Fix };
type GapGroup = { title: string; gaps: Gap[] };

/** Material BLM needs to write the client's program. Required ones block a good build. */
const MATERIAL = [
  { kind: "menu", label: "Food menu", required: true },
  { kind: "wine", label: "Wine list", required: true },
  { kind: "bar", label: "Bar and cocktail menu", required: false },
  { kind: "steps_of_service", label: "Steps of service", required: true },
  { kind: "standards", label: "House standards or handbook", required: false },
  { kind: "protocols", label: "Allergy, safety and comp protocols", required: false },
  { kind: "pos", label: "POS screenshots or walkthrough", required: false },
] as const;

/** Standard items this client's copy no longer matches, and standard items it never got. */
async function standardDrift(implId: string) {
  const items = await db.select().from(s.contentItems).where(eq(s.contentItems.implId, implId));
  const std = standardRows(implId);
  const stale: { id: string; data: unknown; title: string }[] = [];
  const add: typeof std = [];
  let kept = 0;
  for (const r of std) {
    const it = items.find((i) => i.type === r.type && i.slug === r.slug);
    if (!it) add.push(r);
    else if (JSON.stringify(it.data) === JSON.stringify(r.data)) continue;
    else if (it.origin === "standard") stale.push({ id: it.id, data: r.data, title: titleOf(r.type as ContentType, r.data as Record<string, unknown>) });
    else kept++;
  }
  return { items, stale, add, kept };
}

export const intake = {
  /** Everything a client still owes BLM, or BLM still owes the client, before the first shift. */
  missing: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input }) => {
    const impl = await implFor(input.orgId);
    const [[org], stores, owners, sources, drift, [program]] = await Promise.all([
      db.select({ isDemo: s.orgs.isDemo }).from(s.orgs).where(eq(s.orgs.id, input.orgId)),
      db.select().from(s.stores).where(eq(s.stores.orgId, input.orgId)),
      db.select().from(s.orgAccess).where(and(eq(s.orgAccess.orgId, input.orgId), eq(s.orgAccess.role, "owner"))),
      db.select({ kind: s.studioSources.kind }).from(s.studioSources).where(eq(s.studioSources.implId, impl.id)),
      standardDrift(impl.id),
      db.select().from(s.orgPrograms).where(eq(s.orgPrograms.orgId, input.orgId)),
    ]);
    stores.sort((a, b) => a.name.localeCompare(b.name));
    const ids = stores.map((x) => x.id);
    const [members, cov] = await Promise.all([
      ids.length ? db.select().from(s.members).where(and(inArray(s.members.storeId, ids), eq(s.members.status, "active"))) : Promise.resolve([]),
      historyCoverage(ids),
    ]);
    const b = impl.brief;
    const said = (label: string) => impl.intake?.materials.find((m) => norm(m.what) === norm(label));
    const groups: GapGroup[] = [];
    const conf = impl.intake?.confirmed ?? { targets: [], rates: [] };

    groups.push({
      title: "Owner and brief",
      gaps: [
        owners.length
          ? { key: "owner", label: "Owner on file", state: "done", detail: owners.map((o) => `${o.name}, ${o.email}`).join("; ") }
          : { key: "owner", label: "Owner on file", state: "missing", detail: "No owner email. Add it on the intake sheet so they can sign in." },
        owners.some((o) => o.userId)
          ? { key: "owner_in", label: "Owner has signed in", state: "done", detail: "Their account is linked." }
          : { key: "owner_in", label: "Owner has signed in", state: "check", detail: "Not yet. They sign up with the email on file and the group opens for them." },
        { key: "findings", label: "Audit findings", state: b.findings.trim().length >= 40 ? "done" : "missing", detail: b.findings.trim() ? `${b.findings.trim().length} characters` : "Not written yet.", fix: { tab: "brief" } },
        { key: "priorities", label: "Priorities", state: b.priorities.length ? "done" : "missing", detail: b.priorities.length ? `${b.priorities.length} set` : "None yet. Suggest them from the findings.", fix: { tab: "brief" } },
        { key: "preferences", label: "Owner preferences", state: b.preferences.trim() ? "done" : "missing", detail: b.preferences.trim() ? "On file" : "How they want the room to feel.", fix: { tab: "brief" } },
        { key: "reputation", label: "Reputation they want", state: b.reputation.trim() ? "done" : "missing", detail: b.reputation.trim() ? "On file" : "What guests should say on the way out.", fix: { tab: "brief" } },
        { key: "standards", label: "House standards", state: b.standards.trim() ? "done" : "missing", detail: b.standards.trim() ? "On file" : "Dress, greeting time, phones, non negotiables.", fix: { tab: "brief" } },
      ],
    });

    for (const st of stores) {
      const people = members.filter((m) => m.storeId === st.id);
      const staff = people.filter((m) => !isManagementRole(m.role));
      const mgrs = people.filter((m) => isManagementRole(m.role));
      const g = targetGrid(st);
      const links = (st.reviewLinks ?? {}) as ReviewLinks;
      const linked = REVIEW_PLATFORMS.filter((p) => !!links[p]);
      const h = cov.get(st.id)!;
      groups.push({
        title: st.name,
        gaps: [
          {
            key: `target:${st.id}`,
            label: "Dinner spend per ticket target",
            state: st.ticketTarget === DEFAULT_TICKET_TARGET && !conf.targets.includes(st.id) ? "check" : "done",
            detail:
              st.ticketTarget === DEFAULT_TICKET_TARGET && !conf.targets.includes(st.id)
                ? `Still the $${DEFAULT_TICKET_TARGET} default. Confirm it with the owner.`
                : `$${st.ticketTarget} full time, $${g.dinnerPart} part time`,
          },
          {
            key: `lunch:${st.id}`,
            label: "Lunch targets",
            state: st.lunchTarget == null ? "check" : "done",
            detail: st.lunchTarget == null ? `Not set, so lunch follows dinner: $${g.lunchFull} full time, $${g.lunchPart} part time. Fine if they only serve dinner.` : `$${g.lunchFull} full time, $${g.lunchPart} part time`,
          },
          {
            key: `rate:${st.id}`,
            label: "Training rate per hour",
            state: st.trainingRate === 15 && !conf.rates.includes(st.id) ? "check" : "done",
            detail: st.trainingRate === 15 && !conf.rates.includes(st.id) ? "Still the $15 default. It sets the cash value of a paid day off." : `$${st.trainingRate} an hour, so a paid day off is worth $${st.trainingRate * 8}`,
          },
          {
            key: `google:${st.id}`,
            label: "Review pages",
            state: links.Google ? "done" : "missing",
            detail: linked.length ? `${linked.join(", ")} linked${links.Google ? "" : ". Google is the one that matters most"}` : "None yet. Google first, then Yelp, OpenTable, Tripadvisor, Resy.",
          },
          {
            key: `managers:${st.id}`,
            label: "GM and managers",
            state: mgrs.length ? (mgrs.every((m) => m.email) ? "done" : "check") : "missing",
            detail: mgrs.length
              ? `${mgrs.length} on the roster${mgrs.some((m) => !m.email) ? `. No email for ${mgrs.filter((m) => !m.email).map((m) => m.name).join(", ")}, so they cannot sign in yet` : ""}`
              : "None yet. Managers need an email to sign in.",
          },
          {
            key: `roster:${st.id}`,
            label: "Front of house roster",
            state: staff.length >= 5 ? "done" : "missing",
            detail: staff.length ? `${staff.length} people` : "Nobody yet.",
          },
          {
            key: `trainers:${st.id}`,
            label: "Trainers marked",
            state: people.some((m) => m.isTrainer) ? "done" : "missing",
            detail: people.some((m) => m.isTrainer) ? people.filter((m) => m.isTrainer).map((m) => m.name).join(", ") : "Nobody can sign off a module yet.",
          },
          {
            key: `history:${st.id}`,
            label: "Last year's daily sales",
            state: h.days >= 300 ? "done" : h.days ? "check" : "missing",
            detail: h.days ? `${h.days >= 365 ? `${h.days} days on file` : `${h.days} of 365 days`}${h.from ? `, ${h.from} to ${h.to}` : ""}` : "Not imported. Needed for this year against last.",
            fix: { tab: "history" },
          },
        ],
      });
    }
    if (!stores.length) groups.push({ title: "Stores", gaps: [{ key: "stores", label: "Stores", state: "missing", detail: "No stores yet. Add them on the intake sheet." }] });

    groups.push({
      title: "Material for the program",
      gaps: MATERIAL.map((m) => {
        const n = sources.filter((x) => x.kind === m.kind).length;
        const o = said(m.label);
        const owner = o && (o.have || o.how) ? ` Owner says: ${[o.have, o.how].filter(Boolean).join(", ")}.` : "";
        return {
          key: `src:${m.kind}`,
          label: m.label,
          state: n ? "done" : m.required ? "missing" : "check",
          detail: n ? `${n} on file` : `${m.required ? "Needed" : "Nice to have"}.${owner}`,
          fix: { tab: "materials" },
        } satisfies Gap;
      }),
    });

    const live = drift.items.filter((i) => i.status !== "excluded");
    const drafts = live.filter((i) => i.status === "draft").length;
    const foreignItems = org?.isDemo ? [] : live.filter((i) => /\b1906\b/.test(JSON.stringify(i.data)));
    const foreign = foreignItems.length;
    const changed = program ? live.filter((i) => i.updatedAt.getTime() > program.publishedAt.getTime()).length : 0;
    const behind = drift.stale.length + drift.add.length;
    groups.push({
      title: "Program",
      gaps: [
        {
          key: "latest",
          label: "Latest BLM standard text",
          state: behind ? "missing" : "done",
          detail: behind
            ? `${drift.stale.length} standard ${drift.stale.length === 1 ? "item has" : "items have"} newer BLM text${drift.add.length ? ` and ${drift.add.length} new ${drift.add.length === 1 ? "item is" : "items are"} not in their copy yet` : ""}.${drift.kept ? ` ${drift.kept} edited for this client ${drift.kept === 1 ? "stays as it is" : "stay as they are"}.` : ""}`
            : "Their copy matches the current standard.",
          fix: behind ? { action: "refresh" } : undefined,
        },
        { key: "drafts", label: "Everything approved", state: drafts ? "missing" : "done", detail: drafts ? `${drafts} waiting for approval` : `${live.length} items approved`, fix: { tab: "build" } },
        {
          key: "foreign",
          label: "No mention of the 1906 demo house",
          state: foreign ? "check" : "done",
          detail: foreign
            ? `${foreign} items still name 1906: ${foreignItems.map((i) => i.title).join(", ")}. The AI can rewrite them from this client's material; check them before you approve.`
            : "Clean.",
          fix: foreign ? { action: "rewrite", ids: foreignItems.map((i) => i.id) } : undefined,
        },
        {
          key: "published",
          label: "Published",
          state: !program ? "missing" : changed ? "missing" : "done",
          detail: !program ? "Not yet. Staff see the BLM standard program until you publish." : changed ? `Version ${program.version} is live, with ${changed} changes since. Publish again.` : `Version ${program.version} is live.`,
          fix: { tab: "publish" },
        },
      ],
    });

    const all = groups.flatMap((x) => x.gaps);
    return {
      groups,
      missing: all.filter((x) => x.state === "missing").length,
      check: all.filter((x) => x.state === "check").length,
      done: all.filter((x) => x.state === "done").length,
      total: all.length,
      lastImport: impl.intake ? { at: impl.intake.importedAt, by: impl.intake.byName, file: impl.intake.fileName } : null,
    };
  }),

  /** Bring the client's copy up to the current BLM standard. Items edited for the client are left alone. */
  refreshStandard: studioBase.input(z.object({ orgId: z.string() })).handler(async ({ input }) => {
    const impl = await implFor(input.orgId);
    const d = await standardDrift(impl.id);
    const now = new Date();
    for (const x of d.stale) await db.update(s.contentItems).set({ data: x.data, title: x.title, updatedAt: now }).where(eq(s.contentItems.id, x.id));
    // New standard items come in as drafts, so BLM decides whether this client gets them.
    if (d.add.length) await db.insert(s.contentItems).values(d.add.map((r) => ({ ...r, status: "draft" as const })));
    await db.update(s.implementations).set({ updatedAt: now }).where(eq(s.implementations.id, impl.id));
    return { updated: d.stale.length, added: d.add.length, kept: d.kept };
  }),

  /** One filled intake workbook, placed where each part belongs. Safe to run again: matching rows update, nothing doubles. */
  import: studioBase.input(intakeSchema).handler(async ({ input, context }) => {
    const impl = await implFor(input.orgId);
    const report: { section: string; line: string; ok: boolean }[] = [];
    const say = (section: string, line: string, ok = true) => report.push({ section, line, ok });

    // Owner and brief.
    const g = input.group;
    if (g.ownerEmail) {
      const email = g.ownerEmail.toLowerCase();
      if (!z.string().email().safeParse(email).success) say("Owner", `"${g.ownerEmail}" is not an email address`, false);
      else {
        const [have] = await db
          .select()
          .from(s.orgAccess)
          .where(and(eq(s.orgAccess.orgId, input.orgId), eq(s.orgAccess.email, email)));
        if (have) say("Owner", `${have.name} already on file`);
        else {
          await db.insert(s.orgAccess).values({ orgId: input.orgId, email, name: g.ownerName || email, role: "owner" });
          say("Owner", `Added ${g.ownerName || email} as owner. They sign up with ${email}`);
        }
      }
    }
    const brief = { ...impl.brief };
    for (const k of ["preferences", "reputation", "standards"] as const) {
      if (g[k]) {
        brief[k] = g[k];
        say("Brief", `${k === "preferences" ? "Owner preferences" : k === "reputation" ? "Reputation they want" : "House standards"} saved`);
      }
    }
    if (g.gaps && !brief.findings.includes(g.gaps)) {
      brief.findings = [brief.findings.trim(), `From the owner's intake sheet:\n${g.gaps}`].filter(Boolean).join("\n\n");
      say("Brief", "The owner's own view of the gaps added under the audit findings");
    }

    // Stores: matched by name. A one store group matches its only store whatever the sheet calls it.
    const stores = await db.select().from(s.stores).where(eq(s.stores.orgId, input.orgId));
    const [program] = await db.select({ data: s.orgPrograms.data }).from(s.orgPrograms).where(eq(s.orgPrograms.orgId, input.orgId));
    const byName = new Map(stores.map((x) => [norm(x.name), x]));
    const confirmed = { targets: [...(impl.intake?.confirmed?.targets ?? [])], rates: [...(impl.intake?.confirmed?.rates ?? [])] };
    for (const row of input.stores) {
      let st = byName.get(norm(row.name)) ?? (stores.length === 1 && input.stores.length === 1 ? stores[0] : undefined);
      const links: ReviewLinks = { ...((st?.reviewLinks ?? {}) as ReviewLinks) };
      for (const p of REVIEW_PLATFORMS) {
        const u = row.links[p];
        if (u) {
          if (/^https?:\/\//i.test(u)) links[p] = u;
          else say(row.name, `${p} link skipped: it must start with https://`, false);
        }
      }
      if (row.links.googlePlaceId) links.googlePlaceId = row.links.googlePlaceId;
      const patch = {
        ...(row.city ? { city: row.city } : {}),
        ...(row.pin ? { pin: row.pin } : {}),
        ...(row.dinnerFull ? { ticketTarget: row.dinnerFull } : {}),
        ...(row.dinnerPart ? { dinnerPartTarget: row.dinnerPart } : {}),
        ...(row.lunchFull ? { lunchTarget: row.lunchFull } : {}),
        ...(row.lunchPart ? { lunchPartTarget: row.lunchPart } : {}),
        ...(row.trainingRate ? { trainingRate: row.trainingRate } : {}),
        ...(row.openingDueBy ? { openingDueBy: row.openingDueBy } : {}),
        ...(row.closingDueBy ? { closingDueBy: row.closingDueBy } : {}),
        reviewLinks: links,
      };
      if (st) {
        await db.update(s.stores).set(patch).where(eq(s.stores.id, st.id));
        st = { ...st, ...patch };
        say(row.name, `Updated${st.name !== row.name ? ` (on the platform as ${st.name})` : ""}: ${Object.keys(patch).length - 1} settings, ${REVIEW_PLATFORMS.filter((p) => links[p]).length} review pages`);
      } else {
        const id = crypto.randomUUID();
        const fresh = { id, orgId: input.orgId, number: await uniqueStoreNumber(), pin: row.pin || randomDigits(4), name: row.name, city: row.city, ticketTarget: row.dinnerFull ?? DEFAULT_TICKET_TARGET };
        await db.insert(s.stores).values({ ...fresh, ...patch, pin: fresh.pin, ticketTarget: fresh.ticketTarget });
        const lists = (program?.data as { checklists?: Parameters<typeof seedTemplates>[1] } | undefined)?.checklists;
        await seedTemplates(id, lists);
        const [made] = await db.select().from(s.stores).where(eq(s.stores.id, id));
        st = made!;
        stores.push(st);
        say(row.name, `Created. Store number ${st.number}, store PIN ${st.pin}`);
      }
      byName.set(norm(row.name), st);
      if (row.dinnerFull && !confirmed.targets.includes(st.id)) confirmed.targets.push(st.id);
      if (row.trainingRate && !confirmed.rates.includes(st.id)) confirmed.rates.push(st.id);
      // Publishing writes the brief's targets onto the stores, so the brief has to agree.
      const t = brief.storeTargets.filter((x) => x.storeId !== st.id);
      brief.storeTargets = [...t, { storeId: st.id, ticketTarget: st.ticketTarget }];
    }

    const storeFor = (name: string) => (name ? byName.get(norm(name)) : stores.length === 1 ? stores[0] : undefined);

    // Team, per store.
    const teamBy = new Map<string, typeof input.team>();
    for (const r of input.team) {
      const st = storeFor(r.store);
      if (!st) {
        say("Team", `${r.name}: no store called "${r.store || "(blank)"}"`, false);
        continue;
      }
      teamBy.set(st.id, [...(teamBy.get(st.id) ?? []), r]);
    }
    for (const [storeId, rows] of teamBy) {
      const st = stores.find((x) => x.id === storeId)!;
      const r = await addRoster(input.orgId, storeId, rows, { canAddManagers: true });
      say("Team", `${st.name}: ${r.created.length} added${r.skipped ? `, ${r.skipped} already on the roster` : ""}`);
      for (const e of r.errors) say("Team", e.message, false);
    }

    // Last year, per store.
    const histBy = new Map<string, typeof input.history>();
    let lost = 0;
    for (const r of input.history) {
      const st = storeFor(r.store);
      if (!st) {
        lost++;
        continue;
      }
      histBy.set(st.id, [...(histBy.get(st.id) ?? []), r]);
    }
    for (const [storeId, rows] of histBy) {
      const st = stores.find((x) => x.id === storeId)!;
      const n = await upsertHistory(st, rows);
      say("Last year", `${st.name}: ${n} days`);
    }
    if (lost) say("Last year", `${lost} days skipped: the store name did not match a store`, false);

    // Material: what the owner says they have, so the missing list can say it.
    const materials = input.materials.filter((m) => m.have || m.how || m.notes);
    if (materials.length) say("Material", `${materials.length} answers saved. Files still come in on the Materials tab`);

    await db
      .update(s.implementations)
      .set({
        brief,
        intake: { importedAt: Date.now(), byName: context.staff.name, fileName: input.fileName, materials: materials.length ? materials : (impl.intake?.materials ?? []), confirmed },
        updatedAt: new Date(),
      })
      .where(eq(s.implementations.id, impl.id));
    if (!report.length) throw new ORPCError("BAD_REQUEST", { message: "Nothing to import. The sheet looks empty." });
    return { report };
  }),
};
