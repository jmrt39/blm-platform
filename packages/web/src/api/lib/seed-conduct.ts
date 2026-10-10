// Demo line-ups, strikes, swaps and write-ups, so the conduct pages have a story to tell.
import * as s from "../database/schema";
import { db } from "../database";
import { insertChunked } from "./core";
import { addDays, zoned } from "./time";
import { DEFAULT_CALL, infractionsFor, type EntryLike, type EventType, type Step } from "../../shared/conduct";
import { isManagementRole } from "../../shared/domain";

type Member = { id: string; name: string; role: string; hireDate: string };
type Ev = {
  name: string;
  d: number;
  type: EventType;
  min?: number;
  missing?: string[];
  status?: "acknowledged" | "pending" | "refused" | "excused";
  excuse?: string;
  cover?: string;
};
type Act = { name: string; d: number; step: Step; strikes: number; status: "awaiting_signatures" | "awaiting_owner" | "final"; notes?: string };
type Sw = {
  from: string;
  to: string;
  d: number;
  shift: "lunch" | "dinner";
  shot: "ok" | "thumbs";
  status: "pending" | "approved" | "rejected";
  note?: string;
};

const STORY: { events: Ev[]; actions: Act[]; swaps: Sw[] }[] = [
  // 1906 Bar & Grille
  {
    events: [
      { name: "Daniel Okafor", d: 40, type: "late", min: 12 },
      { name: "Daniel Okafor", d: 21, type: "dress_code", missing: ["Black non slip shoes"] },
      { name: "Daniel Okafor", d: 6, type: "late", min: 9 },
      { name: "Sam Whitaker", d: 25, type: "late", min: 8 },
      { name: "Sam Whitaker", d: 11, type: "dress_code", missing: ["Apron", "Wine key & pens"] },
      { name: "Theo Grant", d: 15, type: "late", min: 14 },
      { name: "Theo Grant", d: 3, type: "no_show", status: "pending" },
      { name: "Nadia Haddad", d: 18, type: "late", min: 26, status: "excused", excuse: "Subway signal outage on the Red Line. Texted at 3:40, MTA notice on file." },
      { name: "Nadia Haddad", d: 9, type: "dress_code", missing: ["Name badge"] },
    ],
    actions: [
      {
        name: "Daniel Okafor",
        d: 6,
        step: "verbal",
        strikes: 3,
        status: "awaiting_signatures",
      },
    ],
    swaps: [
      { from: "Maya Collins", to: "Nadia Haddad", d: 0, shift: "dinner", shot: "ok", status: "approved" },
      { from: "Sam Whitaker", to: "Daniel Okafor", d: -1, shift: "dinner", shot: "thumbs", status: "pending" },
    ],
  },
  // 1906 Riverside
  {
    events: [
      { name: "Jamal Harris", d: 80, type: "late", min: 11 },
      { name: "Jamal Harris", d: 66, type: "dress_code", missing: ["Black shirt, pressed"] },
      { name: "Jamal Harris", d: 52, type: "late", min: 18 },
      { name: "Jamal Harris", d: 35, type: "swap_protocol", cover: "Kiera Walsh" },
      { name: "Jamal Harris", d: 19, type: "no_show", status: "acknowledged" },
      { name: "Jamal Harris", d: 4, type: "late", min: 22 },
      { name: "Mateo Silva", d: 70, type: "late", min: 7 },
      { name: "Mateo Silva", d: 44, type: "dress_code", missing: ["Hair & grooming"] },
      { name: "Mateo Silva", d: 30, type: "late", min: 13 },
      { name: "Mateo Silva", d: 12, type: "late", min: 15 },
      { name: "Lena Novak", d: 5, type: "late", min: 8 },
      { name: "Noah Reed", d: 14, type: "dress_code", missing: ["Black non slip shoes"], status: "refused" },
    ],
    actions: [
      { name: "Jamal Harris", d: 52, step: "verbal", strikes: 3, status: "final" },
      { name: "Jamal Harris", d: 35, step: "written", strikes: 4, status: "final", notes: "Swaps go through a manager with a screenshot showing date, start time and written agreement. No exceptions." },
      { name: "Jamal Harris", d: 18, step: "plan", strikes: 5, status: "final", notes: "30 day plan: on the floor and in uniform by the scheduled start every shift. Weekly check in with Andre." },
      { name: "Jamal Harris", d: 4, step: "termination", strikes: 6, status: "awaiting_owner", notes: "Sixth strike in 90 days while on a performance plan: 22 minutes late to dinner line up." },
      { name: "Mateo Silva", d: 30, step: "verbal", strikes: 3, status: "final" },
      { name: "Mateo Silva", d: 12, step: "written", strikes: 4, status: "final", notes: "On the floor by the scheduled start, every shift." },
    ],
    swaps: [
      { from: "Jamal Harris", to: "Kiera Walsh", d: 35, shift: "dinner", shot: "thumbs", status: "rejected", note: "A thumbs up isn't a written agreement. No date or start time either." },
      { from: "Sofia Marino", to: "Isaac Turner", d: -1, shift: "lunch", shot: "ok", status: "pending" },
      { from: "Olivia Chen", to: "Isaac Turner", d: 8, shift: "dinner", shot: "ok", status: "approved" },
    ],
  },
  // 1906 at the Heights
  {
    events: [
      { name: "Ryan Doyle", d: 17, type: "late", min: 10 },
      { name: "Ryan Doyle", d: 8, type: "dress_code", missing: ["Black trousers or skirt"] },
      { name: "Diego Herrera", d: 5, type: "dress_code", missing: ["Black non slip shoes"] },
      { name: "Zoe Alvarez", d: 10, type: "late", min: 31, status: "excused", excuse: "Called ahead: car accident on the parkway, police report shown." },
    ],
    actions: [],
    swaps: [{ from: "Emma Fischer", to: "Aaliyah Jordan", d: 3, shift: "dinner", shot: "ok", status: "approved" }],
  },
];

