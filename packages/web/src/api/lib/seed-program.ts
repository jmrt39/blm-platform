// Demo training, grades, quizzes, updates, guest quotes, rewards, certifications, log book and slow nights.
import { eq } from "drizzle-orm";
import * as s from "../database/schema";
import { db } from "../database";
import { insertChunked } from "./core";
import { autoTagUntagged } from "./surveys";
import { addDays, zoned } from "./time";
import { isManagementRole } from "../../shared/domain";
import { cashBonus, targetForRole } from "../../shared/metrics";
import { PASS_MARK, monthOf, requiredCerts, seasonOf, type Question } from "../../shared/program";
import { modulesFor } from "../../shared/library/modules";
import { QUIZ_BY_SLUG, scoreQuiz } from "../../shared/library/quizzes";
import { RUBRIC_BY_SLUG, gradeAverage } from "../../shared/library/rubrics";

type Member = { id: string; name: string; role: string; hireDate: string; tenure: number; ppa?: number; isTrainer: boolean };

/** Seed baselines are per cover; a server ticket carries about 1.07 covers, a bar ticket about 0.66 (bar tabs split often). */
const sptOf = (m: Member) => (m.ppa == null ? null : m.ppa * (m.role === "bartender" ? 0.66 : 1.07));
type Store = { id: string; name: string; si: number; ticketTarget: number; roster: Member[] };

const SELL = ["server", "bartender", "sommelier"];

