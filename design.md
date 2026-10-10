# The Platform — Bottom Line Multiplied — Design

Front-of-house operations app from the BLM film. Web first (Checkpoint A); mobile and desktop reuse this brief.
Direction: a dark noir frame around cream "paper" screens — like a leather check presenter holding a printed report.
Editorial, quiet, exact. Gold is used sparingly for the emblem, the active state and the numbers that matter.

## Brand & Colors

| Token | Value | Use |
|-------|-------|-----|
| noir | #0d0c0b | App frame, top bar, sign-in background |
| noir-2 | #171513 | Raised noir surfaces, nav hover |
| noir-line | #2a2622 | Hairlines on noir |
| paper | #f3ecdf | Main screen surface (cream paper) |
| paper-2 | #ebe2d1 | Inset rows, table stripes |
| paper-line | #d9cdb6 | Hairlines on paper |
| ink | #1c1915 | Text on paper |
| ink-soft | #6b6155 | Secondary text on paper |
| ivory | #efe7d8 | Text on noir, the L and M of the monogram |
| gold | #c5af87 | Emblem, active nav, key figures, primary buttons on noir |
| gold-deep | #8a7350 | Gold text on paper (contrast) |
| oxblood | #8c2f2a | Late / missed / errors |
| sage | #4d6b4f | On time / submitted |

## Typography

- Display: **Bodoni Moda** (Google Fonts) — page titles, figures, stamps. Italic for asides.
- Body: **Manrope** — UI, tables, forms. 14–15px base, 1.55 line height.
- Eyebrows: Manrope 11px, uppercase, 0.18em tracking, gold-deep on paper / gold on noir.
- Figures: Bodoni Moda with tabular numerals.
- Optical size is pinned, not left to the browser: `.font-display` uses `font-variation-settings: "opsz" 18` at weight 500, `.figure` uses `"opsz" 11` at weight 600. Both set `font-optical-sizing: none`. Without the pin, Bodoni Moda's automatic optical size jumps to 96 at large sizes and the hairlines vanish.

## Emblem

Client logo — the BLM monogram: gold "I" stem, gold "3" curves of the B, gold arrow rising out of the M; the L and M are black in the original and render ivory on noir. Cleaned from the client's file (gold sliver at the B/M crossbar removed, L inner corner squared).
- `/images/blm-monogram.png` — ivory #efe7d8 + gold #c5af87, transparent, square-padded 1024px (use on noir; all current placements).
- `/images/blm-monogram-ink.png` — ink #141210 + deep gold #a88e55, transparent (use on paper/print).
- `/images/blm-icon.png`, `/favicon.png`, `/favicon.ico` — monogram on a noir square.
- Wordmark text ("Bottom Line Multiplied") is set in type beside/below the monogram, not baked into the image.
Used on: favicon/app icon, splash, sign-in crest, top bar, the "Signed off" stamp, and report headers.

## Components

- **Frame**: noir page; content sits on a paper sheet with 2px radius, subtle shadow and a 1px paper-line inner rule.
- **Top bar** (noir): monogram + "The Platform", store scope switcher (a store or "All stores — combined"), nav, user chip.
- **Buttons**: square-ish (2px radius). Primary = ink on paper / gold on noir. Secondary = outlined hairline.
- **Checklist line**: area eyebrow, title, then a right-aligned initials chip ("CR") and time stamp ("7:41 am").
- **Signature pad**: paper-2 field with a baseline rule and "Verified by" caption.
- **Signed off stamp**: rotated double-ruled oxblood/gold seal with the monogram, name and time.
- **Strike pips**: a row of small dots (ink filled for live strikes, oxblood once on a step) beside a Bodoni figure; used in the conduct table, team column and write-ups.
- **Ladder bar**: four segments (Verbal / Written / Performance plan / Termination), ink rules for steps reached, oxblood for the current one.
- **Status chip**: hairline pill — "Needs signatures" (oxblood), "Awaiting owner" (gold-deep), "On file" (ink), "Terminated" (oxblood), "Void" (struck through).
- **Line-up roster row**: name + role, On time / Late / No-show toggles, uniform checklist chips, then a finger signature pad per person.
- **Swap card**: phone screenshot thumbnail on the left, "From → To" in display type, the three protocol checks (date, start time, written agreement) as checkboxes.
- **Demo label**: "Demo data · illustrative" pill in the top bar whenever the group is the demo.

## Pages

Sign-in · Setup (new owner) · Store unlock (manager) · Home "The bottom line, today" · Checklists (today + history) ·
Checklist detail · Team · Colleague profile (30/60/90) · Add a colleague · Shift report (manual / CSV) ·
Reports (store / combined) · Stores & access · Line-up (today, run, signed) · Conduct & discipline (overview, swaps,
log a swap) · Write-up (signatures, owner approval, Terminated stamp).

Front of house only — no kitchen roles, modules or reports.

## Implementation Studio (BLM staff only)

`/studio`, unlocked once per account with `BLM_STUDIO_CODE`. Its own dark header ("Implementation Studio · Staff only"),
paper card body like the rest of the app. Clients list → client page with five tabs: Brief · Materials · Last year ·
Build · Publish. Build is a board grouped by type (modules, quizzes, floor and skills, rewards, checklists, talking points)
with status chips (BLM standard, AI draft, Edited, Approved, Excluded, "Still names 1906" in oxblood) and a side editor
with Compare. Publish shows what the client will get and warns about items still written for 1906.
Line up shows "On this day last year" (same weekday, 52 weeks back) and three rotating talking points.
