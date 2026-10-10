import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { assertStore, managerBase } from "../lib/access";
import { ensureChecklists } from "../lib/core";
import { addDays, businessDate, opensAtFor } from "../lib/time";
import { certsFor } from "../lib/program";

const FLOOR = new Set(["server", "sommelier"]);
/** Servers inside their first 30 days are ramping — never ranked against veterans. */
export const RAMP_DAYS = 30;
const MIN_SHIFTS = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function compute(storeIds: string[], from: string, to: string) {
  const stores = await db.select().from(s.stores).where(inArray(s.stores.id, storeIds));
  stores.sort((a, b) => a.name.localeCompare(b.name));
  const reports = await db
    .select()
    .from(s.shiftReports)
    .where(and(inArray(s.shiftReports.storeId, storeIds), gte(s.shiftReports.businessDate, from), lte(s.shiftReports.businessDate, to)));
  const lines = reports.length
    ? await db
        .select()
        .from(s.shiftReportLines)
        .where(
          inArray(
            s.shiftReportLines.reportId,
            reports.map((r) => r.id),
          ),
        )
    : [];
  const roster = await db
    .select({ id: s.members.id, hireDate: s.members.hireDate })
    .from(s.members)
    .where(inArray(s.members.storeId, storeIds));
  const hireOf = new Map(roster.map((m) => [m.id, m.hireDate]));
  const reportStore = new Map(reports.map((r) => [r.id, r.storeId]));
  const checklists = await db
    .select()
    .from(s.checklists)
    .where(and(inArray(s.checklists.storeId, storeIds), gte(s.checklists.businessDate, from), lte(s.checklists.businessDate, to)));

  const now = Date.now();
  const comp = (cs: typeof checklists) => {
    const due = cs.filter((c) => c.dueAt.getTime() < now || c.status === "submitted");
    const onTime = due.filter((c) => c.submittedAt && c.submittedAt.getTime() <= c.dueAt.getTime()).length;
    const late = due.filter((c) => c.submittedAt && c.submittedAt.getTime() > c.dueAt.getTime()).length;
    const missed = due.filter((c) => !c.submittedAt).length;
    return {
      expected: due.length,
      onTime,
      late,
      missed,
      rate: due.length ? onTime / due.length : null,
      submittedRate: due.length ? (onTime + late) / due.length : null,
    };
  };

  // Daily series (all stores in scope summed)
  const byDate = new Map<string, { date: string; sales: number; covers: number; checks: number }>();
  for (const r of reports) {
    const d = byDate.get(r.businessDate) ?? { date: r.businessDate, sales: 0, covers: 0, checks: 0 };
    d.sales += r.netSales;
    d.covers += r.covers;
    d.checks += r.checks;
    byDate.set(r.businessDate, d);
  }
  const series = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, spt: d.checks ? round2(d.sales / d.checks) : 0 }));

  // People
  const people = new Map<
    string,
    {
      key: string;
      memberId: string | null;
      name: string;
      role: string;
      storeId: string;
      sales: number;
      covers: number;
      checks: number;
      shifts: number;
      wine: number;
      desserts: number;
    }
  >();
  for (const l of lines) {
    const storeId = reportStore.get(l.reportId)!;
    const key = l.memberId ?? `${storeId}:${l.name}`;
    const p = people.get(key) ?? { key, memberId: l.memberId, name: l.name, role: l.role, storeId, sales: 0, covers: 0, checks: 0, shifts: 0, wine: 0, desserts: 0 };
    p.sales += l.netSales;
    p.covers += l.covers;
    p.checks += l.checks;
    p.shifts += 1;
    p.wine += l.wineBottles;
    p.desserts += l.desserts;
    people.set(key, p);
  }
  const leaderboard = [...people.values()]
    .map((p) => {
      const hireDate = p.memberId ? (hireOf.get(p.memberId) ?? null) : null;
      const tenureDays = hireDate ? Math.round((Date.parse(to) - Date.parse(hireDate)) / 86400000) : null;
      return {
        ...p,
        hireDate,
        tenureDays,
        ramping: tenureDays != null && tenureDays < RAMP_DAYS,
        spt: p.checks ? round2(p.sales / p.checks) : 0,
        winePer100: p.covers ? (p.wine / p.covers) * 100 : 0,
        dessertAttach: p.covers ? p.desserts / p.covers : 0,
      };
    })
    .sort((a, b) => b.spt - a.spt);

  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const storeName = (id: string) => stores.find((x) => x.id === id)?.name ?? "";
  const person = (p: (typeof leaderboard)[number]) => ({
    memberId: p.memberId,
    name: p.name,
    role: p.role,
    storeId: p.storeId,
    storeName: storeName(p.storeId),
    covers: p.covers,
    checks: p.checks,
    shifts: p.shifts,
    hireDate: p.hireDate,
    tenureDays: p.tenureDays,
    spt: p.spt,
  });
  const gapFor = (storeId: string | null) => {
    const floor = leaderboard.filter((p) => FLOOR.has(p.role) && (!storeId || p.storeId === storeId));
    const ramping = floor.filter((p) => p.ramping).map(person);
    const pool = floor.filter((p) => !p.ramping && p.shifts >= MIN_SHIFTS);
    const excludedShort = floor.filter((p) => !p.ramping && p.shifts < MIN_SHIFTS).map(person);
    if (pool.length < 4) return null;
    const top = pool.slice(0, 2);
    const bottom = pool.slice(-2);
    // Round the displayed figures first, then subtract — what you see is what we computed.
    const topSpt = round2(top.reduce((a, p) => a + p.sales, 0) / top.reduce((a, p) => a + p.checks, 0));
    const bottomSpt = round2(bottom.reduce((a, p) => a + p.sales, 0) / bottom.reduce((a, p) => a + p.checks, 0));
    const bottomTickets = bottom.reduce((a, p) => a + p.checks, 0);
    const gap = round2(topSpt - bottomSpt);
    const annualise = 365 / days;
    return {
      top: top.map(person),
      bottom: bottom.map(person),
      ramping,
      excludedShort,
      topSpt,
      bottomSpt,
      gap,
      /** Modeled yearly sales if the priority two closed half the gap. Sales, not profit. */
      annualHalfGap: Math.round((gap / 2) * bottomTickets * annualise),
      assumptions: {
        from,
        to,
        days,
        poolSize: pool.length,
        bottomTickets,
        annualise: round2(annualise),
        recoverable: 0.5,
        minShifts: MIN_SHIFTS,
        rampDays: RAMP_DAYS,
        roles: [...FLOOR],
      },
    };
  };

  const perStore = stores.map((st) => {
    const rs = reports.filter((r) => r.storeId === st.id);
    const sales = rs.reduce((a, r) => a + r.netSales, 0);
    const covers = rs.reduce((a, r) => a + r.covers, 0);
    const checks = rs.reduce((a, r) => a + r.checks, 0);
    const comps = rs.reduce((a, r) => a + r.comps, 0);
    const voids = rs.reduce((a, r) => a + r.voids, 0);
    const discounts = rs.reduce((a, r) => a + r.discounts, 0);
    return {
      id: st.id,
      name: st.name,
      number: st.number,
      timezone: st.timezone,
      ticketTarget: st.ticketTarget,
      nights: rs.length,
      sales,
      covers,
      checks,
      spt: checks ? round2(sales / checks) : 0,
      comps,
      voids,
      discounts,
      leakageRate: sales ? (comps + voids + discounts) / sales : 0,
      walkouts: rs.reduce((a, r) => a + r.walkouts, 0),
      compliance: comp(checklists.filter((c) => c.storeId === st.id)),
      gap: gapFor(st.id),
    };
  });

  const sales = reports.reduce((a, r) => a + r.netSales, 0);
  const covers = reports.reduce((a, r) => a + r.covers, 0);
  const checks = reports.reduce((a, r) => a + r.checks, 0);
  const leak = reports.reduce((a, r) => a + r.comps + r.voids + r.discounts, 0);
  const halfGapTotal = perStore.reduce((a, p) => a + (p.gap?.annualHalfGap ?? 0), 0);
  const targetW = checks ? round2(perStore.reduce((a, p) => a + p.ticketTarget * p.checks, 0) / checks) : (stores[0]?.ticketTarget ?? 190);
  return {
    from,
    to,
    days,
    stores: perStore,
    totals: {
      sales,
      covers,
      checks,
      spt: checks ? round2(sales / checks) : 0,
      ticketTarget: targetW,
      nights: reports.length,
      comps: reports.reduce((a, r) => a + r.comps, 0),
      voids: reports.reduce((a, r) => a + r.voids, 0),
      discounts: reports.reduce((a, r) => a + r.discounts, 0),
      leakageRate: sales ? leak / sales : 0,
      compliance: comp(checklists),
      halfGapAnnual: halfGapTotal,
    },
    gap: gapFor(null),
    series,
    leaderboard: leaderboard.map((p) => ({ ...p, storeName: storeName(p.storeId) })),
  };
}