/** Quiz answers for someone who gets each question right with probability p. */
function answer(qs: Question[], p: number, rand: () => number) {
  const out: Record<string, number> = {};
  for (const q of qs) {
    if (rand() < p) out[q.id] = q.answer;
    else {
      const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.answer);
      out[q.id] = wrong[Math.floor(rand() * wrong.length)]!;
    }
  }
  return out;
}

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export async function seedProgram(opts: {
  orgId: string;
  stores: Store[];
  tz: string;
  today: string;
  rand: () => number;
  sig: (name: string, rand: () => number) => string;
}) {
  const { orgId, stores, tz, today, rand, sig } = opts;
  const allStoreIds = stores.map((x) => x.id);
  const progress: (typeof s.trainingProgress.$inferInsert)[] = [];
  const grades: (typeof s.grades.$inferInsert)[] = [];
  const attempts: (typeof s.quizAttempts.$inferInsert)[] = [];
  const certs: (typeof s.certifications.$inferInsert)[] = [];
  const goals: (typeof s.hourGoals.$inferInsert)[] = [];
  const feedback: (typeof s.guestFeedback.$inferInsert)[] = [];
  const awards: (typeof s.rewardAwards.$inferInsert)[] = [];
  const logs: (typeof s.logEntries.$inferInsert)[] = [];
  const slow: (typeof s.slowNightActions.$inferInsert)[] = [];
  const calls: (typeof s.coverageCalls.$inferInsert)[] = [];
  const at = (daysAgo: number, hm: string) => zoned(tz, addDays(today, -daysAgo), hm);

  for (const st of stores) {
    const managers = st.roster.filter((m) => isManagementRole(m.role));
    const gm = managers[0]!;
    const staff = st.roster.filter((m) => !isManagementRole(m.role));
    const by = (n: string) => st.roster.find((m) => m.name === n);
    const base = { orgId, storeId: st.id };

    // ── Training, quizzes and floor grades ───────────────────────────────
    for (const m of staff) {
      const mods = modulesFor(m.role);
      const seller = SELL.includes(m.role);
      // Skill: veterans and strong sellers score higher.
      const spt = sptOf(m);
      const rel = spt != null ? (spt - targetForRole(m.role, st.ticketTarget)) / 10 : 0;
      const skill = Math.max(0.55, Math.min(0.97, 0.78 + rel * 0.08 + Math.min(m.tenure, 720) / 720 * 0.12));
      // How far through the library they are.
      const reach = m.tenure < 15 ? 2 : m.tenure < 30 ? 5 : m.tenure < 60 ? 8 : m.tenure < 120 ? mods.length - 2 : mods.length;
      const trainer = st.roster.find((r) => r.isTrainer && r.role === (m.role === "barback" ? "bartender" : m.role === "sommelier" ? "server" : m.role)) ?? gm;
      mods.forEach((mod, i) => {
        if (i >= reach) return;
        const span = Math.max(3, Math.min(m.tenure - 1, 300));
        const day = Math.max(1, Math.round(m.tenure - 1 - (span * (i + 1)) / (mods.length + 1)));
        const readAt = at(day, "15:10");
        let quizBest = 0;
        if (mod.quiz) {
          const q = QUIZ_BY_SLUG[mod.quiz]!;
          let tries = 0;
          while (tries < 3 && quizBest < PASS_MARK) {
            const ans = answer(q.questions, Math.min(0.98, skill + tries * 0.12), rand);
            const score = scoreQuiz(q.questions, ans);
            const correct = q.questions.filter((x) => ans[x.id] === x.answer).length;
            attempts.push({
              ...base,
              memberId: m.id,
              memberName: m.name,
              quiz: q.slug,
              updateId: null,
              answers: ans,
              correct,
              total: q.questions.length,
              score,
              passed: score >= PASS_MARK,
              takenAt: at(Math.max(0, day - tries), `15:${String(30 + tries * 9).padStart(2, "0")}`),
            });
            quizBest = Math.max(quizBest, score);
            tries++;
            // The newest hires leave the odd quiz unpassed so their board shows work to do.
            if (m.tenure < 30 && i === reach - 1) break;
          }
        }
        let gradeBest = 0;
        if (mod.rubric && mod.rubric !== "floor-service") {
          const r = RUBRIC_BY_SLUG[mod.rubric]!;
          const scores = Object.fromEntries(r.criteria.map((c) => [c.key, clamp(3 + skill * 2 - 0.9 + (rand() - 0.5) * 1.4)]));
          gradeBest = gradeAverage(scores);
          grades.push({
            ...base,
            memberId: m.id,
            memberName: m.name,
            memberRole: m.role,
            rubric: r.slug,
            module: r.module,
            businessDate: addDays(today, -Math.max(0, day - 1)),
            scores,
            notes: {},
            summary: gradeBest >= 4 ? "Clean, confident and to spec." : "Getting there. Re-run this one next week.",
            average: gradeBest,
            graderId: trainer.id,
            graderName: trainer.name,
            graderRole: trainer.role,
            graderSignature: sig(trainer.name, rand),
            traineeSignature: r.kind === "skill" ? sig(m.name, rand) : null,
            approvedAt: at(Math.max(0, day - 1), "16:05"),
          });
        }
        const quizOk = !mod.quiz || quizBest >= PASS_MARK;
        const gradeOk = !mod.rubric || mod.rubric === "floor-service" || gradeBest >= 3.5;
        // Leave a few finished modules waiting for a trainer's signature.
        const waiting = quizOk && gradeOk && (i === reach - 1 ? rand() < (m.tenure < 60 ? 0.7 : 0.3) : rand() < 0.04);
        const signed = quizOk && gradeOk && !waiting && mod.rubric !== "floor-service";
        progress.push({
          ...base,
          memberId: m.id,
          module: mod.slug,
          readAt,
          ...(signed
            ? {
                signedOffAt: at(Math.max(0, day - 2), "16:20"),
                signedOffById: trainer.id,
                signedOffByName: trainer.name,
                signedOffByRole: trainer.role,
                trainerSignature: sig(trainer.name, rand),
                traineeSignature: sig(m.name, rand),
              }
            : {}),
        });
      });

      // Floor-service grades on the six competencies: two to four per seller, most recent first.
      if (seller) {
        const n = m.tenure < 15 ? 1 : m.tenure < 60 ? 2 : 3 + Math.floor(rand() * 2);
        const floorGrader = managers[Math.floor(rand() * managers.length)]!;
        for (let g = 0; g < n; g++) {
          const daysAgo = Math.min(m.tenure - 1, 6 + g * 16 + Math.floor(rand() * 6));
          const r = RUBRIC_BY_SLUG["floor-service"]!;
          const lift = (n - g) * 0.08; // improving over time
          const scores = Object.fromEntries(
            r.criteria.map((c) => {
              let v = 1.8 + skill * 2.5 + lift + (rand() - 0.5) * 1.3;
              if (c.key === "upsell" && rel < 0) v -= 1.1;
              if (c.key === "pos" && rel < -0.5) v -= 0.6;
              return [c.key, clamp(v)];
            }),
          );
          const avg = gradeAverage(scores);
          const notes: Record<string, string> = {};
          if (scores.upsell! <= 3) notes.upsell = "Asked “anything to drink?” twice. Lead with a choice: “the Sancerre or the Malbec tonight?”";
          if (scores.greeting! >= 5) notes.greeting = "Greeted inside 40 seconds and used the guest's name from the reservation note.";
          grades.push({
            ...base,
            memberId: m.id,
            memberName: m.name,
            memberRole: m.role,
            rubric: "floor-service",
            module: "steps-of-service",
            businessDate: addDays(today, -daysAgo),
            tableNo: String(10 + Math.floor(rand() * 30)),
            scores,
            notes,
            summary:
              avg >= 4.3
                ? "Sets the standard. Use this table as the example at line up."
                : avg >= 3.5
                  ? "Solid service. Coaching point: wine with the entrée at every table."
                  : "Friendly and fast, but the upsell isn't there yet. Shadow a top seller for one turn.",
            average: avg,
            graderId: floorGrader.id,
            graderName: floorGrader.name,
            graderRole: floorGrader.role,
            graderSignature: sig(floorGrader.name, rand),
            traineeSignature: sig(m.name, rand),
            approvedAt: at(daysAgo, "21:40"),
          });
        }
        // Sign off steps of service once the floor grade is there (not for the newest hires).
        const sos = progress.find((p) => p.memberId === m.id && p.module === "steps-of-service");
        const best = Math.max(...grades.filter((g) => g.memberId === m.id && g.rubric === "floor-service").map((g) => g.average));
        if (sos && best >= 3.5 && m.tenure >= 45)
          Object.assign(sos, {
            signedOffAt: at(10, "16:20"),
            signedOffById: trainer.id,
            signedOffByName: trainer.name,
            signedOffByRole: trainer.role,
            trainerSignature: sig(trainer.name, rand),
            traineeSignature: sig(m.name, rand),
          });
        // Advanced wine challenge for the stronger sellers.
        if (m.tenure > 200 && rand() < 0.7) {
          const q = QUIZ_BY_SLUG["q-somm-challenge"]!;
          const ans = answer(q.questions, skill - 0.05, rand);
          const score = scoreQuiz(q.questions, ans);
          attempts.push({
            ...base,
            memberId: m.id,
            memberName: m.name,
            quiz: q.slug,
            updateId: null,
            answers: ans,
            correct: q.questions.filter((x) => ans[x.id] === x.answer).length,
            total: q.questions.length,
            score,
            passed: score >= PASS_MARK,
            takenAt: at(4 + Math.floor(rand() * 20), "14:50"),
          });
        }
      }

      // Hours goals.
      goals.push({
        ...base,
        memberId: m.id,
        weeklyHours: m.tenure < 60 ? 36 : [24, 28, 30, 32, 34, 36, 38][Math.floor(rand() * 7)]!,
        volunteerEarly: false,
        crossStore: rand() < 0.35,
        updatedAt: at(30, "12:00"),
      });
    }
    const goal = (n: string, g: Partial<{ weeklyHours: number; volunteerEarly: boolean; crossStore: boolean }>) => {
      const m = by(n);
      const row = m && goals.find((x) => x.memberId === m.id);
      if (row) Object.assign(row, g);
    };

    // ── Certifications ───────────────────────────────────────────────────
    const certFor = (m: Member, kind: string, expiresIn: number | null, issuer: string) => {
      const life = kind === "food_handler" ? 1095 : kind === "alcohol" ? 730 : 0;
      const issuedOn = expiresIn == null ? addDays(today, -Math.min(m.tenure + 200, 600)) : addDays(today, expiresIn - life);
      certs.push({
        ...base,
        memberId: m.id,
        kind,
        issuer,
        number: `${kind === "food_handler" ? "FH" : kind === "alcohol" ? "TIPS" : "W"}-${Math.floor(100000 + rand() * 899999)}`,
        issuedOn,
        expiresOn: expiresIn == null ? null : addDays(today, expiresIn),
        recordedByName: gm.name,
      });
    };
    const special = (<Record<string, Record<string, number | "missing">>[]>[
      { "Sam Whitaker": { alcohol: 12 }, "Theo Grant": { food_handler: "missing" }, "Camille Rhodes": { alcohol: "missing" }, "Owen Price": { food_handler: 26 } },
      { "Jamal Harris": { alcohol: -5 }, "Mateo Silva": { alcohol: 21 }, "Lena Novak": { food_handler: "missing", alcohol: "missing" } },
      { "Ines Ferreira": { food_handler: 9 }, "Diego Herrera": { alcohol: "missing" } },
    ])[st.si]!;
    for (const m of st.roster) {
      for (const kind of requiredCerts(m.role)) {
        const sp = special[m.name]?.[kind];
        if (sp === "missing") continue;
        const exp = typeof sp === "number" ? sp : 90 + Math.floor(rand() * 600);
        certFor(m, kind, exp, kind === "food_handler" ? "ServSafe Food Handler" : "TIPS On-Premise");
      }
    }
    const somm = st.roster.find((m) => m.role === "sommelier");
    if (somm) certFor(somm, st.si === 0 ? "wset2" : "cms_intro", null, st.si === 0 ? "WSET" : "Court of Master Sommeliers");

    // ── Guest quotes naming staff ────────────────────────────────────────
    // Tuple: days ago, source, guest, stars, words, names a manager tagged, extras.
    // Reviews with no names are left for the platform to tag itself, misspellings and all.
    type Opt = { pin?: boolean; ab?: boolean; url?: "google" | "yelp" | "tripadvisor"; replied?: boolean };
    // Demo stores are fictional, so "where it was posted" opens a real platform search for the name instead of a dead link.
    const q = encodeURIComponent(st.name);
    const demoUrl = {
      google: `https://www.google.com/maps/search/?api=1&query=${q}`,
      yelp: `https://www.yelp.com/search?find_desc=${q}`,
      tripadvisor: `https://www.tripadvisor.com/Search?q=${q}`,
    };
    const Q = (<[number, string, string, number | null, string, string[], Opt?][][]>[
      [
        [1, "Google", "Leah M.", 5, "Camile took such good care of us. She knew the menu inside out and the ribeye was perfect.", []],
        [2, "Survey", "", 4, "Our server Kris had great cocktail ideas. A little slow on the check at the end.", []],
        [2, "OpenTable", "Margaret L.", 5, "Maya remembered our anniversary from last year and had the Barolo decanted before we sat down. Setting the standard, honestly.", ["Maya Collins"], { pin: true }],
        [3, "Survey", "", 5, "Our server Mya was wonderful with my father, who uses a walker. Found us the quietest table.", []],
        [4, "Resy", "Paul T.", 5, "Kamille went above and beyond for my mother's 80th. Brought out a candle and a card the whole team signed.", ["Camille Rhodes"], { ab: true }],
        [5, "Google", "Tom R.", 5, "Chris at the bar walked me through three ryes and nailed the Old Fashioned on the second try. Best bar in town.", ["Chris Ortega"]],
        [6, "OpenTable", "", 3, "Food was good and service was fine. Nobody checked on us after the entree though.", []],
        [9, "Resy", "Priya & Dev", 5, "Sam suggested the wagyu with the Malbec and he was right. Didn't feel upsold, felt looked after.", ["Sam Whitaker"]],
        [12, "Comment card", "", 4, "Camille is new but you'd never know. Checked on us after two bites and fixed a cold side in a minute.", ["Camille Rhodes"]],
        [20, "Yelp", "Andrea K.", 5, "Elena paired every course for our table of six. Always finding ways to go above and beyond.", ["Elena Vasquez"], { ab: true }],
        [27, "Email", "J. Whitfield", 5, "Nadia handled my daughter's nut allergy perfectly and the kitchen came out to confirm. Thank you.", ["Nadia Haddad"]],
        [41, "OpenTable", "Grace H.", 5, "Maya and Jordan made a business dinner look effortless.", ["Maya Collins", "Jordan Lee"]],
        // Chris has been here longest of the two the owner asked about (1120 days vs Camille's 24). Bar, and the trainer.
        [3, "Google", "Natalie B.", 5, "Chris behind the bar remembered my usual from back in the spring and had a new mezcal ready for me to try. He was training a new bartender at the same time and never missed a beat.", ["Chris Ortega"], { url: "google" }],
        [8, "Yelp", "Owen G.", 4, "Chris made the best Negroni I've had outside Florence and talked us through the amaro list. Only gripe: the bar got so loud by 8 we could barely hear him.", ["Chris Ortega"], { url: "yelp", replied: true }],
        // Opportunities to improve.
        [1, "Yelp", "Rachel S.", 2, "We waited 45 minutes for mains on a Tuesday and nobody explained why. The steak arrived lukewarm.", [], { url: "yelp" }],
        [4, "Google", "Kevin D.", 3, "Lovely room, but the wine we ordered was forgotten and we had to ask twice. Felt overpriced for what it was.", [], { url: "google" }],
        [10, "Tripadvisor", "", 3, "Our reservation was for 7:30 and we were seated late, at 8:05, at a bad table by the kitchen door.", [], { url: "tripadvisor" }],
      ],
      [
        [1, "Google", "Ben S.", 5, "Olivia knew the whole wine list cold and found us a bottle under $70 that drank like double that.", ["Olivia Chen"], { pin: true }],
        [2, "Survey", "", 5, "Isak was so patient with our big group and split the checks without a single sigh.", []],
        [6, "Resy", "Hannah P.", 4, "Isaac was lovely. Kiera's espresso martini is the best in the city.", ["Isaac Turner", "Kiera Walsh"]],
        [14, "Tripadvisor", "M. Duarte", 5, "Julien turned our birthday into a tasting. Always finding ways to go above and beyond.", ["Julien Moreau"], { ab: true }],
        [23, "Comment card", "", 5, "Lena is brand new and so warm. Ask for her section.", ["Lena Novak"]],
        [33, "OpenTable", "Carla V.", 5, "Olivia again. Remembered how I like my martini from a visit in July.", ["Olivia Chen"]],
      ],
      [
        [2, "Survey", "", 5, "Lukas was the best server we've had in years. Ema at the host stand was lovely too.", []],
        [3, "OpenTable", "The Nguyens", 5, "Lucas read our table perfectly: quick for the kids, slow for the wine. Setting the standard.", ["Lucas Bennett"], { pin: true }],
        [8, "Google", "R. Patel", 5, "Emma recommended the dry aged ribeye and the Rioja Reserva. Perfect.", ["Emma Fischer"]],
        [15, "Resy", "Sam O.", 5, "Finn built us a smoky mezcal flight off menu. What a bar.", ["Finn O'Connor"]],
        [26, "Yelp", "Dana W.", 4, "Aaliyah fixed a mix up with our order before we even noticed.", ["Aaliyah Jordan"]],
        [38, "Email", "K. Moore", 5, "Zoe and Mia made our engagement dinner unforgettable.", ["Zoe Alvarez", "Mia Russo"]],
      ],
    ])[st.si]!;
    for (const [d, source, guestName, rating, quote, names, opt = {}] of Q) {
      const ms = names.map(by).filter((m): m is Member => !!m);
      const tagged = ms.length > 0;
      // Older reviews were read and seen long ago; the last few days are still new to the manager and the colleague.
      const old = d >= 7;
      feedback.push({
        ...base,
        source,
        guestName,
        rating,
        quote,
        receivedOn: addDays(today, -d),
        memberIds: ms.map((m) => m.id),
        memberNames: ms.map((m) => m.name),
        tagSource: tagged ? "manager" : null,
        taggedByName: tagged ? gm.name : null,
        taggedAt: tagged ? at(Math.max(0, d - 1), "10:30") : null,
        readAt: tagged ? at(Math.max(0, d - 1), "10:30") : null,
        seenBy: old ? ms.map((m) => m.id) : [],
        aboveBeyond: !!opt.ab,
        aboveBeyondByName: opt.ab ? gm.name : null,
        pinnedOn: opt.pin ? today : null,
        pinnedByName: opt.pin ? gm.name : null,
        recordedByName: gm.name,
        externalUrl: opt.url ? demoUrl[opt.url] : null,
        respondedAt: opt.replied ? at(Math.max(0, d - 1), "11:15") : null,
        respondedByName: opt.replied ? gm.name : null,
      });
    }

    // Older named reviews, so the Every 10 reward has someone there and someone close.
    const OLD: [string, number, string[]][] = [
      ["Maya Collins", 10, [
        "Maya steered us to the halibut and a Chablis we'd never have picked. Perfect night.",
        "Ask for Maya. Warm, sharp and never rushed us.",
        "Maya noticed my wife was cold and had us moved before we asked.",
        "Third visit, third time with Maya. She remembers everything.",
        "Maya made our client dinner feel easy. We'll be back.",
        "Our server Maya knew every producer on the list.",
        "Maya handled a big birthday table like it was nothing.",
        "Maya suggested the tasting menu and paced it beautifully.",
        "Maya was attentive without hovering. Exactly right.",
        "Maya walked my dad through the whole menu with real patience.",
      ]],
      ["Sam Whitaker", 6, [
        "Sam knows his steaks. The dry aged strip was the call.",
        "Sam was quick, funny and spot on with the wine.",
        "Sam talked us into dessert and we're glad he did.",
        "Sam kept our table of eight moving without a hitch.",
        "Sam found us a gluten free option that didn't feel like a compromise.",
        "Sam made a first date go very well.",
      ]],
    ];
    const SRC = ["Google", "OpenTable", "Resy", "Yelp", "Comment card", "Email"];
    for (const [name, n, lines] of st.si === 0 ? OLD : []) {
      const m = by(name);
      if (!m) continue;
      for (let i = 0; i < n; i++) {
        const d = 48 + i * 11;
        feedback.push({
          ...base,
          source: SRC[i % SRC.length]!,
          guestName: "",
          rating: i % 4 === 3 ? 4 : 5,
          quote: lines[i % lines.length]!,
          receivedOn: addDays(today, -d),
          memberIds: [m.id],
          memberNames: [m.name],
          matches: [{ memberId: m.id, name: m.name, word: name.split(" ")[0]!, score: 1, how: "exact" }],
          tagSource: "auto",
          taggedAt: at(d - 1, "10:30"),
          readAt: at(d - 1, "10:30"),
          seenBy: [m.id],
          recordedByName: gm.name,
        });
      }
    }

    // ── Rewards already handed out ───────────────────────────────────────
    const last = monthOf(addDays(monthOf(today).start, -1));
    const sellers = staff.filter((m) => m.ppa != null && m.tenure > 30).sort((a, b) => sptOf(b)! - sptOf(a)!);
    const t = st.ticketTarget;
    for (const m of sellers) {
      const amount = cashBonus(sptOf(m)!, targetForRole(m.role, t));
      if (amount)
        awards.push({ ...base, memberId: m.id, memberName: m.name, reward: "ads_bonus", period: last.key, amount, note: "", awardedByName: gm.name, awardedAt: at(6, "11:00") });
    }
    const top = sellers.find((m) => m.role !== "bartender");
    if (top)
      awards.push({ ...base, memberId: top.id, memberName: top.name, reward: "first_pick", period: last.key, amount: null, note: "First pick of next month's sections.", awardedByName: gm.name, awardedAt: at(6, "11:05") });
    const quoted = Q.find(([d]) => d >= 30);
    const qm = quoted && by(quoted[5][0]!);
    if (qm)
      awards.push({ ...base, memberId: qm.id, memberName: qm.name, reward: "guest_quote", period: last.key, amount: 50, note: "Gift card for the quote read at line up.", awardedByName: gm.name, awardedAt: at(Math.max(1, quoted![0] - 2), "16:00") });

    // ── Log book ─────────────────────────────────────────────────────────
    const L = (<[number, "lunch" | "dinner", "note" | "maintenance" | "incident", string, string, "open" | "resolved", string?][][]>[
      [
        [0, "dinner", "maintenance", "Walk-in cooler door gasket torn", "Bottom left corner of the gasket is split. Door doesn't seal unless you lean on it. Temps holding at 38°F for now.", "open"],
        [1, "dinner", "note", "Big Friday-level Tuesday", "142 covers, two VIP anniversaries. Camille ran section 4 solo for the first full turn and it was clean.", "resolved"],
        [4, "dinner", "incident", "Guest slipped near the bar rail", "Guest slipped on spilled ice near the bar rail around 8:40. No injury, declined medical. Area mopped and wet floor sign placed. Comped dessert.", "resolved", "Barback now sweeps the rail every 20 minutes on Friday and Saturday."],
        [9, "lunch", "maintenance", "Patio heater 3 won't light", "Pilot clicks, no flame. Tagged out of service.", "open"],
        [16, "dinner", "note", "Wine dinner sold out", "Barolo dinner on the 24th is full at 48. Waitlist of 11.", "resolved"],
      ],
      [
        [0, "dinner", "note", "Slow week forecast", "Harbor festival moved to next weekend. Expect light covers Tuesday through Thursday. See the slow night plan.", "resolved"],
        [2, "dinner", "maintenance", "Dish machine rinse temp low", "Final rinse reading 165°F, should be 180°F. Using sanitizer sink as backup. Hobart called.", "open"],
        [7, "dinner", "incident", "Guest allergy reaction (mild)", "Guest reported tingling after the crab cake starter; shellfish allergy was not on the ticket. Guest used own antihistamine, fine within 20 minutes. Meal comped.", "resolved", "Allergy modifier retrained at line up. Server regraded on POS accuracy."],
        [12, "lunch", "maintenance", "Host stand tablet cracked", "Corner crack, still works. Replacement ordered.", "resolved"],
      ],
      [
        [1, "dinner", "maintenance", "Ice machine slow", "Bar ice machine producing about half. Filter changed, watching it.", "open"],
        [3, "dinner", "note", "Private room booked for Saturday", "Chen family, 22 guests, set menu B, two bottles of the 2016 Rioja Gran Reserva held.", "resolved"],
        [10, "dinner", "incident", "Broken glass in the ice well", "Wine glass broke over the ice well at 7:15. Well burned and refilled, glass rack moved off the rail.", "resolved", "Burned and restocked in 6 minutes. Good job Finn."],
      ],
    ])[st.si]!;
    for (const [d, shift, kind, title, body, status, note] of L) {
      const author = managers[d % managers.length]!;
      logs.push({
        ...base,
        businessDate: addDays(today, -d),
        shift,
        kind,
        title,
        body,
        photoKey: null,
        status,
        authorName: author.name,
        authorRole: author.role,
        signature: kind === "incident" ? sig(author.name, rand) : null,
        resolvedByName: status === "resolved" && kind !== "note" ? gm.name : null,
        resolvedNote: note ?? null,
        resolvedAt: status === "resolved" && kind !== "note" ? at(Math.max(0, d - 1), "12:30") : null,
        createdAt: at(d, shift === "lunch" ? "14:30" : "23:15"),
      });
    }

    // ── Slow nights ──────────────────────────────────────────────────────
    if (st.si === 0) {
      goal("Nadia Haddad", { volunteerEarly: true, weeklyHours: 26 });
      goal("Maya Collins", { crossStore: true, weeklyHours: 38 });
      goal("Daniel Okafor", { weeklyHours: 36 });
      calls.push({ ...base, businessDate: addDays(today, 1), shift: "dinner", role: "bartender", hours: 6, note: "Tessa at a tasting. Need a closer.", postedByName: gm.name });
    }
    if (st.si === 1) {
      goal("Isaac Turner", { volunteerEarly: true, weeklyHours: 28 });
      goal("Sofia Marino", { crossStore: true, weeklyHours: 36 });
      goal("Olivia Chen", { crossStore: true, weeklyHours: 38 });
      goal("Jamal Harris", { weeklyHours: 34 });
    }
    if (st.si === 2) {
      goal("Ryan Doyle", { volunteerEarly: true });
      goal("Zoe Alvarez", { crossStore: true });
      calls.push({ ...base, businessDate: today, shift: "dinner", role: "server", hours: 6, note: "Emma out sick. Private room of 22 at 7:30.", postedByName: gm.name });
      calls.push({ ...base, businessDate: addDays(today, 2), shift: "dinner", role: "server", hours: 5, note: "Saturday second turn is heavier than forecast.", postedByName: gm.name });
    }
  }

  // Slow night history (needs every store's roster for sister store moves).
  const [bg, rv, ht] = stores;
  const find = (st: Store | undefined, n: string) => st?.roster.find((m) => m.name === n);
  const act = (st: Store | undefined, d: number, n: string, action: "voluntary_out" | "cut" | "sister_store" | "outreach" | "training", hours: number, to?: Store, detail = "") => {
    const m = find(st, n);
    if (!st || !m) return;
    const decider = st.roster.find((x) => isManagementRole(x.role))!;
    slow.push({
      orgId,
      storeId: st.id,
      businessDate: addDays(today, -d),
      shift: "dinner",
      memberId: m.id,
      memberName: m.name,
      action,
      hours,
      toStoreId: to?.id ?? null,
      toStoreName: to?.name ?? null,
      detail,
      decidedByName: decider.name,
      createdAt: at(d, "19:10"),
    });
  };
  act(rv, 2, "Isaac Turner", "voluntary_out", 3, undefined, "Volunteered. 41 covers by 7pm.");
  act(rv, 2, "Sofia Marino", "sister_store", 6, ht, "Covered a sick call at the Heights.");
  act(rv, 9, "Jamal Harris", "cut", 3, undefined, "Most hours over goal that week.");
  act(rv, 9, "Olivia Chen", "outreach", 2, undefined, "Called 14 VIPs, booked 3 tables and a 30 top for November.");
  act(rv, 16, "Isaac Turner", "voluntary_out", 2);
  act(rv, 16, "Mateo Silva", "training", 2, undefined, "Studied for TIPS renewal.");
  act(bg, 5, "Nadia Haddad", "voluntary_out", 2.5, undefined, "Volunteered.");
  act(bg, 12, "Daniel Okafor", "cut", 3);
  act(bg, 12, "Maya Collins", "sister_store", 6, rv, "Riverside short a closer.");
  act(ht, 7, "Ryan Doyle", "voluntary_out", 2);

  // ── Seasonal updates with their quizzes ────────────────────────────────
  const season = seasonOf(today);
  const exec = stores[0]!.roster.find((m) => m.role === "gm")!;
  const upd = (
    daysAgo: number,
    kind: string,
    title: string,
    body: string,
    items: { name: string; detail: string }[],
    quiz: Omit<Question, "id">[],
    roles: string[] = [],
    storeIds = allStoreIds,
  ) => {
    const id = crypto.randomUUID();
    return {
      id,
      orgId,
      storeIds,
      season,
      kind,
      title,
      body,
      items,
      roles,
      quiz: quiz.map((q, i) => ({ id: `${id.slice(0, 8)}-${i + 1}`, ...q })),
      authorName: exec.name,
      authorRole: exec.role,
      publishedAt: at(daysAgo, "10:00"),
    };
  };
  const ups = [
    upd(
      3,
      "menu",
      `${season.split(" ")[0]} menu: five new plates`,
      "The autumn menu goes live this week. Taste every plate at Thursday's line up. Know the story, the allergens, and the wine you'd pour with it.",
      [
        { name: "Roasted delicata squash", detail: "Brown butter, sage, pepitas, whipped ricotta. Contains dairy and seeds. Pair: Viognier." },
        { name: "Duck breast, cherry jus", detail: "Medium rare only, farro, charred radicchio. Gluten in the farro. Pair: Willamette Pinot Noir." },
        { name: "Braised short rib", detail: "Eight hour braise, celery root purée, gremolata. Dairy in the purée. Pair: Napa Cabernet." },
        { name: "Wild mushroom risotto", detail: "Carnaroli, porcini, parmesan, truffle oil. Vegetarian; vegan on request without butter and cheese." },
        { name: "Apple tarte tatin", detail: "Calvados caramel, crème fraîche. Gluten and dairy. Pair: late harvest Riesling." },
      ],
      [
        { q: "A guest at table 12 has a seed allergy. Which new plate needs a change?", choices: ["Short rib", "Delicata squash", "Duck breast", "Tarte tatin"], answer: 1, why: "The squash is finished with pepitas (pumpkin seeds)." },
        { q: "What do you pour with the duck breast?", choices: ["Napa Cabernet", "Viognier", "Willamette Pinot Noir", "Late harvest Riesling"], answer: 2, why: "Pinot's acidity and red fruit meet the cherry jus." },
        { q: "How is the duck cooked?", choices: ["To the guest's choice", "Medium rare only", "Well done", "Medium"], answer: 1, why: "Kitchen only fires it medium rare. Say so when you take the order." },
        { q: "Can the risotto be made vegan?", choices: ["No", "Yes, without butter and parmesan", "Only at lunch", "Yes, it already is"], answer: 1, why: "Ask the kitchen to finish it without butter and cheese." },
      ],
    ),
    upd(
      10,
      "wine",
      "Six new bottles by the glass",
      "Lead with these. Each one is priced to beat the house pour by $3 to $5 a glass, which is where spend per ticket moves.",
      [
        { name: "Domaine Vacheron Sancerre 2023", detail: "$19 / glass. Flinty, citrus. Oysters, crudo, goat cheese." },
        { name: "Bodegas Muga Reserva Rioja 2019", detail: "$17 / glass. Cherry, vanilla, leather. Lamb, short rib." },
        { name: "Château de Beaucastel Côtes du Rhône 2021", detail: "$15 / glass. Garrigue, plum. Duck, mushrooms." },
        { name: "Billecart Salmon Brut Réserve NV", detail: "$24 / glass. Celebrations; offer it to every anniversary note." },
      ],
      [
        { q: "Which by the glass wine do you offer an anniversary table first?", choices: ["Rioja Reserva", "Sancerre", "Billecart Salmon", "Côtes du Rhône"], answer: 2, why: "Champagne for every celebration note on the reservation." },
        { q: "A guest orders oysters. Your first wine suggestion?", choices: ["Sancerre", "Rioja", "Côtes du Rhône", "Napa Cabernet"], answer: 0, why: "Flinty Sauvignon Blanc and oysters is the classic match." },
        { q: "Why lead with these six?", choices: ["They're older", "They lift spend per ticket by $3 to $5 a glass", "The owner likes them", "They're cheaper"], answer: 1, why: "A better glass is the easiest upsell there is." },
      ],
      ["server", "bartender", "sommelier"],
    ),
    upd(
      18,
      "service",
      "Holiday party season: how we book them",
      "Private event enquiries go to the GM within one hour. Take name, date, headcount and budget; never quote a price. Every booked party over 20 guests pays a $40 spiff to the person who took the call.",
      [],
      [],
    ),
  ];
  const reads: (typeof s.updateReads.$inferInsert)[] = [];
  for (const u of ups) {
    for (const st of stores) {
      for (const m of st.roster) {
        if (isManagementRole(m.role) || (u.roles.length && !u.roles.includes(m.role))) continue;
        const age = Math.round((Date.now() - u.publishedAt.getTime()) / 86400000);
        const chance = m.tenure < 30 ? 0.5 : st.si === 1 ? 0.7 : 0.88;
        if (rand() > chance) continue;
        const d = Math.max(0, age - 1 - Math.floor(rand() * Math.max(1, age - 1)));
        reads.push({ updateId: u.id, memberId: m.id, readAt: at(d, "15:20") });
        if (u.quiz.length && rand() < 0.8) {
          const ans = answer(u.quiz, 0.82, rand);
          const score = scoreQuiz(u.quiz, ans);
          attempts.push({
            orgId,
            storeId: st.id,
            memberId: m.id,
            memberName: m.name,
            quiz: `u:${u.id}`,
            updateId: u.id,
            answers: ans,
            correct: u.quiz.filter((x) => ans[x.id] === x.answer).length,
            total: u.quiz.length,
            score,
            passed: score >= PASS_MARK,
            takenAt: at(d, "15:35"),
          });
        }
      }
    }
  }

  await db.insert(s.updates).values(ups);
  await insertChunked(s.updateReads, reads, 120);
  await insertChunked(s.trainingProgress, progress, 60);
  await insertChunked(s.grades, grades, 40);
  await insertChunked(s.quizAttempts, attempts, 60);
  await insertChunked(s.certifications, certs);
  await insertChunked(s.hourGoals, goals);
  // Link each demo store's Google and Yelp pages (a search, since the stores are fictional). The rest stay blank to show the gap.
  for (const st of stores) {
    const q = encodeURIComponent(st.name);
    await db
      .update(s.stores)
      .set({ reviewLinks: { Google: `https://www.google.com/maps/search/?api=1&query=${q}`, Yelp: `https://www.yelp.com/search?find_desc=${q}` } })
      .where(eq(s.stores.id, st.id));
  }
  await insertChunked(s.guestFeedback, feedback);
  // Let the platform tag the reviews nobody named, the way it does for new ones.
  for (const st of stores) await autoTagUntagged(st.id);
  await insertChunked(s.rewardAwards, awards);
  await insertChunked(s.logEntries, logs);
  await insertChunked(s.slowNightActions, slow);
  if (calls.length) await insertChunked(s.coverageCalls, calls);
}
