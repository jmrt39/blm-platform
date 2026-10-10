// The 14 training modules, rebuilt from the 1906 house manual. Front of house only.
// Menu items, bottles and prices are illustrative.
// Every knowledge check question is taught in its module: each question names the section (`see`)
// that answers it. Keep the heading text identical when editing a section.
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
    manual: "Manual pp. 2 to 5",
    quiz: "q-standard",
    sections: [
      {
        h: "What we promise",
        p: "One promise to every guest: they leave feeling they were expected, known and looked after, whether it is their first visit or their fortieth. The food and the wine are the reason they come; the way we serve them is the reason they come back. We do not promise the fastest service in town, a table in fifteen minutes or anything free. We promise how they will feel.",
        list: [
          "Expected: the table is ready, the reservation notes are read, the occasion is known before they sit.",
          "Known: regulars are greeted by name, and we remember what they drank last time.",
          "Looked after: the next thing they need arrives before they have to ask for it.",
        ],
      },
      {
        h: "Leo says",
        p: "The house sayings. When you are not sure what to do, one of these usually answers it. Learn what each one means in practice, because that is what you will be asked.",
        table: {
          head: ["Saying", "What it means on the floor"],
          rows: [
            [
              "“The table is never yours.”",
              "You are a guest in their evening. Their pace, their occasion, their conversation. We fit around them; we never rush a table to turn it and never hover to be noticed.",
            ],
            [
              "“Walk it, don't point it.”",
              "When a guest asks for the restroom, the bar or the coat check, you walk them there yourself. You do not point down the hallway, give directions, or hand them off to a host.",
            ],
            [
              "“Never say ‘no problem’. Say ‘my pleasure’.”",
              "‘My pleasure’ is the house reply to every thank you. Not ‘no problem’, not ‘you got it’, not ‘no worries’.",
            ],
            [
              "“A full hand in, a full hand out.”",
              "Nobody walks the floor empty handed. Heading back to the kitchen from a table, you carry whatever needs to go back: glasses, plates, linen. Heading out, you carry whatever needs to go out.",
            ],
            [
              "“Recommend what you love, and say why.”",
              "Asked what you would order, name the dish you genuinely love and give the reason. Not the most expensive thing, not what the kitchen needs to move, and never “everything is good”.",
            ],
            [
              "“The last five minutes are the first thing they remember.”",
              "The check, the coats and the goodbye shape the memory of the evening more than the first drink, the bread or the reservation call. Never let the finish slip.",
            ],
          ],
        },
      },
      {
        h: "How we look",
        list: [
          "Black shirt, pressed. Black trousers or skirt, black non slip shoes, polished.",
          "Long apron, clean at the start of every shift.",
          "In the apron: your wine key and two pens. They are part of the uniform, every shift, wine night or not.",
          "Name badge on the left. Hair off the collar or tied back. No fragrance.",
        ],
        note: "Dress code is checked at line up. Anything missing, including the wine key or a pen, is a dress code miss and a strike under the conduct policy. Borrowing one after the check does not undo it.",
      },
      {
        h: "Being on time",
        p: "Line up starts at the scheduled call time: lunch 10:30, dinner 4:00. There is no grace period. More than five minutes after the start is late, so walking in at 4:07 for a 4:00 line up is late, whatever time you clock in.",
        list: [
          "A swap only counts with a screenshot showing the date, the start time and a written yes from your colleague.",
          "A verbal OK, a text without the time, or telling the host is not a swap.",
        ],
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
    manual: "Manual pp. 6 to 10",
    quiz: "q-steps",
    rubric: "floor-service",
    sections: [
      {
        h: "The steps and the clock",
        p: "The clock starts when the guest sits down, not when you notice them.",
        table: {
          head: ["Step", "Standard"],
          rows: [
            ["1. Greet", "Within 60 seconds of the guest sitting down. Introduce yourself; welcome back regulars by name."],
            ["2. Water", "Still or sparkling offered within 2 minutes."],
            ["3. Drinks", "Lead with a recommendation. Drinks on the table within 4 minutes of ordering."],
            ["4. Menu introduction", "Cover the two specials, the market fish and the 86 list. Never read the menu to them."],
            ["5. Order", "Ladies first, then clockwise from the host. Seat numbers on every item."],
            ["6. Wine", "Bottle presented and poured before the first course lands."],
            ["7. First course", "Check back within two bites or two minutes."],
            ["8. Entrées", "Mark the table with the correct silver before the food arrives."],
            ["9. Clear", "Only when every guest at the table has finished, unless a guest asks. Clear from the right."],
            ["10. Dessert and after dinner", "Describe two desserts and one digestif. The soufflé is ordered with the entrées."],
            ["11. Check and farewell", "Check presented within 2 minutes of asking. Thank them by name at the door."],
          ],
        },
      },
      {
        h: "Why the soufflé goes in early",
        p: "The chocolate soufflé takes 20 minutes and is baked to order. If you wait until the mains are cleared, the table waits twenty minutes for dessert. So you ask about it when you take the entrée order, and it is rung with the entrées.",
      },
      {
        h: "Clearing",
        p: "If two of four guests have finished, you wait. Clearing early tells the slower guests to hurry. Clear when every guest has finished, unless a guest asks you to take their plate; then take it, quietly, from the right.",
      },
      {
        h: "Reading the table",
        list: [
          "Business dinner: be precise and quick; don't linger.",
          "Celebration: slow down, make room for the moment, and tell the manager.",
          "Date night: fewer touches, perfect timing.",
          "First timers: tell the story of 1906 in one sentence.",
        ],
      },
      {
        h: "Graded on the floor",
        p: "A manager or trainer grades a full turn on six competencies, 1 to 5 stars each. You need an average of 3.5 stars to be signed off.",
      },
    ],
  },
  {
    slug: "art-of-the-upsell",
    n: 3,
    title: "The Art of the Upsell",
    category: "Service",
    summary: "Leading questions, the three moments that move the check, how your number is worked out and what it earns.",
    minutes: 20,
    roles: SELL,
    manual: "Manual pp. 11 to 12",
    quiz: "q-upsell",
    sections: [
      {
        h: "Leading questions, not yes or no questions",
        p: "A yes or no question invites a no. A leading question offers a choice between two good options, so the guest picks rather than declines.",
        table: {
          head: ["Instead of", "Say"],
          rows: [
            ["“Anything to drink?”", "“Can I start you with a glass of the Veuve, or one of our cocktails? The 1906 is my favourite.”"],
            ["“Vodka soda?”", "“Would you like that with Ketel One or Grey Goose?”"],
            ["“Do you want dessert?”", "“Have you saved room for the soufflé? I'll need to fire it now.” (Said when you take the entrée order.)"],
            ["“Any sides?”", "“The creamed spinach and the maitake are what most people pair with the ribeye.”"],
          ],
        },
      },
      {
        h: "The three moments",
        list: [
          "The first drink. It sets the pace of the evening and the check.",
          "The wine with the entrée. The single biggest lever on the check.",
          "The finish: dessert, a digestif, a coffee. Ask every table.",
        ],
      },
      {
        h: "What it is not",
        p: "Never push. If a guest says no to dessert, thank them and offer a coffee or a digestif once, then move on. A recommendation is credible when it is what you would order yourself and you say why. Saying it is popular, or that the chef insists, is not a reason.",
      },
      {
        h: "How your number is worked out",
        p: "Your number is your average dollar sale per ticket: net sales divided by POS tickets. It is per ticket, not per guest. The house headline target is $78 at dinner for full time servers. Lunch and part time shifts each have their own target set by your store, and bartenders are measured against 40% of the grid because so much of the bar is drinks only. Every shift is measured against the target for that shift.",
      },
      {
        h: "Which shifts count",
        p: "Only shifts you serve solo count: your own section, on your own. These do not count, for you or against you:",
        list: [
          "Training someone, or being trained or shadowing.",
          "Other work: host, expo, bar back, setup.",
          "Private events and fixed price buyouts.",
          "Shifts cut short under 3 hours.",
        ],
        note: "Your number shows on your profile after each shift report, against your own target, with your last 30 days.",
      },
      {
        h: "What it earns",
        list: [
          "$150 cash when your rolling 30 day average is 5% or more over your target, with at least 8 solo shifts in the month. On a $78 target that means $81.90 or better.",
          "At 100% of target or better you are in the running for the non cash rewards, with the same 8 solo shift minimum each month.",
          "Paid on the first payday after the month ends, and never later than 30 days after.",
          "A written warning, performance plan or termination active on any day of the period holds back every reward for that period. Eligibility returns from the next full period.",
        ],
      },
    ],
  },
  {
    slug: "menu-allergens",
    n: 4,
    title: "Menu & Allergens",
    category: "Menu",
    summary: "Every dish, its story, its timing and its allergens, and the allergy protocol that is never skipped.",
    minutes: 25,
    roles: ALL,
    manual: "Manual pp. 15 to 19",
    quiz: "q-menu",
    sections: [
      {
        h: "Starters",
        table: {
          head: ["Dish", "The story", "Allergens"],
          rows: [
            ["Oysters, half dozen", "East Coast are briny and firm, West Coast sweeter and creamier. Shucked to order, with mignonette and fresh horseradish.", "Shellfish"],
            ["Steak tartare", "Hand cut filet, never ground, with a cured egg yolk and capers. Served with toast.", "Egg, gluten (the toast)"],
            ["Burrata, roasted figs", "Autumn only. Figs roasted with aged balsamic and finished with toasted hazelnut.", "Dairy, tree nut (hazelnut)"],
            ["Lobster bisque", "Made from the shells, finished with cognac poured at the table.", "Shellfish, dairy"],
            ["Caesar", "White anchovy, parmesan, a sourdough crouton and an egg yolk dressing.", "Fish, egg, dairy, gluten"],
          ],
        },
      },
      {
        h: "Mains",
        table: {
          head: ["Dish", "The story", "Allergens"],
          rows: [
            ["Dover sole meunière", "Flown in whole, deboned tableside. Allow 25 minutes.", "Fish, dairy"],
            ["Halibut", "Brown butter and chanterelles.", "Fish, dairy"],
            ["Filet mignon, 8 oz", "Center cut, with bordelaise. The bordelaise is mounted with butter.", "Dairy (the sauce)"],
            ["Dry aged ribeye, 22 oz", "Bone in, dry aged 35 days in house. Best at medium rare.", "Dairy (butter baste)"],
            ["Duck breast", "Cherry gastrique, parsnip purée.", "Dairy"],
            ["Wild mushroom risotto", "Vegetarian as written. Vegan on request: finished with olive oil instead of butter and parmesan.", "Dairy, unless rung vegan"],
          ],
        },
      },
      {
        h: "Desserts",
        table: {
          head: ["Dessert", "The story", "Allergens"],
          rows: [
            ["Chocolate soufflé", "Baked to order, 20 minutes. Ordered with the entrées.", "Egg, dairy, gluten"],
            ["Crème brûlée", "Tahitian vanilla, burnt to order.", "Egg, dairy"],
            ["Apple tarte tatin", "Autumn only. Caramelised apple, crème fraîche.", "Dairy, gluten"],
          ],
        },
        note: "Two dishes are autumn only: the burrata with roasted figs and the apple tarte tatin. The soufflé and the crème brûlée are on all year.",
      },
      {
        h: "The allergy protocol",
        list: [
          "Ask every table: “Any allergies at the table I should know about?”",
          "Ring the allergy on the POS against the seat with the red ALLERGY modifier. Never a free text note, never only on a handwritten ticket.",
          "Tell the expo in person.",
          "The manager runs the allergy plate to the table. Not you, not a runner.",
          "If you are not sure whether a dish contains something, say “Let me check with the kitchen.” Never guess, never ask another server, never suggest they just pick something off.",
        ],
      },
    ],
  },
  {
    slug: "wine-list",
    n: 5,
    title: "Wine List",
    category: "Wine & bar",
    summary: "Our by the glass and bottle list, from the leanest Chablis to the oakiest Chardonnay, and what to pour with what.",
    minutes: 30,
    roles: ["server", "sommelier", "bartender"],
    manual: "Manual pp. 20 to 25",
    quiz: "q-wine",
    sections: [
      {
        h: "By the glass (5 oz)",
        table: {
          head: ["Wine", "Style · price"],
          rows: [
            ["Veuve Clicquot Brut NV, Champagne", "Toasty, bright · $24"],
            ["William Fèvre Chablis 1er Cru ‘Montmains’", "Unoaked, mineral, oyster shell · $21"],
            ["Cloudy Bay Sauvignon Blanc, Marlborough", "Grapefruit, cut grass · $17"],
            ["Rombauer Chardonnay, Carneros", "Our oakiest: butter, vanilla, ripe pear · $22"],
            ["Domaine Serene ‘Yamhill Cuvée’ Pinot Noir", "Red cherry, silky, the softest red we pour by the glass · $23"],
            ["Caymus Cabernet Sauvignon, Napa", "Plush, cocoa, ripe tannin · $32"],
            ["Catena Alta Malbec, Mendoza", "Blackberry, violet · $19"],
          ],
        },
      },
      {
        h: "Chardonnay, lean to oaky",
        list: [
          "Fèvre Chablis ‘Montmains’: no new oak. The leanest. For the guest who says “nothing oaky”.",
          "Kistler ‘Les Noisetiers’, Sonoma Coast: balanced, a touch of oak, lots of fruit. If a Kistler guest wants it leaner, move to the Chablis.",
          "Rombauer, Carneros: full malolactic and new French oak. The oakiest bottle we pour.",
        ],
      },
      {
        h: "Reds by the bottle",
        table: {
          head: ["Wine", "Grape, place · price"],
          rows: [
            ["Domaine Serene ‘Evenstad Reserve’", "Pinot Noir, Willamette Valley · $150"],
            ["Louis Jadot Gevrey Chambertin", "Red Burgundy, so Pinot Noir · $160"],
            ["Duckhorn Merlot, Napa", "Plum, soft tannin · $120"],
            ["Silver Oak Cabernet, Alexander Valley", "American oak, cedar, firm tannin · $165"],
            ["Caymus Cabernet, Napa", "Ripe, plush · $185"],
            ["E. Guigal Côte Rôtie ‘Brune et Blonde’", "Northern Rhône Syrah, cofermented with a little Viognier · $175"],
            ["Antinori Tignanello", "Super Tuscan: Sangiovese with Cabernet. Our bold Italian · $210"],
            ["Château Lynch Bages 2016", "Pauillac. Our Bordeaux · $325"],
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
            ["Lobster bisque", "Rombauer: the richness meets the cream"],
            ["Duck breast", "Pinot Noir: Domaine Serene or Gevrey Chambertin"],
            ["Ribeye, medium rare", "Silver Oak Cabernet: the firm tannin cuts the fat"],
            ["Filet", "Duckhorn Merlot or Lynch Bages. For a guest who wants bold and Italian, Tignanello."],
          ],
        },
        note: "One bottle for a table with duck and Dover sole: Pinot Noir. It is light enough for the fish and has the fruit for the duck.",
      },
      {
        h: "Temperatures and pours",
        p: "Sparkling 42 to 45°F. Whites 48 to 52°F. Reds 60 to 65°F. A 750 ml bottle pours five 5 oz glasses, so three bottles pour fifteen.",
      },
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
    manual: "Manual pp. 26 to 27",
    quiz: "q-wine-service",
    rubric: "wine-presentation",
    sections: [
      {
        h: "The sequence",
        list: [
          "Present to the host, label facing them, and name the producer, the wine and the vintage. The host, not whoever ordered it or whoever is closest.",
          "Cut the foil below the lip in one clean line. Pocket the foil.",
          "Ease the cork out quietly. No pop. Place the cork to the host's right.",
          "Pour a taste for the host. Wait for the nod.",
          "Pour ladies first, clockwise, host last. 5 oz, never above the widest part of the glass.",
          "Set the bottle down with the label facing the host.",
        ],
      },
      {
        h: "One sentence of story",
        p: "Producer, place, and why it suits the dish. Never just the colour or the price.",
        say: "“This is Silver Oak from Alexander Valley. It's aged in American oak, so you'll get cedar and vanilla. It's made for the ribeye.”",
      },
      {
        h: "If a guest sends a bottle back",
        p: "Whether it is corked or just “not what I expected”, thank them, take it away without debate and tell the manager. The bottle is replaced or swapped. We never explain why the wine is correct, and we do not offer a discount instead.",
      },
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
    manual: "Manual pp. 13 to 14",
    quiz: "q-liquor",
    sections: [
      {
        h: "Well · call · premium",
        table: {
          head: ["Spirit", "Well", "Call", "Premium"],
          rows: [
            ["Vodka", "Tito's", "Ketel One", "Belvedere, Grey Goose"],
            ["Gin", "Beefeater", "Tanqueray", "Hendrick's, The Botanist"],
            ["Bourbon", "Old Forester", "Buffalo Trace, Maker's Mark", "Blanton's, Woodford Double Oaked"],
            ["Scotch", "Dewar's", "Glenlivet 12", "Macallan 12, Lagavulin 16 (peated, from Islay)"],
            ["Tequila", "Espolòn", "Casamigos Blanco", "Clase Azul Reposado, Don Julio 1942"],
            ["Rum", "Bacardí", "Mount Gay Eclipse", "Diplomático Reserva"],
          ],
        },
      },
      { h: "Call it up", say: "Never ring a well drink without offering a choice: “Would you like Tanqueray or Hendrick's in that?”" },
      {
        h: "Neat, up, rocks",
        list: [
          "Neat: room temperature, no ice.",
          "Up: chilled and strained into a coupe.",
          "Rocks: over ice.",
          "Dirty martini: olive brine added.",
          "Perfect: equal parts dry and sweet vermouth, as in a perfect Manhattan.",
        ],
      },
    ],
  },
  {
    slug: "beer-brands",
    n: 8,
    title: "Beer Brands",
    category: "Wine & bar",
    summary: "Drafts, bottles and the seasonal tap: what each tastes like and what it goes with.",
    minutes: 8,
    roles: ["server", "bartender", "barback"],
    manual: "Manual p. 28",
    quiz: "q-beer",
    sections: [
      {
        h: "On draft",
        table: {
          head: ["Beer", "Style", "Goes with"],
          rows: [
            ["Pilsner Urquell", "Czech pilsner, crisp", "Oysters, fries"],
            ["Allagash White", "Belgian wit, brewed with orange peel and coriander", "Halibut, burrata"],
            ["Sierra Nevada Pale Ale", "Piney, bitter, the hoppy one", "The burger at the bar"],
            ["Ayinger Oktober Fest Märzen", "The autumn seasonal tap. Toasty malt", "Duck, ribeye"],
          ],
        },
      },
      {
        h: "Bottles and cans",
        list: ["Guinness Draught, served from the nitro can.", "Weihenstephaner Hefeweissbier.", "Athletic Run Wild, a non alcoholic IPA for the guest who is not drinking."],
      },
      { h: "The pour", p: "Start with the glass at 45°, straighten it at half full, and finish with one inch of head. Wit and hefeweizen go in the tall wheat glass." },
    ],
  },
  {
    slug: "specialty-cocktails",
    n: 9,
    title: "Specialty Cocktails",
    category: "Wine & bar",
    summary: "Our six house cocktails: the spec, the glass, the garnish and the one line that sells each one.",
    minutes: 15,
    roles: ["bartender", "server", "barback"],
    manual: "Manual pp. 29 to 31",
    quiz: "q-cocktails",
    rubric: "cocktail-spec",
    sections: [
      {
        h: "The list",
        table: {
          head: ["Cocktail", "Spec · glass · garnish", "The line that sells it"],
          rows: [
            ["The 1906", "2 oz bourbon, ¾ Amaro Nonino, 2 dash orange bitters. Stirred, up, coupe, expressed orange", "“Our house Manhattan, softer and a little bittersweet.”"],
            ["Leo's Old Fashioned", "2 oz Woodford Double Oaked, ¼ demerara, 3 dash Angostura. Large cube, rocks glass", "“Double oaked bourbon, so it's rich and a little toasty.”"],
            ["Garden Gimlet", "2 oz Hendrick's, ¾ lime cordial, muddled cucumber. Shaken, up, cucumber ribbon", "“Bright and cool, like a garden in a glass.”"],
            ["Harvest Mule", "The autumn special. 1½ Ketel One, ¾ spiced pear, ginger beer. Copper mug, pear fan", "“Our fall mule, spiced pear and ginger.”"],
            ["Smoke & Velvet", "1½ mezcal, ½ Aperol, 1 grapefruit, ½ agave. Shaken, rocks, salt on half the rim so the guest can choose", "“Smoky and bright, with salt if you want it.”"],
            ["Espresso Martini", "1½ Belvedere, 1 fresh espresso, ½ coffee liqueur. Hard shake, coupe, three coffee beans", "“Made with a fresh shot, so it has a real crema.”"],
          ],
        },
      },
      {
        h: "Stirred or shaken",
        p: "Spirit only drinks are stirred, for clarity and a silky texture. Anything with citrus, cream, egg or fresh espresso is shaken. The Espresso Martini gets a hard shake because that is what builds the foam.",
      },
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
    manual: "Manual pp. 32 to 34",
    quiz: "q-pos",
    rubric: "pos-accuracy",
    sections: [
      {
        h: "Your PIN",
        p: "Your PIN is your signature. Clock in and ring only under your own PIN. Never ring under a colleague's PIN, even when they are busy and ask you to, and never let anyone use yours.",
      },
      {
        h: "With your trainer",
        list: [
          "Open the table and enter the guest count first.",
          "Ring every item to a seat number.",
          "Modifiers such as ‘medium rare’ come from the button, not free text.",
          "Allergies use the red ALLERGY modifier on the seat.",
          "Course it: firsts fire on send; mains are held and fired when you clear the first course.",
          "The soufflé is rung with the mains and flagged ‘fire now’.",
        ],
      },
      {
        h: "Splits, transfers, comps",
        list: [
          "Splits are by seat. That is why every item carries a seat number.",
          "Moving a check to the bar needs the manager's approval.",
          "Comps and voids need a manager card and a reason.",
        ],
      },
      { h: "Closing a check", p: "Present within two minutes of the ask. Run the card at the table, return it with the slip and a pen. Close out every check before you leave the section." },
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
    manual: "Manual pp. 35 to 36",
    quiz: "q-glass",
    rubric: "glassware-polish",
    sections: [
      {
        h: "Polishing glassware",
        list: [
          "Steam over hot water, polish with a clean linen in each hand. Your fingers never touch the bowl.",
          "Hold it to the light. No spots, no lint, no fingerprints.",
          "Carry by the stem, never the rim. More than four glasses go on a rack, not in your hands.",
        ],
      },
      {
        h: "Silverware",
        list: [
          "Polish with vinegar water and linen; inspect both sides.",
          "Handle by the handle only, never the tines or the blade.",
          "Roll ups: knife, fork, spoon, with the napkin seam underneath.",
        ],
      },
      {
        h: "The 1906 setting",
        list: [
          "Two forks on the left. Two knives on the right, blades facing in toward the plate.",
          "Bread plate top left, with the butter knife.",
          "Water, white and red glasses top right, on a diagonal.",
          "The whole setting sits one inch from the table edge.",
        ],
      },
      { h: "Graded", p: "Polishing and setting are graded on the floor, glassware and silverware, and every grade is signed by both the grader and you." },
    ],
  },
  {
    slug: "table-setting-sidework",
    n: 12,
    title: "Side Work, Opening & Closing",
    category: "Standards",
    summary: "The opening and closing checklists line by line, and why every line is initialled and timed.",
    minutes: 10,
    roles: ["server", "busser", "food_runner", "host", "expo", "barback", "bartender"],
    manual: "Manual pp. 37 to 39",
    quiz: "q-sidework",
    rubric: "silverware-setting",
    sections: [
      {
        h: "Opening",
        list: [
          "Ice in the ice bin, then poured into the wells behind the bar.",
          "Centerpieces and candles on every table.",
          "Glassware polished, silverware rolled and stocked.",
          "Reservations reviewed for VIPs, allergies and large parties.",
        ],
      },
      {
        h: "Closing",
        list: [
          "Centerpieces off, tables stripped and wiped.",
          "Linens changed, and silverware rolled for tomorrow: knife, fork, spoon, napkin seam underneath.",
          "Floor vacuumed, including under the banquettes. Every night, not only the walkways.",
        ],
      },
      {
        h: "Initials and time",
        p: "You initial each line as you finish it, so we know who finished it and when. The manager then verifies the list, signs it and submits it; the last person on shift does not. Opening is due by 11:00 am; closing by 1:00 am.",
      },
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
    manual: "Manual pp. 40 to 41",
    quiz: "q-delivery",
    sections: [
      {
        h: "The rules",
        list: [
          "Food from the left. Drinks and clearing from the right.",
          "Ladies first, then clockwise; the host last.",
          "Every plate announced as it lands: “The Dover sole, deboned at the table.”",
          "Plate placed with the protein at six o'clock, nearest the guest.",
          "Never auction food (“Who had the filet?”). The seat numbers are on the ticket.",
          "Clear only when everyone has finished, unless a guest asks you to take their plate.",
        ],
      },
      { h: "Running for others", p: "Full hands in, full hands out. If a table you ran for is waiting on something, a side or a sauce, you own it until it lands. You do not pass it back to their server." },
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
    manual: "Manual pp. 42 to 44",
    quiz: "q-recovery",
    sections: [
      { h: "Recognition", p: "Regulars are greeted by name. Check the reservation notes for anniversaries, preferences and past orders before the table arrives, so you never have to ask." },
      {
        h: "LAST",
        list: [
          "Listen: all the way to the end, without interrupting.",
          "Apologise: sincerely, once. Not on every visit.",
          "Solve: fix it, or bring the manager who can.",
          "Thank: thank them for telling you.",
        ],
      },
      {
        h: "Manager in",
        p: "Only the manager approves a comp. Any comp, any complaint about a person, and any allergy concern, even after the guest has eaten: the manager visits the table before it leaves.",
      },
      { h: "The thank you", say: "“Thank you for spending your evening with us, Mr. Alvarez. We'll see you soon.”" },
    ],
  },
];

export const MODULE_BY_SLUG = Object.fromEntries(MODULES.map((m) => [m.slug, m])) as Record<string, Module>;

/** Modules required for a store role. Managers see every module but are not tracked against them. */
export function modulesFor(role: string) {
  return MODULES.filter((m) => m.roles.includes(role));
}