const LINEUP_DAYS = 21;
const sh = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h! * 60 + m! + n;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export async function seedConduct(opts: {
  orgId: string;
  storeId: string;
  si: number;
  tz: string;
  today: string;
  roster: Member[];
  rand: () => number;
  sig: (name: string, rand: () => number) => string;
}) {
  const { orgId, storeId, si, tz, today, roster, rand, sig } = opts;
  const story = STORY[si];
  if (!story) return;
  const byName = new Map(roster.map((m) => [m.name, m]));
  const managers = roster.filter((r) => isManagementRole(r.role));
  const staff = roster.filter((r) => !isManagementRole(r.role));
  const gm = managers[0]!;

  // Swaps first — events can point at them.
  const swapRows: (typeof s.shiftSwaps.$inferInsert)[] = [];
  const swapId = new Map<string, string>();
  for (const w of story.swaps) {
    const from = byName.get(w.from);
    const to = byName.get(w.to);
    if (!from || !to) continue;
    const id = crypto.randomUUID();
    swapId.set(`${w.from}|${w.d}`, id);
    const date = addDays(today, -w.d);
    const ok = w.shot === "ok";
    const reviewed = w.status !== "pending";
    swapRows.push({
      id,
      orgId,
      storeId,
      businessDate: date,
      shift: w.shift,
      startTime: DEFAULT_CALL[w.shift],
      fromMemberId: from.id,
      fromName: from.name,
      toMemberId: to.id,
      toName: to.name,
      screenshotKey: `demo:${w.shot}`,
      status: w.status,
      hasDate: reviewed ? ok : null,
      hasStartTime: reviewed ? ok : null,
      hasWrittenAgreement: reviewed ? ok : null,
      submittedByName: from.name,
      reviewedByName: reviewed ? gm.name : null,
      // Requested two days out, reviewed the day after — never in the future.
      reviewedAt: reviewed ? zoned(tz, addDays(today, -Math.max(1, w.d + 1)), "14:20") : null,
      reviewNote: w.note ?? null,
      createdAt: zoned(tz, addDays(today, -Math.max(2, w.d + 2)), "13:05"),
    });
  }
  if (swapRows.length) await db.insert(s.shiftSwaps).values(swapRows);

  // Dinner line-ups for the last three weeks (plus weekend lunches).
  const lineups: (typeof s.lineups.$inferInsert)[] = [];
  const entries: (typeof s.lineupEntries.$inferInsert)[] = [];
  const events: (typeof s.conductEvents.$inferInsert)[] = [];
  const placed = new Set<Ev>();

  const eventRow = (ev: Ev, m: Member, date: string, e: EntryLike & { id?: string }, lineupId: string | null, recorder: Member, shift: "lunch" | "dinner") => {
    const inf = infractionsFor(e, shift).find((x) => x.type === ev.type);
    if (!inf) return;
    const status = ev.status ?? "acknowledged";
    const signedAt = zoned(tz, date, sh(DEFAULT_CALL[shift], 20));
    events.push({
      orgId,
      storeId,
      memberId: m.id,
      memberName: m.name,
      type: ev.type,
      businessDate: date,
      detail: inf.detail,
      minutesLate: inf.minutesLate ?? null,
      lineupId,
      entryId: e.id ?? null,
      swapId: ev.type === "swap_protocol" ? (swapId.get(`${m.name}|${ev.d}`) ?? null) : null,
      status,
      ackSignature: status === "acknowledged" || status === "excused" ? sig(m.name, rand) : null,
      ackAt: status === "pending" ? null : signedAt,
      ackWitness: status === "refused" ? recorder.name : null,
      excusedByName: status === "excused" ? gm.name : null,
      excusedReason: ev.excuse ?? null,
      excusedAt: status === "excused" ? zoned(tz, addDays(date, 1), "15:10") : null,
      recordedByName: recorder.name,
      createdAt: signedAt,
    });
  };

  const entryFor = (ev: Ev | undefined, call: string): EntryLike => {
    if (!ev) {
      const graceLate = rand() < 0.07;
      const mins = 2 + Math.floor(rand() * 4);
      return {
        arrival: graceLate ? "late" : "on_time",
        minutesLate: graceLate ? mins : null,
        scheduledStart: call,
        arrivedAt: graceLate ? sh(call, mins) : null,
        uniformOk: true,
        uniformMissing: [],
        coverName: null,
      };
    }
    if (ev.type === "late")
      return { arrival: "late", minutesLate: ev.min!, scheduledStart: call, arrivedAt: sh(call, ev.min!), uniformOk: true, uniformMissing: [], coverName: null };
    if (ev.type === "dress_code") return { arrival: "on_time", minutesLate: null, scheduledStart: call, arrivedAt: null, uniformOk: false, uniformMissing: ev.missing ?? [], coverName: null };
    if (ev.type === "no_show") return { arrival: "no_show", minutesLate: null, scheduledStart: call, arrivedAt: null, uniformOk: null, uniformMissing: [], coverName: null };
    return { arrival: "swap_unapproved", minutesLate: null, scheduledStart: call, arrivedAt: null, uniformOk: null, uniformMissing: [], coverName: ev.cover ?? null };
  };

  for (let d = LINEUP_DAYS; d >= 1; d--) {
    const date = addDays(today, -d);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    const shifts: ("lunch" | "dinner")[] = dow === 0 || dow === 6 ? ["lunch", "dinner"] : ["dinner"];
    for (const shift of shifts) {
      const id = crypto.randomUUID();
      const call = DEFAULT_CALL[shift];
      const runner = managers[(d + (shift === "lunch" ? 1 : 0)) % managers.length]!;
      const todays = story.events.filter((e) => e.d === d && shift === "dinner");
      const working = staff.filter((m) => m.hireDate <= date && (todays.some((e) => e.name === m.name) || rand() < (shift === "lunch" ? 0.45 : 0.72)));
      lineups.push({
        id,
        storeId,
        businessDate: date,
        shift,
        callTime: call,
        status: "signed",
        topics: shift === "dinner" ? TOPICS[(d + si) % TOPICS.length]! : "Brunch: bottomless mimosa cap is two hours. Push the crab Benedict.",
        runById: runner.id,
        runByName: runner.name,
        runByRole: runner.role,
        signature: sig(runner.name, rand),
        signedAt: zoned(tz, date, sh(call, 18)),
        createdAt: zoned(tz, date, sh(call, -5)),
      });
      working.forEach((m, i) => {
        const ev = todays.find((e) => e.name === m.name);
        const eid = crypto.randomUUID();
        const e = entryFor(ev, call);
        entries.push({ id: eid, lineupId: id, memberId: m.id, name: m.name, role: m.role, sort: i, ...e });
        if (ev) {
          eventRow(ev, m, date, { ...e, id: eid }, id, runner, shift);
          placed.add(ev);
        }
      });
    }
  }
  // Older strikes (before the seeded line-ups) are on record without a line-up sheet.
  for (const ev of story.events) {
    if (placed.has(ev)) continue;
    const m = byName.get(ev.name);
    if (!m) continue;
    const recorder = managers[ev.d % managers.length]!;
    eventRow(ev, m, addDays(today, -ev.d), entryFor(ev, DEFAULT_CALL.dinner), null, recorder, "dinner");
  }
  if (lineups.length) await insertChunked(s.lineups, lineups);
  if (entries.length) await insertChunked(s.lineupEntries, entries, 80);
  const evIds = events.map((e) => ({ ...e, id: crypto.randomUUID() }));
  if (evIds.length) await insertChunked(s.conductEvents, evIds);

  // Write-ups, built from each person's strikes in order.
  const acts: (typeof s.disciplinaryActions.$inferInsert)[] = [];
  for (const a of story.actions) {
    const m = byName.get(a.name);
    if (!m) continue;
    const strikes = evIds
      .filter((e) => e.memberId === m.id && e.status !== "excused")
      .sort((x, y) => x.businessDate.localeCompare(y.businessDate))
      .slice(0, a.strikes);
    const date = addDays(today, -a.d);
    const issuer = gm;
    const signed = a.status !== "awaiting_signatures";
    acts.push({
      orgId,
      storeId,
      memberId: m.id,
      memberName: m.name,
      step: a.step,
      strikeCount: a.strikes,
      eventIds: strikes.map((e) => e.id),
      businessDate: date,
      status: a.status,
      notes: a.notes ?? "",
      managerName: signed ? issuer.name : null,
      managerRole: signed ? issuer.role : null,
      managerSignature: signed ? sig(issuer.name, rand) : null,
      managerSignedAt: signed ? zoned(tz, date, "17:05") : null,
      employeeSignature: signed ? sig(m.name, rand) : null,
      employeeSignedAt: signed ? zoned(tz, date, "17:08") : null,
      createdAt: zoned(tz, date, "16:25"),
    });
  }
  if (acts.length) await db.insert(s.disciplinaryActions).values(acts);
}

const TOPICS = [
  "Focus: suggest a half bottle at every two top. 86 the halibut. Party of 12 at 7:30, nut allergy on table 4.",
  "VIP: the Hendersons, table 21, anniversary, dessert on us. Feature: Dover sole tableside.",
  "Upsell the reserve pours. Check average target tonight is the store target plus $4.",
  "Private dining at 6:00, 24 guests, set menu. Two servers off the floor until 8.",
  "Prebus every course. Second round drink offer within four minutes of the first.",
  "New spring cocktail: Rhubarb Collins. Everyone tastes it at line up.",
  "Patio opens at 5:00. Heaters on, blankets in the host stand.",
];
