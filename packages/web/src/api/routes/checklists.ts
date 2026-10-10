import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, loadStore, managerBase, viewerBase, type Viewer } from "../lib/access";
import { ensureChecklists } from "../lib/core";
import { addDays, businessDate, opensAtFor } from "../lib/time";

async function loadChecklist(v: Viewer, id: string) {
  const [c] = await db.select().from(s.checklists).where(eq(s.checklists.id, id));
  if (!c) throw new ORPCError("NOT_FOUND", { message: "Checklist not found." });
  assertStore(v, c.storeId);
  return c;
}

/** Lines can't be initialled before the checklist's window opens (opening 6:00 am, closing 9:00 pm, store time). */
async function assertWindowOpen(c: typeof s.checklists.$inferSelect) {
  const [store] = await db.select({ tz: s.stores.timezone }).from(s.stores).where(eq(s.stores.id, c.storeId));
  const opens = opensAtFor(store?.tz ?? "America/New_York", c.type, c.businessDate);
  if (Date.now() < opens.getTime())
    throw new ORPCError("BAD_REQUEST", {
      message: `The ${c.type} checklist opens at ${opens.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: store?.tz ?? "America/New_York" })}. Early ticks don't count.`,
    });
}

async function withLines(cs: (typeof s.checklists.$inferSelect)[]) {
  if (!cs.length) return [];
  const lines = await db
    .select()
    .from(s.checklistLines)
    .where(
      inArray(
        s.checklistLines.checklistId,
        cs.map((c) => c.id),
      ),
    );
  return cs.map((c) => {
    const ls = lines.filter((l) => l.checklistId === c.id).sort((a, b) => a.sort - b.sort);
    return {
      ...c,
      lines: ls,
      done: ls.filter((l) => l.doneAt || l.naReason).length,
      na: ls.filter((l) => l.naReason).length,
      total: ls.length,
      late: c.submittedAt ? c.submittedAt.getTime() > c.dueAt.getTime() : Date.now() > c.dueAt.getTime(),
    };
  });
}

