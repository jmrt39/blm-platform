// The 14 training modules, rebuilt from the 1906 house manual. Front of house only.
// Menu items, bottles and prices are illustrative.
import type { Module } from "../program";

const SELL = ["server", "bartender", "sommelier"];
const FLOOR = ["server", "sommelier", "food_runner", "busser", "expo"];
const ALL = ["server", "bartender", "sommelier", "host", "busser", "food_runner", "barback", "expo"];

export const MODULES: Module[] = [
  {
    slug: "the-1906-standard",
    n: 1,
    title: "The 1906 Standard",
    category: "House",
    summary: "Who we are, what a guest should feel, and the house sayings that settle most questions on the floor.",
    minutes: 12,
    roles: ALL,
    manual: "Manual pp. 2–5",
    quiz: "q-standard",
    sections: [
      {
        h: "What we promise",
        p: "Every guest leaves feeling they were expected, known and looked after — whether it is their first visit or their fortieth. The food and the wine are the reason they come; the way we serve them is the reason they come back.",
      },
      {
        h: "Leo says",
        p: "The house sayings. When you are not sure what to do, one of these usually answers it.",
        list: [
          "“The table is never yours. You are a guest in their evening.”",
          "“Walk it, don't point it.” — Take a guest to the restroom, the bar, the coat check.",
          "“Never say ‘no problem’. Say ‘my pleasure’.”",
          "“A full hand in, a full hand out.” — Nobody walks the floor empty-handed.",
          "“Recommend what you love, and say why.”",
          "“The last five minutes are the first thing they remember.”",
        ],
      },
      {
        h: "How we look",
        list: [
          "Black shirt, pressed. Black trousers or skirt, black non-slip shoes, polished.",
          "Long apron, clean at the start of every shift; wine key and two pens in the apron.",
          "Name badge on the left. Hair off the collar or tied back. No fragrance.",
        ],
        note: "Dress code is checked at line-up. Anything missing is a strike under the conduct policy.",
      },
      {
        h: "Being on time",
        p: "Line-up starts at the scheduled call time — lunch 10:30, dinner 4:00. More than five minutes after the start is late. Swaps need a screenshot showing the date, the start time and a written yes.",
      },
    ],
  },
  {
    slug: "steps-of-service",
    n: 2,
    title: "Steps of Service",
    category: "Service",
    summary: "The eleven steps from greeting to farewell, with the times we hold ourselves to.",
    minutes: 20,
    roles: SELL,
    manual: "Manual pp. 6–10",
    quiz: "q-steps",
    rubric: "floor-service",
    sections: [
      {
        h: "The steps and the clock",
        table: {
          head: ["Step", "Standard"],
          rows: [
            ["1. Greet", "Within 60 seconds of the guest sitting down. Introduce yourself; welcome back regulars by name."],
            ["2. Water", "Still or sparkling offered within 2 minutes."],
            ["3. Drinks", "Lead with a recommendation. Drinks on the table within 4 minutes of ordering."],
            ["4. Menu introduction", "Two specials, the market fish, the 86 list. Never read the menu to them."],
            ["5. Order", "Ladies first, clockwise from the host. Seat numbers on every item."],
            ["6. Wine", "Bottle presented and poured before the first course lands."],
            ["7. First course", "Check back within two bites or two minutes."],
            ["8. Entrées", "Mark the table with correct silver before the food arrives."],
            ["9. Clear", "Only when every guest has finished. Clear from the right."],
            ["10. Dessert & after-dinner", "Describe two desserts and one digestif; soufflé is ordered with entrées."],
            ["11. Check & farewell", "Check presented within 2 minutes of asking. Thank them by name at the door."],
          ],
        },
      },
      {
        h: "Reading the table",
        list: [
          "Business dinner: be precise and quick; don't linger.",
          "Celebration: slow down, make room for the moment, tell the manager.",
          "Date night: fewer touches, perfect timing.",
          "First-timers: tell the story of 1906 in one sentence.",
        ],
      },
      { h: "Graded on the floor", p: "A manager or trainer grades a full turn on the six competencies, 1–5 stars each. You need 3.5 stars on average to be signed off." },
    ],
  },
  {
    slug: "art-of-the-upsell",
    n: 3,
    title: "The Art of the Upsell",
    category: "Service",
    summary: "Leading questions, the three moments that move the check, and how to recommend without selling.",
    minutes: 18,
    roles: SELL,
    manual: "Manual pp. 11–12",
    quiz: "q-upsell",
    sections: [
      {
        h: "Leading questions, not yes/no questions",
        table: {
          head: ["Instead of", "Say"],
          rows: [
            ["“Anything to drink?”", "“Can I start you with a glass of the Veuve, or one of our cocktails — the 1906 is my favourite?”"],
            ["“Vodka soda?”", "“Would you like that with Ketel One or Grey Goose?”"],
            ["“Do you want dessert?”", "“Have you saved room for the soufflé? I'll need to fire it now.”"],
            ["“Any sides?”", "“The creamed spinach and the maitake are what most people pair with the ribeye.”"],
          ],
        },
      },
      {
        h: "The three moments",
        list: [
          "The first drink — sets the pace of the evening and the check.",
          "The wine with the entrée — the single biggest lever on average check.",
          "The finish — dessert, a digestif, a coffee. Ask every table.",
        ],
      },
      { h: "Our target", say: "Store target: $78 spend per guest at the Bar & Grille (net sales ÷ covers). Every server's spend per guest shows on their profile after each shift report." },
      { h: "What it is not", p: "Never push. If a guest says no, thank them and move on. Recommend what you'd order yourself, and say why." },
    ],
  },
  {
    slug: "menu-allergens",
    n: 4,
    title: "Menu & Allergens",
    category: "Menu",
    summary: "Every dish, its story, its timing and its allergens — and the allergy protocol that is never skipped.",
    minutes: 25,
    roles: ALL,
    manual: "Manual pp. 15–19",
    quiz: "q-menu",
    sections: [
      {
        h: "Starters",
        table: {
          head: ["Dish", "Notes · allergens"],
          rows: [
            ["Oysters, half dozen", "East & West Coast, mignonette, fresh horseradish · shellfish"],
            ["Steak tartare", "Hand-cut filet, cured yolk, capers · egg, gluten (toast)"],
            ["Burrata, roasted figs", "Autumn. Aged balsamic, toasted hazelnut · dairy, tree nut"],
            ["Lobster bisque", "Finished with cognac at the table · shellfish, dairy"],
            ["Caesar", "White anchovy, parmesan, sourdough crouton · fish, egg, dairy, gluten"],
          ],
        },
      },
      {
        h: "Mains",
        table: {
          head: ["Dish", "Notes · allergens"],
          rows: [
            ["Dover sole meunière", "Deboned tableside, 25 minutes · fish, dairy"],
            ["Halibut", "Brown butter, chanterelles · fish, dairy"],
            ["Filet mignon, 8 oz", "Bordelaise · dairy (sauce)"],
            ["Dry-aged ribeye, 22 oz", "Bone-in, 35 days, best medium rare · dairy (butter baste)"],
            ["Duck breast", "Cherry gastrique, parsnip purée · dairy"],
            ["Wild mushroom risotto", "Vegetarian; vegan on request with olive oil · dairy"],
          ],
        },
      },
      {
        h: "Desserts",
        list: [
          "Chocolate soufflé — order with the entrées, 20 minutes · egg, dairy, gluten",
          "Crème brûlée — Tahitian vanilla · egg, dairy",
          "Apple tarte tatin — autumn, crème fraîche · dairy, gluten",
        ],
      },
      {
        h: "The allergy protocol",
        list: [
          "Ask every table: “Any allergies at the table I should know about?”",
          "Ring the allergy on the POS against the seat — never just a note.",
          "Tell the expo in person. The manager runs the plate.",
          "If you are not sure, say “Let me check with the kitchen” — never guess.",
        ],
      },
    ],
  },
  {
    slug: "wine-list",
    n: 5,
    title: "Wine List",
    category: "Wine & bar",
    summary: "Our by-the-glass and bottle list, from the leanest Chablis to the oakiest Chardonnay, and what to pour with what.",
    minutes: 30,
    roles: ["server", "sommelier", "bartender"],
    manual: "Manual pp. 20–25",
    quiz: "q-wine",
    sections: [
      {
        h: "By the glass (5 oz)",
        table: {
          head: ["Wine", "Style · price"],
          rows: [
            ["Veuve Clicquot Brut NV, Champagne", "Toasty, bright · $24"],
            ["William Fèvre Chablis 1er Cru ‘Montmains’", "Unoaked, mineral, oyster-shell · $21"],
            ["Cloudy Bay Sauvignon Blanc, Marlborough", "Grapefruit, cut grass · $17"],
            ["Rombauer Chardonnay, Carneros", "Our oakiest — butter, vanilla, ripe pear · $22"],
            ["Domaine Serene ‘Yamhill Cuvée’ Pinot Noir", "Red cherry, silky · $23"],
            ["Caymus Cabernet Sauvignon, Napa", "Plush, cocoa, ripe tannin · $32"],
            ["Catena Alta Malbec, Mendoza", "Blackberry, violet · $19"],
          ],
        },
      },
      {
        h: "Chardonnay, lean to oaky",
        list: [
          "Fèvre Chablis ‘Montmains’ — no new oak. For the guest who says “nothing oaky”.",
          "Kistler ‘Les Noisetiers’, Sonoma Coast — balanced; a touch of oak, lots of fruit.",
          "Rombauer, Carneros — full malolactic, new French oak. The oakiest bottle we pour.",
        ],
      },
      {
        h: "Reds by the bottle",
        table: {
          head: ["Wine", "Notes · price"],
          rows: [
            ["Domaine Serene ‘Evenstad Reserve’ Pinot Noir", "Willamette Valley · $150"],
            ["Louis Jadot Gevrey-Chambertin", "Burgundy, Pinot Noir · $160"],
            ["Duckhorn Merlot, Napa", "Plum, soft tannin · $120"],
            ["Silver Oak Cabernet, Alexander Valley", "American oak, cedar, firm tannin · $165"],
            ["Caymus Cabernet, Napa", "Ripe, plush · $185"],
            ["E. Guigal Côte-Rôtie ‘Brune et Blonde’", "Northern Rhône Syrah, a little Viognier · $175"],
            ["Antinori Tignanello", "Super Tuscan — Sangiovese with Cabernet · $210"],
            ["Château Lynch-Bages 2016", "Pauillac, Bordeaux · $325"],
          ],
        },
      },
      {
        h: "What to pour with what",
        table: {
          head: ["Dish", "First recommendation"],
          rows: [
            ["Oysters", "Chablis ‘Montmains’ or the Veuve"],
            ["Dover sole", "Chablis by the glass; Kistler by the bottle"],
            ["Lobster bisque", "Rombauer — the richness meets the cream"],
            ["Duck breast", "Pinot Noir — Domaine Serene or Gevrey-Chambertin"],
            ["Ribeye, medium rare", "Silver Oak Cabernet — the tannin cuts the fat"],
            ["Filet", "Duckhorn Merlot or Lynch-Bages"],
          ],
        },
      },
      { h: "Service temperatures", p: "Sparkling 42–45°F. Whites 48–52°F. Reds 60–65°F. A 750 ml bottle pours five 5 oz glasses." },
    ],
  },
  {
    slug: "wine-service",
    n: 6,
    title: "Wine Service & Presentation",
    category: "Wine & bar",
    summary: "Presenting the bottle, opening it cleanly, the taste pour, pouring order and telling the story in a sentence.",
    minutes: 15,
    roles: ["server", "sommelier"],
    manual: "Manual pp. 26–27",
    quiz: "q-wine-service",
    rubric: "wine-presentation",
    sections: [
      {
        h: "The sequence",
        list: [
          "Present to the host, label facing them: producer, wine, vintage.",
          "Cut the foil below the lip in one clean line. Pocket the foil.",
          "Ease the cork out quietly. Place it to the host's right.",
          "Pour a taste for the host. Wait for the nod.",
          "Pour ladies first, clockwise, host last. 5 oz, never above the widest part of the glass.",
          "Label facing the host when you set the bottle down.",
        ],
      },
      { h: "One sentence of story", say: "“This is Silver Oak from Alexander Valley — aged in American oak, so you'll get cedar and vanilla. It's made for the ribeye.”" },
      { h: "If a guest sends a bottle back", p: "Thank them, take it away without debate, and tell the manager. A corked or disliked bottle is replaced or swapped — never argued." },
    ],
  },
  {
    slug: "liquor-brands",
    n: 7,
    title: "Liquor Brands",
    category: "Wine & bar",
    summary: "Well, call and premium for every spirit, so every drink order becomes a choice between two good brands.",
    minutes: 15,
    roles: ["server", "bartender", "barback", "sommelier"],
    manual: "Manual pp. 13–14",
    quiz: "q-liquor",
    sections: [
      {
        h: "Well · call · premium",
        table: {
          head: ["Spirit", "Well → call → premium"],
          rows: [
            ["Vodka", "Tito's → Ketel One → Belvedere, Grey Goose"],
            ["Gin", "Beefeater → Tanqueray → Hendrick's, The Botanist"],
            ["Bourbon", "Old Forester → Buffalo Trace, Maker's Mark → Blanton's, Woodford Double Oaked"],
            ["Scotch", "Dewar's → Glenlivet 12 → Macallan 12, Lagavulin 16 (peated, Islay)"],
            ["Tequila", "Espolòn → Casamigos Blanco → Clase Azul Reposado, Don Julio 1942"],
            ["Rum", "Bacardí → Mount Gay Eclipse → Diplomático Reserva"],
          ],
        },
      },
      { h: "Call it up", say: "Never ring a well drink without offering a choice: “Would you like Tanqueray or Hendrick's in that?”" },
      { h: "Neat, up, rocks", p: "Neat: room temperature, no ice. Up: chilled and strained into a coupe. Rocks: over ice. A ‘dirty’ martini has olive brine; ‘perfect’ means equal dry and sweet vermouth." },
    ],
  },
  {
    slug: "beer-brands",
    n: 8,
    title: "Beer Brands",
    category: "Wine & bar",
    summary: "Drafts, bottles and the seasonal tap — what each tastes like and what it goes with.",
    minutes: 8,
    roles: ["server", "bartender", "barback"],
    manual: "Manual p. 28",
    quiz: "q-beer",
    sections: [
      {
        h: "On draft",
        table: {
          head: ["Beer", "Style · goes with"],
          rows: [
            ["Pilsner Urquell", "Czech pilsner, crisp · oysters, fries"],
            ["Allagash White", "Belgian wit, orange peel, coriander · halibut, burrata"],
            ["Sierra Nevada Pale Ale", "Piney, bitter · burger at the bar"],
            ["Ayinger Oktober Fest-Märzen", "Seasonal, autumn. Toasty malt · duck, ribeye"],
          ],
        },
      },
      { h: "Bottles", list: ["Guinness Draught (nitro can)", "Weihenstephaner Hefeweissbier", "Athletic Run Wild (non-alcoholic IPA)"] },
      { h: "The pour", p: "Glass at 45°, straighten at half, one inch of head. Wit and hefeweizen go in the tall wheat glass." },
    ],
  },
  {
    slug: "specialty-cocktails",
    n: 9,
    title: "Specialty Cocktails",
    category: "Wine & bar",
    summary: "Our six house cocktails — the spec, the glass, the garnish and the one line that sells each one.",
    minutes: 15,
    roles: ["bartender", "server", "barback"],
    manual: "Manual pp. 29–31",
    quiz: "q-cocktails",
    rubric: "cocktail-spec",
    sections: [
      {
        h: "The list",
        table: {
          head: ["Cocktail", "Spec · glass"],
          rows: [
            ["The 1906", "2 oz bourbon, ¾ Amaro Nonino, 2 dash orange bitters. Stirred, up, coupe, expressed orange"],
            ["Leo's Old Fashioned", "2 oz Woodford Double Oaked, ¼ demerara, 3 dash Angostura. Large cube, rocks glass"],
            ["Garden Gimlet", "2 oz Hendrick's, ¾ lime cordial, muddled cucumber. Shaken, up, cucumber ribbon"],
            ["Harvest Mule", "Autumn. 1½ Ketel One, ¾ spiced pear, ginger beer. Copper mug, pear fan"],
            ["Smoke & Velvet", "1½ mezcal, ½ Aperol, 1 grapefruit, ½ agave. Shaken, rocks, salt rim half"],
            ["Espresso Martini", "1½ Belvedere, 1 fresh espresso, ½ coffee liqueur. Hard shake, coupe, three beans"],
          ],
        },
      },
      { h: "Stirred or shaken", p: "Spirit-only drinks are stirred (clarity, silk). Anything with citrus, cream or egg is shaken." },
    ],
  },
  {
    slug: "pos-walkthrough",
    n: 10,
    title: "POS Walkthrough",
    category: "Standards",
    summary: "Ringing in by seat, modifiers and allergies, coursing and fire times, splits, transfers and closing a check.",
    minutes: 20,
    roles: ["server", "bartender", "sommelier", "host"],
    manual: "Manual pp. 32–34",
    quiz: "q-pos",
    rubric: "pos-accuracy",
    sections: [
      {
        h: "With your trainer",
        list: [
          "Clock in with your own PIN — never someone else's.",
          "Open the table, enter the guest count, ring every item to a seat number.",
          "Modifiers from the button, not free text. Allergies use the red ALLERGY modifier.",
          "Course it: firsts fire on send; mains are held and fired when you clear firsts.",
          "Soufflé is rung with the mains and flagged ‘fire now’.",
          "Splits by seat, transfers to the bar with the manager's approval.",
          "Comps and voids need a manager card and a reason.",
        ],
      },
      { h: "Closing a check", p: "Present within two minutes of the ask. Run the card at the table, return it with the slip and a pen. Close out before you leave the section." },
    ],
  },
  {
    slug: "glassware-silverware",
    n: 11,
    title: "Glassware & Silverware",
    category: "Standards",
    summary: "Polishing to the light, handling by stem and handle only, and how a 1906 table is set.",
    minutes: 12,
    roles: ALL,
    manual: "Manual pp. 35–36",
    quiz: "q-glass",
    rubric: "glassware-polish",
    sections: [
      {
        h: "Polishing glassware",
        list: [
          "Steam over hot water, polish with a clean linen — one in each hand, never touch the bowl.",
          "Hold it to the light. No spots, no lint, no fingerprints.",
          "Carry by the stem, never the rim. Racks, not hands, for more than four.",
        ],
      },
      {
        h: "Silverware",
        list: [
          "Polish with vinegar water and linen; inspect both sides.",
          "Handle by the handle only — never the tines or the blade.",
          "Roll: knife, fork, spoon; napkin folded with the seam underneath.",
        ],
      },
      {
        h: "The 1906 setting",
        p: "Two forks left, two knives right with blades in, bread plate top left with butter knife, water, white and red glasses top right on a diagonal. One inch from the table edge.",
      },
      { h: "Graded", p: "Polishing and setting are graded on the floor — glassware and silverware — and both are signed by the grader and you." },
    ],
  },
  {
    slug: "table-setting-sidework",
    n: 12,
    title: "Side Work, Opening & Closing",
    category: "Standards",
    summary: "The opening and closing checklists line by line — and why every line is initialled and timed.",
    minutes: 10,
    roles: ["server", "busser", "food_runner", "host", "expo", "barback", "bartender"],
    manual: "Manual pp. 37–39",
    quiz: "q-sidework",
    rubric: "silverware-setting",
    sections: [
      {
        h: "Opening",
        list: [
          "Ice in the bin, poured into the wells behind the bar.",
          "Centerpieces and candles on every table.",
          "Glassware polished, silverware rolled and stocked.",
          "Reservations reviewed: VIPs, allergies, large parties.",
        ],
      },
      { h: "Closing", list: ["Centerpieces off, tables stripped and wiped.", "Linens changed, silverware rolled for tomorrow.", "Floor vacuumed, including under banquettes."] },
      { h: "Initials and time", p: "You initial each line as you finish it. The manager verifies and signs, then submits. Opening is due by 11:00; closing by 1:00." },
    ],
  },
  {
    slug: "delivery-etiquette",
    n: 13,
    title: "Food & Drink Delivery",
    category: "Service",
    summary: "Seat numbers, serving from the left, clearing from the right, and announcing every plate.",
    minutes: 10,
    roles: FLOOR,
    manual: "Manual pp. 40–41",
    quiz: "q-delivery",
    sections: [
      {
        h: "The rules",
        list: [
          "Food from the left, drinks and clearing from the right.",
          "Ladies first, then clockwise; host last.",
          "Every plate announced: “The Dover sole, deboned at the table.”",
          "Plate placed with the protein at six o'clock.",
          "Never auction food (“Who had the filet?”). Seat numbers are on the ticket.",
          "Clear only when everyone has finished, unless a guest asks.",
        ],
      },
      { h: "Running for others", p: "Full hands in, full hands out. If a table is waiting on something, you own it until it lands." },
    ],
  },
  {
    slug: "recovery-relations",
    n: 14,
    title: "Recovery & Guest Relations",
    category: "Service",
    summary: "Recognition, table touches, and the LAST method for putting things right when they go wrong.",
    minutes: 12,
    roles: ALL,
    manual: "Manual pp. 42–44",
    quiz: "q-recovery",
    sections: [
      { h: "Recognition", p: "Regulars are greeted by name. Check the reservation notes for anniversaries, preferences and past orders before the table arrives." },
      {
        h: "LAST",
        list: ["Listen — all the way to the end, without interrupting.", "Apologise — sincerely, once.", "Solve — fix it, or bring the manager who can.", "Thank — thank them for telling you."],
      },
      { h: "Manager in", p: "Any comp, any complaint about a person, any allergy concern: the manager visits the table before it leaves." },
      { h: "The thank-you", say: "“Thank you for spending your evening with us, Mr. Alvarez. We'll see you soon.”" },
    ],
  },
];

export const MODULE_BY_SLUG = Object.fromEntries(MODULES.map((m) => [m.slug, m])) as Record<string, Module>;

/** Modules required for a store role. Managers see every module but are not tracked against them. */
export function modulesFor(role: string) {
  return MODULES.filter((m) => m.roles.includes(role));
}
