// "Try the demo": a sample restaurant group with three stores and the film's cast.
import { db } from "../database";
import * as s from "../database/schema";
import { DEFAULT_CLOSING, DEFAULT_OPENING, initialsOf } from "../../shared/domain";
import { insertChunked, onboardingRows } from "./core";
import { addDays, businessDate, dueAtFor, opensAtFor, zoned } from "./time";
import { uniqueStoreNumber } from "./access";
import { seedConduct } from "./seed-conduct";
import { seedProgram } from "./seed-program";

type Person = {
  name: string;
  role: string;
  pin: string;
  trainer?: boolean;
  /** Days since hire. */
  tenure: number;
  /** Baseline sales per cover for floor sales staff (seed input; tickets are derived from covers). */
  ppa?: number;
  /** Per day improvement in sales per cover (new hires ramping up). */
  ramp?: number;
  initials?: string;
};

type StoreSpec = {
  name: string;
  city: string;
  pin: string;
  coversBase: number;
  ticketTarget: number;
  /** Probability a checklist is submitted late / missed. */
  late: number;
  missed: number;
  people: Person[];
};

const TZ = "America/New_York";

const SPECS: StoreSpec[] = [
  {
    name: "1906 Bar & Grille",
    city: "Main Street",
    pin: "1906",
    coversBase: 118,
    ticketTarget: 190,
    late: 0.06,
    missed: 0.0,
    people: [
      { name: "D. Kerr", role: "gm", pin: "1111", tenure: 1460, initials: "DK" },
      { name: "Priya Shah", role: "agm", pin: "4417", tenure: 820 },
      { name: "Marcus Bell", role: "floor_manager", pin: "5260", tenure: 610 },
      { name: "Tessa Morgan", role: "bar_manager", pin: "6038", tenure: 940 },
      { name: "Camille Rhodes", role: "server", pin: "2222", tenure: 24, ppa: 68.5, ramp: 0.34 },
      { name: "Chris Ortega", role: "bartender", pin: "3333", tenure: 1120, trainer: true, ppa: 52 },
      { name: "Maya Collins", role: "server", pin: "7182", tenure: 1300, trainer: true, ppa: 89.4 },
      { name: "Sam Whitaker", role: "server", pin: "7745", tenure: 690, ppa: 86.1 },
      { name: "Nadia Haddad", role: "server", pin: "8031", tenure: 410, ppa: 76.8 },
      { name: "Daniel Okafor", role: "server", pin: "8392", tenure: 260, ppa: 71.2 },
      { name: "Elena Vasquez", role: "sommelier", pin: "9104", tenure: 980 },
      { name: "Jordan Lee", role: "host", pin: "9233", tenure: 340 },
      { name: "Theo Grant", role: "busser", pin: "9377", tenure: 150 },
      { name: "Luis Romero", role: "food_runner", pin: "9480", tenure: 520 },
      { name: "Ben Carter", role: "barback", pin: "9561", tenure: 205 },
      { name: "Owen Price", role: "expo", pin: "9642", tenure: 720 },
    ],
  },
  {
    name: "1906 Riverside",
    city: "Harbor District",
    pin: "2210",
    coversBase: 96,
    ticketTarget: 178,
    late: 0.14,
    missed: 0.05,
    people: [
      { name: "Andre Wallace", role: "gm", pin: "1212", tenure: 900 },
      { name: "Hannah Brooks", role: "agm", pin: "4521", tenure: 380 },
      { name: "Rafael Duarte", role: "bar_manager", pin: "6145", tenure: 700 },
      { name: "Olivia Chen", role: "server", pin: "7011", tenure: 840, trainer: true, ppa: 82.3 },
      { name: "Isaac Turner", role: "server", pin: "7120", tenure: 530, ppa: 77.4 },
      { name: "Sofia Marino", role: "server", pin: "7234", tenure: 300, ppa: 70.6 },
      { name: "Jamal Harris", role: "server", pin: "7348", tenure: 190, ppa: 66.9 },
      { name: "Lena Novak", role: "server", pin: "7459", tenure: 12, ppa: 63.2, ramp: 0.3 },
      { name: "Kiera Walsh", role: "bartender", pin: "7563", tenure: 610, ppa: 49 },
      { name: "Mateo Silva", role: "bartender", pin: "7677", tenure: 230, ppa: 45 },
      { name: "Julien Moreau", role: "sommelier", pin: "7781", tenure: 450 },
      { name: "Ava Patel", role: "host", pin: "7895", tenure: 160 },
      { name: "Noah Reed", role: "busser", pin: "7906", tenure: 95 },
    ],
  },
  {
    name: "1906 at the Heights",
    city: "Hillcrest",
    pin: "3315",
    coversBase: 104,
    ticketTarget: 198,
    late: 0.08,
    missed: 0.02,
    people: [
      { name: "Rebecca Stone", role: "gm", pin: "1313", tenure: 1100 },
      { name: "Kwame Mensah", role: "floor_manager", pin: "5372", tenure: 480 },
      { name: "Lucas Bennett", role: "server", pin: "8014", tenure: 760, trainer: true, ppa: 91.2 },
      { name: "Emma Fischer", role: "server", pin: "8125", tenure: 620, ppa: 86.5 },
      { name: "Zoe Alvarez", role: "server", pin: "8236", tenure: 330, ppa: 80.1 },
      { name: "Ryan Doyle", role: "server", pin: "8347", tenure: 210, ppa: 74.4 },
      { name: "Aaliyah Jordan", role: "server", pin: "8458", tenure: 140, ppa: 77.9 },
      { name: "Finn O'Connor", role: "bartender", pin: "8569", tenure: 870, trainer: true, ppa: 56 },
      { name: "Ines Ferreira", role: "bartender", pin: "8670", tenure: 280, ppa: 50 },
      { name: "Mia Russo", role: "host", pin: "8781", tenure: 120 },
      { name: "Caleb Ward", role: "food_runner", pin: "8892", tenure: 400 },
      { name: "Diego Herrera", role: "barback", pin: "8903", tenure: 50 },
    ],
  },
];

