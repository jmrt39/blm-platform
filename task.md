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
