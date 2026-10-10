# Task: Checkpoint B — the rest of the platform

## Done earlier
- Checkpoint A (sign-in, stores, checklists, team, shift report, reports) + conduct/line-up/discipline.
- Font fix: Bodoni pinned to opsz 18 (display, wt 500) / opsz 11 (figures, wt 600) in styles.css.

## Checkpoint B scope (from approved plan v1.1)
Training library (14 modules), floor grading (1–5 stars, six competencies + skills rubrics, both sign),
knowledge checks/quizzes (incl. hard wine questions), seasonal updates (continuing ed, read receipts),
guest feedback ("Setting the standard", quotes naming staff, pin to line-up), Recognition & Rewards
(exactly 8 incentives, $78 ADS target), certifications (food handler/alcohol, 30-day alerts),
mobile app (staff), Sign in button on bottomlinemultiplied.com (site not in this sandbox → tell user).

## Decisions
- Library content (modules, rubrics, module quizzes, rewards) = constants in src/shared/library/*. BLM builds
  the program per client; owners don't edit modules in v1. Updates + their quizzes are DB (manager-authored).
- Module done = read + quiz passed (≥80%) + exercise grade avg ≥3.5 (if rubric) → trainer/manager signs off, trainee signs.
- Rating formula unchanged (user set 25 conduct / 75 performance on sales, check avg, checklists).
- Rewards computed from data; managers record awards.

## Files
- schema: trainingProgress, grades, quizAttempts, updates, updateReads, guestFeedback, rewardAwards, certifications
- api routes: training.ts, grading.ts, quizzes.ts, updates.ts, guests.ts, rewards.ts; lib/program.ts; lib/seed-program.ts
- web: pages training/grading/quizzes/updates/guests/rewards; components/program-bits; queries per feature
- nav groups; member profile section; home blocks; line-up board (pinned quote, update, 86)
- mobile: staff app (PIN sign-in, Today, Training, Quizzes, Updates, Me)

## Progress
- [ ] shared library content
- [ ] schema + push
- [ ] api routes
- [ ] seed
- [ ] web pages
- [ ] nav/profile/home/lineup integration
- [ ] mobile
- [ ] lint/tsc/build/browser test/deliver

## Interrupt: owner-home feedback (10 screenshots, 2026-10-07) — do first
1. Numbers consistent: gap from same rounded values; consistent rounding; explain red (below store target); "On-time checklist completion" w/ denominator.
2. Terminology: Net sales / Spend per guest / Average check / Server spend per guest / On-time checklist completion. "How calculated" control (source, period, formula, exclusions).
3. $ annual opportunity → "Modeled annual sales opportunity — not verified loss or guaranteed improvement", expandable assumptions; tenure-aware; "Priority coaching opportunities" not "bottom two".
4. Mobile store comparison = one card per store; desktop table w/ sticky store column + scroll cue.
5. Action panel (Priority/Action, links to exact record) right under top cards; drop duplicate "Needs attention".
6. Checklist dates: business date of 1am closing, timezone, early submission validity, submitted vs verified meaning, owner of incomplete, N/A with reason.

## Checkpoint B progress (paused mid-API)
- [x] shared library content (program.ts, library/modules, rubrics, quizzes, rewards)
- [x] schema + push (incl. lineups.specials/eightySix/vips, logEntries)
- [~] api routes: training, grading, quizzes, updates, guests, rewards, certs, logbook written; NOT yet in router; preshift + insights not written

## Request 2026-10-09 (current)
1. Quizzes live + demo as fully functional as possible (finish Checkpoint B + owner-home feedback).
2. Never compare top/bottom servers when they're newest hires (tenure < 30d excluded/flagged).
3. Slow-night cuts feature (protect hours without hurting profit) — suggest + build.
4. Skeleton: blank org setup / plug-and-play onboarding for new restaurants.
5. Advice doc: where to export, how Justin customizes, which AIs.
6. Website (/home/user/blm-website, cloned from github jmrt39/BottomLineMultipliedWebsite-2428): audit = 6 shifts / 2 weeks
   (2 weekdays, 2 Fri, 2 Sat), undercover new hire; report; $150k guarantee (keep $10k audit); pay-as-you-go 10k+75k=85k
   or 75k upfront; yr1 platform free; 1-day training; yr2 $350–450/mo; 5–6 wk timeline. Show formula on every gap.
7. 90-second cut of platform-demo-v3.mp4 (3:04).

### Status (2026-10-10)
- [x] 1. Quizzes live, Checkpoint B pages, owner-home feedback (spend per guest shows "—" with no report; grouped cert action; $ in actions).
- [x] 2. Ramping: under 30 days not ranked, shown separately, protected on slow nights (Lena Novak day 12, Camille Rhodes day 24).
- [x] 3. Slow nights: /slow board, principles, sort order, sister store redeploy, fairness ledger, hours goals, undo.
- [x] 4. Skeleton: setup form with spend per guest target, Getting started card (7 steps), /team/import CSV roster import with PINs.
- [x] 5. docs/go-to-market.md.
- [x] 6. Website: six shifts copy, new terms + guarantee, Sign in link (VITE_PLATFORM_URL), FAQ rewritten, sample audit formulas on every gap, totals reconciled ($249,116 / $173,799). Committed; push needs GitHub credentials.
- [x] 7. 90 s cut: /home/user/film90/1906-platform-demo-90s.mp4 (+720p), audio trimmed to match video; web copy in public/videos/platform-demo-90s.mp4.

## Request 2026-10-10 (b): spend per ticket + Implementation Studio
Decisions (user answered form):
- Spend per ticket replaces spend per guest EVERYWHERE: net sales ÷ tickets (checks) for targets, rankings, bonuses, opportunity model.
  Average check metric merged into it. Covers stay as volume. Bartender target share 0.4 (was 0.66 per guest).
  Demo targets: B&G $190, Riverside $178, Heights $198. Bonus tiers $150 at target, $200 at +$12, $250 at +$25.
  DB column stays ppa_target, TS key ticketTarget.
- Studio (/studio): BLM only (us), gated by BLM_STUDIO_CODE once per account -> studio_staff. Clients = orgs.
  Steps: Brief (audit findings priorities + owner preferences + targets) -> Materials (paste/upload docs, AI extracts) ->
  History (last year daily CSV per store, for on this day last year) -> Build (AI drafts from BLM standard copy; review/approve) -> Publish (compile org program).
- Each org starts from a copy of the BLM standard library. Published program stored per org (org_programs). No row = BLM standard.
- AI drafts quizzes, floor exercises (repeatable cadence), POS knowledge checks; nothing reaches client until approved + published.

Progress
- [x] ticket conversion
- [x] schema (studio_staff, implementations, sources, content_items, org_programs, history_days)
- [x] library per org (api loader + web useLibrary)
- [x] history import + YoY home/reports + demo seed history
- [x] studio api (clients, brief, sources+extract, drafts, review, publish)
- [x] studio web
- [x] repeatable floor exercises, talking points on line-up
- [x] verify in browser (Playwright): Studio walk through + publish on Harbor House, client owner view, YoY home/reports, line up brief, fresh demo seed
- [ ] push (blocked: fine grained token lacks Contents write on blm-platform and BottomLineMultipliedWebsite-2428)
Open
- Standard library copy (shared/library) still has em dashes and is written around 1906; Studio flags literal "1906" items.
- Optional: POS checks as their own group on /quizzes, history step on setup checklist, move parseHistory out of studio-client.tsx.

## Request 2026-10-10 (c): targets, cash bonus, shift types, performance plan
Decisions (user answered form + message):
- Metric: average dollar sale per ticket = net sales ÷ tickets as printed. Headline target $78 a ticket.
- Fairness by target, not by counting: lunch and dinner targets × full time and part time (veterans get big parties, so higher).
  Gap fill: optional personal adjustment (+/− $) per person; bartenders keep 40% of their grid target.
  Each report line snapshots the target that applied, so target changes never rewrite history. Person target = ticket weighted.
- Only solo serving shifts count (not training others, being trained, other work, private events/buyouts, cut short under 3h).
- At target (rolling 30 days, ≥100%) = non cash rewards. Cash: one flat $150 at ≥105% on the rolling 30 days ending month end.
  Paid on the first payday after month end, at the latest 30 days after. Minimum 8 counted shifts (gap fill: also for non cash).
- Conduct: written warning, performance plan or termination active at ANY point in a reward's period blocks EVERY reward for that period
  (eligible again from the next full month / period).
- Performance plan: manager logs plan shifts (on time, dress, no strike, duties, floor grade if graded, standards + measurable
  improvement in the plan's focus areas). Manager picks mode: 10 total, 10 in a row, or average of last 10 ≥ 90%.
  Graduation is signed off and resets the person to zero (strikes and write ups before that day stop counting).
- Website switches to the same rules.
Progress
- [x] shared rules (metrics.ts, program.ts)
- [x] schema + db:push
- [x] perf lib (counted lines, weighted target, rolling 30, conduct blocks)
- [x] conduct reset + ratings
- [x] rewards board rewrite
- [x] shift report: shift + type per line, target snapshot, CSV columns
- [x] stores targets grid, team employment + adjustment
- [x] reports/team/slow use counted lines
- [x] performance plan UI (write-up page) + conduct overview
- [x] seed + backfill demo orgs; Harbor House target
- [x] copy: rewards library, metrics, rewards page, docs
- [ ] website
- [ ] verify, commit

## Request 2026-10-10 (d) — on top of (c), which is still in progress
- [ ] Onboarding: "Resume now" link from onboarding items to the check/module; passing the linked quiz completes the item; banner on member page and staff home
- [ ] Modules vs quizzes: every question answerable from its module; expand modules; add `see` section per question, audit script; no dashes in library copy touched; upsell target question to $78 per ticket
- [ ] My rewards page for staff (/rewards for staff, /rewards/mine/:id for managers): where they stand per reward, qualified / close / on the way / held back; fun but elegant

## Request 2026-10-10 (e): customer reviews + surveys + review rewards
- [ ] Front page (home) "New customer feedback" card: expandable list, stars, text, date; managers tag named employee(s)
- [ ] Auto tag: fuzzy match staff names in review text (misspellings, closest name); manager can reassign / untag
- [ ] My rewards: "My surveys" expand/collapse above the numbers; star rating generated from tagged surveys; big stars on My rewards + staff welcome back home; notification of manager tag
- [ ] Rewards: most surveys (monthly) + Above and beyond (quarterly, $500 + 1 paid day off = 8h × training rate e.g. $15/hr = $120)

## (d) to (g) and the rewards progress fix
- [x] (e) reviews and surveys, Most surveys ($50 house credit, to confirm), Above and beyond ($500 + paid day)
- [x] (f) mixed targets: own target per line, vs own target for people, mix target for stores
- [x] (g) Ten guests, by name (every 10 named reviews), home feedback card (loved / opportunities), review platform links, Respond in a new tab, CSV import
- [x] Reward rings: lower of shifts needed and spend vs bar; ramping colleagues shown, not ranked; shift summary on My rewards
- [x] push

## Request 2026-10-11: first clients readiness, rewards clarity, intake
- [x] Rewards: exact criteria with ✓/✗ per person, Eligible / Can still earn / Ineligible with the reason, on the board and My rewards
- [x] Intake sheet (public/templates/blm-client-intake.xlsx, scripts/make-intake-template.py)
- [x] Studio Intake tab: download, import preview, import report, what's missing per client, Bring in the latest, Rewrite for this house
- [x] intake routes (missing, import, refreshStandard), roster + history libs shared with setup
- [x] Harbor House filled with placeholder intake data, standard refreshed, v2 published
- [x] Copy: dashes and hyphens out of UI copy; old onboarding titles still link (tolerant match + DB backfill)
- [x] Add colleague: manager accounts get sign in instructions (no email sending yet)
- [x] Website: sample audit and payback calculator switched to spend per ticket
- [x] verify (tsc, lint, build, Playwright), commit, push

## Request 2026-10-12: program per house, what clients hand over, prize choices
- [x] Standard library uses a {house} token; filled from the org name (houseName strips Group/Hospitality); unpublished standard cached per house
- [x] Intake material: food menu, wine list, bar menu required; steps of service, handbook, protocols, POS optional with the BLM standard as fallback
- [x] New intake gap: menu, wine and bar still carry the BLM sample lists, with "Write from their lists"
- [x] Targets optional: set from POS history; Studio shows the last 12 months average ticket
- [x] Intake sheet regenerated (Why we ask column, optional targets)
- [x] Rewards: Most guest surveys pays $50 to spend at the restaurant; Ten guests, by name lets the winner pick 1 of 3 (choices on the reward, manager picks when awarding, kept as the award note, shown on the board, history and My rewards)
- [x] Harbor House (placeholder): Bring in the latest, v4 published, no 1906 in its copy
- [x] Website incentives line updated
- [x] verify (tsc, lint, build, Playwright), commit
- [ ] push (needs a new GitHub token)
Open
- Harbor House: still carries the BLM sample menu, wines and drinks (Write from their lists once real lists arrive)
- Email sending (invites, notifications) not built