/** Small deterministic PRNG so every demo looks the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 64;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function seedDemoOrg(user: { id: string; name: string; email: string }) {
  const orgId = crypto.randomUUID();
  await db.insert(s.orgs).values({ id: orgId, name: "1906 Hospitality Group", isDemo: true });
  await db.insert(s.orgAccess).values({
    orgId,
    userId: user.id,
    email: user.email,
    name: "You (Owner)",
    role: "owner",
    storeIds: [],
  });

  const now = new Date();
  const today = businessDate(TZ, now);
  const rand = rng(1906);
  const storeOut: { id: string; number: string; name: string; pin: string }[] = [];
  const programStores: Parameters<typeof seedProgram>[0]["stores"] = [];

  for (let si = 0; si < SPECS.length; si++) {
    const spec = SPECS[si]!;
    const storeId = crypto.randomUUID();
    const number = await uniqueStoreNumber();
    await db.insert(s.stores).values({
      id: storeId,
      orgId,
      number,
      name: spec.name,
      city: spec.city,
      pin: spec.pin,
      timezone: TZ,
      ticketTarget: spec.ticketTarget,
    });
    storeOut.push({ id: storeId, number, name: spec.name, pin: spec.pin });

    // Templates
    await insertChunked(s.checklistTemplateItems, [
      ...DEFAULT_OPENING.map((l, i) => ({ storeId, type: "opening" as const, area: l.area, title: l.title, sort: i })),
      ...DEFAULT_CLOSING.map((l, i) => ({ storeId, type: "closing" as const, area: l.area, title: l.title, sort: i })),
    ]);

    // Roster
    const roster = spec.people.map((p) => ({
      id: crypto.randomUUID(),
      orgId,
      storeId,
      name: p.name,
      initials: p.initials ?? initialsOf(p.name),
      role: p.role,
      isTrainer: !!p.trainer,
      email: null as string | null,
      phone: null as string | null,
      pin: p.pin,
      hireDate: addDays(today, -p.tenure),
      spec: p,
    }));
    await insertChunked(
      s.members,
      roster.map(({ spec: _p, ...m }) => m),
    );

    // Onboarding for anyone inside 90 days
    const ob: ReturnType<typeof onboardingRows> = [];
    for (const m of roster) {
      if (m.spec.tenure > 90) continue;
      const rows = onboardingRows(m.id, m.role, m.hireDate);
      const trainer = roster.find((r) => r.isTrainer && r.role === (m.role === "barback" ? "bartender" : m.role));
      const signer = trainer?.name ?? roster[0]!.name;
      for (const r of rows) {
        const daysIn = m.spec.tenure;
        const dueIn = r.phase === 30 ? (r.sort + 1) * 4 : r.phase === 60 ? 30 + (r.sort % 4) * 7 : 70 + (r.sort % 3) * 8;
        if (dueIn < daysIn - 2 && rand() > 0.12) {
          (r as any).completedAt = zoned(TZ, addDays(m.hireDate, dueIn), "16:30");
          (r as any).completedBy = signer;
        }
      }
      ob.push(...rows);
    }
    if (ob.length) await insertChunked(s.onboardingItems, ob);

    const managers = roster.filter((r) => ["gm", "agm", "floor_manager", "bar_manager"].includes(r.role));
    const support = roster.filter((r) => !["gm", "agm", "floor_manager", "bar_manager"].includes(r.role));
    const sellers = roster.filter((r) => r.spec.ppa !== undefined);

    // History
    const checklistRows: (typeof s.checklists.$inferInsert)[] = [];
    const lineRows: (typeof s.checklistLines.$inferInsert)[] = [];
    const reportRows: (typeof s.shiftReports.$inferInsert)[] = [];
    const reportLineRows: (typeof s.shiftReportLines.$inferInsert)[] = [];

    for (let d = DAYS; d >= 0; d--) {
      const date = addDays(today, -d);
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      const isToday = d === 0;

      // Checklists
      for (const type of ["opening", "closing"] as const) {
        const items = type === "opening" ? DEFAULT_OPENING : DEFAULT_CLOSING;
        const cid = crypto.randomUUID();
        const dueAt = dueAtFor(TZ, type, date, "11:00", "01:00");
        const startClock = type === "opening" ? zoned(TZ, date, "07:20") : zoned(TZ, date, "22:35");
        let status: "open" | "verified" | "submitted" = "submitted";
        let doneCount = items.length;
        const missed = !isToday && rand() < spec.missed;
        const late = rand() < spec.late;
        if (missed) {
          status = "open";
          doneCount = Math.floor(items.length * (0.4 + rand() * 0.4));
        }
        if (isToday) {
          // Before the opening window (6:00 am), nobody has started — never stamp ticks before the window.
          const beforeWindow = now.getTime() < opensAtFor(TZ, "opening", date).getTime() + 90 * 60000;
          if (type === "closing" || beforeWindow) {
            status = "open";
            doneCount = 0;
          } else if (si === 0) {
            status = "open";
            doneCount = 9; // CR + CO mid-way through; the demo user verifies & signs.
          } else if (si === 1) {
            status = "submitted";
          } else {
            status = "open";
            doneCount = 3;
          }
        }
        const pool =
          si === 0
            ? roster.filter((r) => r.name === "Camille Rhodes" || r.name === "Chris Ortega")
            : support.slice(0, 4);
        const verifier = si === 0 ? managers[0]! : managers[(d + (type === "closing" ? 1 : 0)) % managers.length]!;
        // For today, keep every time stamp in the past.
        const nowCap = now.getTime() - 4 * 60000;
        let t = isToday ? Math.min(startClock.getTime(), nowCap - doneCount * 5 * 60000) : startClock.getTime();
        let lastStamp = t;
        for (let i = 0; i < items.length; i++) {
          const it = items[i]!;
          const done = i < doneCount;
          const who =
            it.area === "Bar" ? (pool.find((p) => p.role === "bartender") ?? pool[i % pool.length]!) : pool[i % pool.length]!;
          if (done) {
            t += (isToday ? 3 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3)) * 60000;
            lastStamp = t;
          }
          lineRows.push({
            checklistId: cid,
            area: it.area,
            title: it.title,
            sort: i,
            doneById: done ? who.id : null,
            doneByName: done ? who.name : null,
            initials: done ? who.initials : null,
            doneAt: done ? new Date(t) : null,
          });
        }
        let submitTime =
          type === "opening"
            ? zoned(TZ, date, si === 0 ? "08:02" : "09:40").getTime()
            : zoned(TZ, date, si === 0 ? "23:52" : "23:38").getTime();
        if (late && !isToday) submitTime = dueAt.getTime() + (12 + Math.floor(rand() * 50)) * 60000;
        submitTime += Math.floor(rand() * 9) * 60000;
        if (isToday) submitTime = lastStamp + 3 * 60000;
        else submitTime = Math.max(submitTime, lastStamp + 2 * 60000);
        const signed = status === "submitted";
        checklistRows.push({
          id: cid,
          storeId,
          type,
          businessDate: date,
          status,
          dueAt,
          verifiedById: signed ? verifier.id : null,
          verifiedByName: signed ? verifier.name : null,
          verifiedByRole: signed ? verifier.role : null,
          signature: signed ? sigPath(verifier.name, rand) : null,
          verifiedAt: signed ? new Date(submitTime - 60000) : null,
          submittedAt: signed ? new Date(submitTime) : null,
        });
      }

      // Shift report for every night before today
      if (isToday) continue;
      const weekend = dow === 5 || dow === 6;
      const covers = Math.round(
        spec.coversBase * (dow === 1 ? 0.72 : dow === 2 ? 0.82 : weekend ? 1.24 : dow === 0 ? 0.95 : 1) * (0.92 + rand() * 0.16),
      );
      const working = sellers.filter((p) => {
        const hired = p.spec.tenure - d;
        return hired >= 3 && rand() > 0.22;
      });
      const bar = working.filter((p) => p.role === "bartender");
      const floor = working.filter((p) => p.role !== "bartender");
      if (!floor.length) continue;
      const barCovers = Math.round(covers * 0.14);
      let floorCovers = covers - (bar.length ? barCovers : 0);
      const lines: (typeof s.shiftReportLines.$inferInsert)[] = [];
      const reportId = crypto.randomUUID();
      const weights = floor.map(() => 0.8 + rand() * 0.4);
      const wsum = weights.reduce((a, b) => a + b, 0);
      floor.forEach((p, i) => {
        const c = i === floor.length - 1 ? floorCovers : Math.round((covers - (bar.length ? barCovers : 0)) * (weights[i]! / wsum));
        floorCovers -= i === floor.length - 1 ? 0 : c;
        const daysIn = p.spec.tenure - d;
        const base = p.spec.ppa! + (p.spec.ramp ? p.spec.ramp * Math.min(daysIn, 60) : 0);
        const ppa = base * (weekend ? 1.04 : 1) * (0.94 + rand() * 0.12);
        lines.push({
          reportId,
          memberId: p.id,
          name: p.name,
          role: p.role,
          covers: Math.max(c, 0),
          netSales: round2(Math.max(c, 0) * ppa),
          checks: Math.max(1, Math.round(c / (2.3 + rand() * 0.6))),
          wineBottles: Math.round(c * (0.06 + (ppa - 60) / 600) * (0.8 + rand() * 0.4)),
          desserts: Math.round(c * (0.18 + (ppa - 60) / 300) * (0.8 + rand() * 0.4)),
        });
      });
      bar.forEach((p, i) => {
        const c = Math.round(barCovers / bar.length) + (i === 0 ? barCovers % bar.length : 0);
        const ppa = p.spec.ppa! * (0.9 + rand() * 0.2);
        lines.push({
          reportId,
          memberId: p.id,
          name: p.name,
          role: p.role,
          covers: c,
          netSales: round2(c * ppa),
          checks: Math.max(1, Math.round(c / 1.6)),
          wineBottles: Math.round(c * 0.03),
          desserts: Math.round(c * 0.05),
        });
      });
      const netSales = round2(lines.reduce((a, l) => a + l.netSales!, 0));
      const manager = managers[d % managers.length]!;
      reportRows.push({
        id: reportId,
        storeId,
        businessDate: date,
        netSales,
        covers: lines.reduce((a, l) => a + l.covers!, 0),
        checks: lines.reduce((a, l) => a + (l.checks ?? 0), 0),
        comps: round2(netSales * (0.008 + rand() * 0.012) * (si === 1 ? 1.6 : 1)),
        voids: round2(netSales * (0.003 + rand() * 0.006)),
        discounts: round2(netSales * (0.005 + rand() * 0.008)),
        walkouts: rand() < 0.04 ? 1 : 0,
        eightySixed: rand() < 0.3 ? ["Dover sole", "Halibut", "Oysters", "Chocolate soufflé", "2016 Grand Vin"][Math.floor(rand() * 5)]! : "",
        notes: d === 1 && si === 0 ? "Strong Friday-level turn on a weeknight. Camille ran section 4 solo for the first full turn — clean. Two VIP anniversaries, both comped dessert." : "",
        source: rand() < 0.6 ? "csv" : "manual",
        submittedById: manager.id,
        submittedByName: manager.name,
        signature: sigPath(manager.name, rand),
        submittedAt: zoned(TZ, addDays(date, 1), "00:" + String(10 + Math.floor(rand() * 40)).padStart(2, "0")),
      });
      reportLineRows.push(...lines);
    }

    await insertChunked(s.checklists, checklistRows);
    await insertChunked(s.checklistLines, lineRows, 120);
    await insertChunked(s.shiftReports, reportRows);
    await insertChunked(s.shiftReportLines, reportLineRows, 120);

    await seedConduct({
      orgId,
      storeId,
      si,
      tz: TZ,
      today,
      roster: roster.map((r) => ({ id: r.id, name: r.name, role: r.role, hireDate: r.hireDate })),
      rand,
      sig: sigPath,
    });
    programStores.push({
      id: storeId,
      name: spec.name,
      si,
      ticketTarget: spec.ticketTarget,
      roster: roster.map((r) => ({ id: r.id, name: r.name, role: r.role, hireDate: r.hireDate, tenure: r.spec.tenure, ppa: r.spec.ppa, isTrainer: r.isTrainer })),
    });
  }

  await seedProgram({ orgId, stores: programStores, tz: TZ, today, rand, sig: sigPath });

  return { orgId, stores: storeOut };
}

/** A believable hand-drawn signature path for seeded sign-offs. */
export function sigPath(name: string, rand: () => number) {
  const pts: string[] = [];
  let x = 8;
  const letters = Math.min(name.replace(/[^A-Za-z]/g, "").length, 9);
  pts.push(`M${x} ${30 + rand() * 6}`);
  for (let i = 0; i < letters; i++) {
    const h = 10 + rand() * 16;
    x += 10 + rand() * 8;
    pts.push(`Q${(x - 6).toFixed(1)} ${(30 - h).toFixed(1)} ${x.toFixed(1)} ${(28 + rand() * 8).toFixed(1)}`);
  }
  pts.push(`L${(x + 22).toFixed(1)} ${(26 + rand() * 4).toFixed(1)}`);
  return JSON.stringify({ w: Math.ceil(x + 30), h: 48, d: pts.join(" ") });
}