function scopeIds(viewer: { storeIds: string[] }, storeId?: string | null) {
  if (storeId) {
    assertStore(viewer as any, storeId);
    return [storeId];
  }
  return viewer.storeIds;
}

export const reports = {
  /** Owner home: "The bottom line, today". */
  home: managerBase.input(z.object({ storeId: z.string().nullish() })).handler(async ({ input, context }) => {
    const ids = scopeIds(context.viewer, input.storeId);
    if (!ids.length) return null;
    const stores = await db.select().from(s.stores).where(inArray(s.stores.id, ids));
    const today = businessDate(stores[0]!.timezone);
    // Today's checklists
    const todayLists: {
      storeId: string;
      storeName: string;
      timezone: string;
      businessDate: string;
      type: string;
      status: string;
      done: number;
      na: number;
      total: number;
      opensAt: Date;
      dueAt: Date;
      submittedAt: Date | null;
      id: string;
      verifiedByName: string | null;
    }[] = [];
    for (const st of stores) {
      const cs = await ensureChecklists(st, today);
      const lines = await db
        .select({ checklistId: s.checklistLines.checklistId, doneAt: s.checklistLines.doneAt, naAt: s.checklistLines.naAt })
        .from(s.checklistLines)
        .where(
          inArray(
            s.checklistLines.checklistId,
            cs.map((c) => c.id),
          ),
        );
      for (const c of cs) {
        const ls = lines.filter((l) => l.checklistId === c.id);
        todayLists.push({
          id: c.id,
          storeId: st.id,
          storeName: st.name,
          timezone: st.timezone,
          businessDate: today,
          type: c.type,
          status: c.status,
          done: ls.filter((l) => l.doneAt || l.naAt).length,
          na: ls.filter((l) => l.naAt).length,
          total: ls.length,
          opensAt: opensAtFor(st.timezone, c.type, today),
          dueAt: c.dueAt,
          submittedAt: c.submittedAt,
          verifiedByName: c.verifiedByName,
        });
      }
    }
    todayLists.sort((a, b) => a.storeName.localeCompare(b.storeName) || (a.type === "opening" ? -1 : 1));

    const [latest] = await db
      .select({ d: s.shiftReports.businessDate })
      .from(s.shiftReports)
      .where(inArray(s.shiftReports.storeId, ids))
      .orderBy(desc(s.shiftReports.businessDate))
      .limit(1);
    const lastNight = latest?.d ?? addDays(today, -1);
    const night = await compute(ids, lastNight, lastNight);
    const prior = await compute(ids, addDays(lastNight, -7), addDays(lastNight, -1));
    const month = await compute(ids, addDays(today, -30), today);

    // What to do next — one row per action, each pointing at the exact record.
    type Action = { priority: 1 | 2 | 3; kind: string; text: string; detail: string; href: string; cta: string };
    const actions: Action[] = [];
    const nowMs = Date.now();
    for (const t of todayLists) {
      if (t.status !== "submitted" && t.dueAt.getTime() < nowMs)
        actions.push({
          priority: 1,
          kind: "checklist",
          text: `${t.storeName}: ${t.type} checklist past due`,
          detail: `${t.done} of ${t.total} lines done · business date ${today} · ${t.timezone}`,
          href: `/checklists/${t.id}`,
          cta: "Open checklist",
        });
    }
    for (const st of night.stores) {
      if (st.nights === 0)
        actions.push({ priority: 1, kind: "report", text: `${st.name}: no shift report for ${lastNight}`, detail: "Enter it from the POS end-of-day", href: `/shift-report?store=${st.id}`, cta: "Enter report" });
      else if (st.spt < st.ticketTarget)
        actions.push({
          priority: 2,
          kind: "spend",
          text: `${st.name}: spend per ticket $${st.spt.toFixed(2)} vs target $${st.ticketTarget.toFixed(2)}`,
          detail: `$${(st.ticketTarget - st.spt).toFixed(2)} below the store's own target last night`,
          href: `/reports?store=${st.id}`,
          cta: "View findings",
        });
    }
    for (const st of month.stores) {
      for (const p of st.gap?.bottom ?? []) {
        if (!p.memberId) continue;
        actions.push({
          priority: 2,
          kind: "coaching",
          text: `Coach ${p.name} (${st.name})`,
          detail: `Spend per ticket $${p.spt.toFixed(2)} over ${p.shifts} shifts · ${p.tenureDays ?? "?"} days in · schedule a graded floor exercise`,
          href: `/grading/new?member=${p.memberId}&rubric=floor-service`,
          cta: "Grade a table",
        });
      }
    }
    const members = await db
      .select()
      .from(s.members)
      .where(and(inArray(s.members.storeId, ids), eq(s.members.status, "active")));
    const certs = await certsFor(members, today);
    const certActs: (typeof actions)[number][] = [];
    for (const m of members) {
      for (const c of certs.get(m.id) ?? []) {
        if (!c.required || c.status === "ok") continue;
        certActs.push({
          priority: c.status === "expiring" ? 2 : 1,
          kind: "cert",
          text: `${m.name}: ${c.label} ${c.status === "missing" ? "not on file" : c.status === "expired" ? "expired" : `expires in ${c.daysLeft} days`}`,
          detail: c.expiresOn ? `Expiry ${c.expiresOn}` : "Required for their role",
          href: `/team/${m.id}#certs`,
          cta: "Record renewal",
        });
      }
    }
    // A freshly imported roster can carry dozens of missing cards; one line beats a wall of them.
    if (certActs.length > 3) {
      const urgent = certActs.filter((a) => a.priority === 1).length;
      // One person can hold several lapsed cards; name each person once.
      const people = [...new Set(certActs.map((a) => a.text.split(":")[0]))];
      actions.push({
        priority: urgent ? 1 : 2,
        kind: "cert",
        text: `${certActs.length} certifications need attention`,
        detail: `${urgent} missing or expired · ${certActs.length - urgent} expiring soon · ${people
          .slice(0, 3)
          .join(", ")}${people.length > 3 ? ` and ${people.length - 3} more` : ""}`,
        href: "/certs",
        cta: "Open certifications",
      });
    } else actions.push(...certActs);
    const openLog = await db
      .select()
      .from(s.logEntries)
      .where(and(inArray(s.logEntries.storeId, ids), eq(s.logEntries.status, "open")));
    for (const e of openLog.filter((x) => x.kind !== "note"))
      actions.push({
        priority: e.kind === "incident" ? 1 : 3,
        kind: "log",
        text: `${stores.find((x) => x.id === e.storeId)?.name}: ${e.title}`,
        detail: `${e.kind === "incident" ? "Incident" : "Maintenance"} · logged by ${e.authorName} on ${e.businessDate}`,
        href: `/logbook/${e.id}`,
        cta: "Resolve",
      });
    const ob = members.length
      ? await db
          .select()
          .from(s.onboardingItems)
          .where(
            inArray(
              s.onboardingItems.memberId,
              members.map((m) => m.id),
            ),
          )
      : [];
    for (const m of members) {
      const overdue = ob.filter((o) => o.memberId === m.id && !o.completedAt && o.dueDate < today);
      if (overdue.length)
        actions.push({
          priority: 3,
          kind: "onboarding",
          text: `${m.name}: ${overdue.length} onboarding step${overdue.length > 1 ? "s" : ""} overdue`,
          detail: overdue[0]!.title,
          href: `/team/${m.id}`,
          cta: "Open plan",
        });
    }
    actions.sort((a, b) => a.priority - b.priority);
    const newHires = members
      .filter((m) => ob.some((o) => o.memberId === m.id) && Date.parse(today) - Date.parse(m.hireDate) <= 90 * 86400000)
      .map((m) => {
        const items = ob.filter((o) => o.memberId === m.id);
        return {
          id: m.id,
          name: m.name,
          role: m.role,
          storeId: m.storeId,
          days: Math.round((Date.parse(today) - Date.parse(m.hireDate)) / 86400000),
          done: items.filter((i) => i.completedAt).length,
          total: items.length,
        };
      })
      .sort((a, b) => a.days - b.days);

    return {
      today,
      lastNight,
      night: night.totals,
      nightStores: night.stores,
      prior: { ...prior.totals, avgSales: prior.totals.nights ? prior.totals.sales / (prior.totals.nights / Math.max(1, ids.length)) : 0 },
      month: { totals: month.totals, gap: month.gap, stores: month.stores, series: month.series },
      todayLists,
      actions,
      newHires,
      headcount: members.length,
    };
  }),

  /** Store report, or combined across every store in scope. */
  range: managerBase
    .input(z.object({ storeId: z.string().nullish(), days: z.number().int().min(1).max(120).default(30) }))
    .handler(async ({ input, context }) => {
      const ids = scopeIds(context.viewer, input.storeId);
      if (!ids.length) return null;
      const [st] = await db.select().from(s.stores).where(eq(s.stores.id, ids[0]!));
      const today = businessDate(st!.timezone);
      const to = addDays(today, -1);
      const from = addDays(to, -(input.days - 1));
      const cur = await compute(ids, from, to);
      const prev = await compute(ids, addDays(from, -input.days), addDays(from, -1));
      return { ...cur, previous: prev.totals, comparable: prev.totals.nights >= cur.totals.nights * 0.9, combined: !input.storeId };
    }),
};