export const checklists = {
  /** Today's opening and closing checklists for a store (created on first look). */
  today: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const store = await loadStore(context.viewer, input.storeId);
    const cs = await ensureChecklists(store);
    const full = await withLines(cs);
    return {
      store: { id: store.id, name: store.name, number: store.number },
      date: businessDate(store.timezone),
      checklists: full.sort((a) => (a.type === "opening" ? -1 : 1)),
    };
  }),

  get: viewerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const c = await loadChecklist(context.viewer, input.id);
    const [full] = await withLines([c]);
    const [store] = await db.select().from(s.stores).where(eq(s.stores.id, c.storeId));
    const roster = await db
      .select({ id: s.members.id, name: s.members.name, initials: s.members.initials, role: s.members.role })
      .from(s.members)
      .where(and(eq(s.members.storeId, c.storeId), eq(s.members.status, "active")));
    roster.sort((a, b) => a.name.localeCompare(b.name));
    // The manager on duty owns the checklist; if nobody is named, it falls to the GM.
    const owner = roster.find((r) => r.role === "gm") ?? roster.find((r) => r.role === "agm") ?? null;
    return {
      checklist: full!,
      store: { id: store!.id, name: store!.name, number: store!.number },
      roster,
      me: context.viewer.member
        ? { id: context.viewer.member.id, name: context.viewer.member.name, initials: context.viewer.member.initials }
        : null,
      canVerify: context.viewer.level !== "staff",
      isToday: c.businessDate === businessDate(store!.timezone),
      rules: {
        timezone: store!.timezone,
        opensAt: opensAtFor(store!.timezone, c.type, c.businessDate).getTime(),
        dueAt: c.dueAt.getTime(),
        owner: owner ? { name: owner.name, role: owner.role } : null,
      },
    };
  }),

  /** Tick a line and stamp it with initials and the time. */
  initial: viewerBase
    .input(z.object({ lineId: z.string(), memberId: z.string().optional(), pin: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const [line] = await db.select().from(s.checklistLines).where(eq(s.checklistLines.id, input.lineId));
      if (!line) throw new ORPCError("NOT_FOUND");
      const c = await loadChecklist(v, line.checklistId);
      if (c.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "This checklist is already signed." });
      await assertWindowOpen(c);
      let who: typeof s.members.$inferSelect | undefined;
      if (!input.memberId || input.memberId === v.member?.id) {
        if (!v.member) throw new ORPCError("BAD_REQUEST", { message: "Choose who completed this." });
        who = v.member;
      } else {
        [who] = await db.select().from(s.members).where(eq(s.members.id, input.memberId));
        if (!who || who.storeId !== c.storeId) throw new ORPCError("NOT_FOUND", { message: "Not on this store's team." });
        // On a shared tablet, a colleague confirms with their own 4-digit PIN.
        if (who.pin !== input.pin)
          throw new ORPCError("UNAUTHORIZED", { message: `That isn't ${who.name.split(" ")[0]}'s PIN.` });
      }
      await db
        .update(s.checklistLines)
        .set({ doneById: who.id, doneByName: who.name, initials: who.initials, doneAt: new Date(), naReason: null, naBy: null, naAt: null })
        .where(eq(s.checklistLines.id, line.id));
      return { ok: true, initials: who.initials };
    }),

  clear: viewerBase.input(z.object({ lineId: z.string() })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [line] = await db.select().from(s.checklistLines).where(eq(s.checklistLines.id, input.lineId));
    if (!line) throw new ORPCError("NOT_FOUND");
    const c = await loadChecklist(v, line.checklistId);
    if (c.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "This checklist is already signed." });
    if (v.level === "staff" && line.doneById !== v.member?.id)
      throw new ORPCError("FORBIDDEN", { message: "Only the person who initialled it or a manager can undo." });
    await db
      .update(s.checklistLines)
      .set({ doneById: null, doneByName: null, initials: null, doneAt: null, naReason: null, naBy: null, naAt: null })
      .where(eq(s.checklistLines.id, line.id));
    return { ok: true };
  }),

  /** Mark a line not applicable today ("patio closed — rain"). The reason and who said so stay on the record. */
  markNa: viewerBase.input(z.object({ lineId: z.string(), reason: z.string().trim().min(4).max(200) })).handler(async ({ input, context }) => {
    const v = context.viewer;
    const [line] = await db.select().from(s.checklistLines).where(eq(s.checklistLines.id, input.lineId));
    if (!line) throw new ORPCError("NOT_FOUND");
    const c = await loadChecklist(v, line.checklistId);
    if (c.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "This checklist is already signed." });
    await assertWindowOpen(c);
    await db
      .update(s.checklistLines)
      .set({ naReason: input.reason, naBy: v.member?.name ?? v.accessName, naAt: new Date(), doneById: null, doneByName: null, initials: null, doneAt: null })
      .where(eq(s.checklistLines.id, line.id));
    return { ok: true };
  }),

  /** Manager walks the room, then signs: "Verified by". */
  verify: managerBase
    .input(z.object({ id: z.string(), signature: z.string().min(10).max(20000), note: z.string().max(500).optional() }))
    .handler(async ({ input, context }) => {
      const v = context.viewer;
      const c = await loadChecklist(v, input.id);
      if (c.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Already verified." });
      const lines = await db.select().from(s.checklistLines).where(eq(s.checklistLines.checklistId, c.id));
      const open = lines.filter((l) => !l.doneAt && !l.naReason).length;
      if (open) throw new ORPCError("BAD_REQUEST", { message: `${open} line${open === 1 ? "" : "s"} still to initial or mark N/A.` });
      await db
        .update(s.checklists)
        .set({
          status: "verified",
          verifiedById: v.member?.id ?? null,
          verifiedByName: v.accessName,
          verifiedByRole: v.accessRole,
          signature: input.signature,
          verifiedAt: new Date(),
          note: input.note ?? null,
        })
        .where(eq(s.checklists.id, c.id));
      return { ok: true };
    }),

  submit: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const c = await loadChecklist(context.viewer, input.id);
    if (c.status !== "verified") throw new ORPCError("BAD_REQUEST", { message: "Verify and sign first." });
    const at = new Date();
    await db.update(s.checklists).set({ status: "submitted", submittedAt: at }).where(eq(s.checklists.id, c.id));
    return { ok: true, submittedAt: at };
  }),

  /** Re-open a verified (not yet submitted) checklist. */
  unverify: managerBase.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const c = await loadChecklist(context.viewer, input.id);
    if (c.status !== "verified") throw new ORPCError("BAD_REQUEST", { message: "Only a verified checklist can be reopened." });
    await db
      .update(s.checklists)
      .set({ status: "open", signature: null, verifiedAt: null, verifiedById: null, verifiedByName: null, verifiedByRole: null })
      .where(eq(s.checklists.id, c.id));
    return { ok: true };
  }),

  history: viewerBase
    .input(z.object({ storeId: z.string(), days: z.number().int().min(1).max(120).default(14) }))
    .handler(async ({ input, context }) => {
      const store = await loadStore(context.viewer, input.storeId);
      const since = addDays(businessDate(store.timezone), -input.days);
      const cs = await db
        .select()
        .from(s.checklists)
        .where(and(eq(s.checklists.storeId, store.id), gte(s.checklists.businessDate, since)))
        .orderBy(desc(s.checklists.businessDate));
      const full = await withLines(cs);
      return full.map(({ lines: _l, signature: _s, ...c }) => c);
    }),
};
