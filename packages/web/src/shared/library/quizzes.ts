// Knowledge checks. Ten questions each, taken on the staff member's phone. 80% to pass.
// Written to test judgement on the floor, not trivia like clock in times.
// Every question is answered in its module: the last field names the section that teaches it.
import type { Question, Quiz } from "../program";

type Q = [q: string, choices: string[], answer: number, why: string, see: string];

function quiz(slug: string, title: string, module: string | undefined, level: Quiz["level"], qs: Q[]): Quiz {
  return {
    slug,
    title,
    module,
    level,
    questions: qs.map(([q, choices, answer, why, see], i): Question => {
      const id = `${slug}-${i + 1}`;
      // Deterministic shuffle so the right answer isn't always in the same slot.
      const order = choices.map((_, k) => k).sort((a, b) => hash(`${id}:${a}`) - hash(`${id}:${b}`));
      return { id, q, choices: order.map((k) => choices[k]!), answer: order.indexOf(answer), why, see };
    }),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BASE: Quiz[] = [
  quiz("q-standard", "The 1906 Standard", "the-1906-standard", "Core", [
    ["A guest asks where the restroom is. What do you do?", ["Point to the hallway past the bar", "Tell them it is past the bar on the left", "Walk them there yourself", "Ask a host to show them"], 2, "“Walk it, don't point it.” You take them, you don't hand them off.", "Leo says"],
    ["A guest thanks you for refilling their water. The house reply is…", ["“No problem.”", "“My pleasure.”", "“You got it.”", "“No worries.”"], 1, "‘My pleasure’ is the reply to every thank you.", "Leo says"],
    ["You are heading back to the kitchen from a table. What should be in your hands?", ["Nothing, so you can move fast", "Only your check presenter", "Whatever needs to go back: glasses, plates, linen", "Your order pad"], 2, "A full hand in, a full hand out.", "Leo says"],
    ["A guest asks what you would order. The right answer is…", ["The most expensive dish on the menu", "Whatever the kitchen needs to move tonight", "The dish you genuinely love, and why", "“Everything is good.”"], 2, "Recommend what you love, and say why.", "Leo says"],
    ["According to the house sayings, which part of the evening most shapes what a guest remembers?", ["The first drink", "The bread service", "The last five minutes", "The reservation call"], 2, "The check, the coats and the goodbye. The last five minutes are the first thing they remember.", "Leo says"],
    ["You pass line up in a pressed black shirt but realise you left your wine key at home. What is it?", ["Fine, as long as you borrow one", "A dress code miss and a strike, even if you borrow one after", "Only a problem on wine nights", "Nothing, the bar supplies wine keys"], 1, "The wine key and two pens are part of the uniform. Borrowing one after the check does not undo it.", "How we look"],
    ["Dinner line up is at 4:00. You walk in at 4:07 and clock in at 4:08. You are…", ["On time, there is a ten minute grace period", "Late: more than five minutes after the start", "On time, because you clocked in before 4:10", "Only late if you missed the specials"], 1, "There is no grace period. More than five minutes after the start is late.", "Being on time"],
    ["You agreed to cover a colleague's Saturday. Which of these makes the swap count?", ["A verbal OK from your colleague", "A screenshot showing the date, the start time and their written yes", "Telling the host before the shift", "A text that says “sure, take it”"], 1, "Date, start time and a written yes, in a screenshot.", "Being on time"],
    ["“The table is never yours” means…", ["Tables are assigned by the manager each night", "You are a guest in their evening: their pace, their occasion", "Bussers take over the table after the entrée", "Tips are pooled across the section"], 1, "We fit around their evening. We never rush a table to turn it.", "Leo says"],
    ["What is the one promise we make every guest?", ["The fastest service in town", "They leave feeling expected, known and looked after", "A free dessert on their birthday", "A table within fifteen minutes"], 1, "Expected, known and looked after, first visit or fortieth.", "What we promise"],
  ]),
  quiz("q-steps", "Steps of Service", "steps-of-service", "Core", [
    ["A four top sits down. How long do you have to greet them?", ["30 seconds", "60 seconds", "2 minutes", "Once they have looked at the menu"], 1, "Within 60 seconds of the guest sitting down.", "The steps and the clock"],
    ["When should a bottle of wine be poured?", ["After the first course lands", "Before the first course lands", "With the entrées", "Whenever the guest asks"], 1, "Presented and poured before the first course lands.", "The steps and the clock"],
    ["You are taking the order at a table of four. The host is at seat 1. Who do you start with?", ["The host", "Whoever looks ready", "Ladies first, then clockwise from the host", "The guest on your left"], 2, "Ladies first, then clockwise from the host.", "The steps and the clock"],
    ["A table wants the chocolate soufflé. When does it have to be ordered, and why?", ["With the entrées, because it takes 20 minutes", "When the mains are cleared, so it arrives hot", "With the starters, because it takes 45 minutes", "Any time, it takes ten minutes"], 0, "It is baked to order and takes 20 minutes, so it goes in with the entrées.", "Why the soufflé goes in early"],
    ["The first course has landed. When do you check back?", ["Within two bites or two minutes", "When the plates are half empty", "Only if they wave you over", "When you bring the entrées"], 0, "Two bites or two minutes.", "The steps and the clock"],
    ["Two of four guests have finished their mains and nobody has asked. Do you clear?", ["Yes, clear what is finished", "No, wait until every guest has finished", "Clear only the bread plates", "Yes, if the kitchen needs the plates"], 1, "Clearing early tells the slower guests to hurry.", "Clearing"],
    ["During the menu introduction you should…", ["Read the menu top to bottom", "Cover the two specials, the market fish and the 86 list", "Mention only the most expensive items", "Wait for questions"], 1, "Two specials, the market fish, the 86 list. Never read the menu to them.", "The steps and the clock"],
    ["A table is celebrating an anniversary. What does reading the table ask of you?", ["Be precise and quick", "Slow down, make room for the moment and tell the manager", "Fewer touches and drop the check early", "Tell the story of 1906"], 1, "Celebration: slow down, make room, tell the manager.", "Reading the table"],
    ["The guest asks for the check. You have…", ["5 minutes", "2 minutes", "Until your next table is greeted", "10 minutes"], 1, "Check presented within 2 minutes of asking.", "The steps and the clock"],
    ["To be signed off on Steps of Service you need, on the floor grade…", ["3 stars on every competency", "An average of 3.5 stars across six competencies", "5 stars on the greeting", "A pass from two managers"], 1, "Six competencies, 1 to 5 stars each, 3.5 average to sign off.", "Graded on the floor"],
  ]),
  quiz("q-upsell", "The Art of the Upsell", "art-of-the-upsell", "Core", [
    ["Which opening is a leading question?", ["“Anything to drink?”", "“Would you like a drink?”", "“Can I start you with a glass of the Veuve, or one of our cocktails? The 1906 is my favourite.”", "“Are you drinking tonight?”"], 2, "It offers a choice between two good options.", "Leading questions, not yes or no questions"],
    ["A guest orders a vodka soda. You say…", ["“Coming right up.”", "“Would you like that with Ketel One or Grey Goose?”", "“Is well vodka OK?”", "“Lime or lemon?”"], 1, "Call it up with a choice of two brands.", "Leading questions, not yes or no questions"],
    ["Which of the three moments is the single biggest lever on the check?", ["Dessert", "The wine with the entrée", "The first drink", "Coffee"], 1, "The wine with the entrée.", "The three moments"],
    ["When do you ask “Have you saved room for the soufflé? I'll need to fire it now.”?", ["When dropping the check", "When taking the entrée order", "With the first drink", "After clearing the mains"], 1, "The soufflé is fired with the entrées, so you ask then.", "Leading questions, not yes or no questions"],
    ["A guest declines dessert. You…", ["Describe the soufflé again", "Offer a half portion", "Thank them and offer a coffee or a digestif once, then move on", "Bring the dessert menu anyway"], 2, "Never push. The finish can still be a coffee or a digestif.", "What it is not"],
    ["How is your average dollar sale per ticket worked out?", ["Net sales divided by guests", "Net sales divided by POS tickets", "Gross sales divided by tables", "Tips divided by tickets"], 1, "Net sales ÷ POS tickets. Per ticket, not per guest.", "How your number is worked out"],
    ["Which of these shifts counts toward your number?", ["A dinner you spent training a new server", "A private buyout on a fixed price menu", "A lunch in your own section, on your own", "A dinner you were sent home from after 2 hours"], 2, "Only solo serving counts. Training, events and shifts under 3 hours do not.", "Which shifts count"],
    ["Your dinner target is $78. Which rolling 30 day average, with 9 solo shifts, earns the $150?", ["$78.00", "$80.50", "$82.00", "Any average, after one $120 Saturday"], 2, "5% over $78 is $81.90, so $82.00 qualifies. $80.50 is at target, which earns the non cash rewards.", "What it earns"],
    ["You are 8% over target on 6 solo shifts this month. Do you get the cash bonus?", ["Yes, you are over 5%", "No, it needs at least 8 solo shifts", "Yes, but half of it", "Only if a manager approves"], 1, "The minimum is 8 solo shifts in the month.", "What it earns"],
    ["What makes a recommendation credible?", ["Mentioning the price", "Saying it is the most popular dish", "Recommending what you would order and saying why", "Saying the chef insists"], 2, "What you would order yourself, and why.", "What it is not"],
  ]),
  quiz("q-menu", "Menu & Allergens", "menu-allergens", "Core", [
    ["A guest with a tree nut allergy asks about the burrata. You say…", ["It is safe, burrata is only dairy", "It has toasted hazelnut, so I will check with the kitchen for an alternative", "They can pick the nuts off", "It is fine because the figs are roasted"], 1, "The burrata is finished with toasted hazelnut, a tree nut.", "Starters"],
    ["Which starter contains fish, egg, dairy and gluten?", ["Steak tartare", "Caesar", "Oysters", "Lobster bisque"], 1, "White anchovy, an egg yolk dressing, parmesan and a sourdough crouton.", "Starters"],
    ["A table is in a hurry. How long does the Dover sole meunière take?", ["10 minutes", "15 minutes", "25 minutes", "35 minutes"], 2, "Deboned tableside. Allow 25 minutes.", "Mains"],
    ["The dry aged ribeye is…", ["16 oz boneless, aged 21 days", "22 oz bone in, aged 35 days, best medium rare", "22 oz boneless, aged 28 days", "18 oz bone in, aged 45 days"], 1, "22 oz, bone in, dry aged 35 days in house.", "Mains"],
    ["A vegan guest asks about the risotto. You say…", ["It is vegan as written", "It can be made vegan, finished with olive oil instead of butter and parmesan, and I will ring it that way", "We have no vegan options", "Try the halibut instead"], 1, "Vegetarian as written; vegan on request.", "Mains"],
    ["Where is an allergy recorded?", ["As a free text note on the check", "On the POS against the seat with the red ALLERGY modifier, then told to the expo in person", "Told only to the manager", "Written on the ticket by hand"], 1, "Ring it against the seat, tell the expo in person.", "The allergy protocol"],
    ["A guest asks if the halibut can be made without dairy and you are not sure. You…", ["Say yes, it is fish", "Say “Let me check with the kitchen.”", "Suggest they skip the sauce", "Ask another server"], 1, "Never guess. Check with the kitchen.", "The allergy protocol"],
    ["Which two dishes are on for autumn only?", ["The soufflé and the crème brûlée", "The burrata with roasted figs and the apple tarte tatin", "The oysters and the bisque", "The duck and the halibut"], 1, "Burrata with roasted figs and the apple tarte tatin.", "Desserts"],
    ["Who runs an allergy plate to the table?", ["The server", "The food runner", "The manager", "The expo"], 2, "The manager runs the plate.", "The allergy protocol"],
    ["The lobster bisque is finished with…", ["Sherry in the kitchen", "Cognac poured at the table", "Brandy cream", "Madeira"], 1, "Cognac poured at the table.", "Starters"],
  ]),
  quiz("q-wine", "Wine List", "wine-list", "Core", [
    ["What is our oakiest Chardonnay?", ["William Fèvre Chablis ‘Montmains’", "Kistler ‘Les Noisetiers’", "Rombauer, Carneros", "Cloudy Bay"], 2, "Full malolactic and new French oak.", "Chardonnay, lean to oaky"],
    ["A guest wants a Chardonnay but says “nothing oaky, please.” You pour…", ["Rombauer", "Kistler", "Fèvre Chablis ‘Montmains’", "Caymus"], 2, "The Chablis sees no new oak.", "Chardonnay, lean to oaky"],
    ["Which red do you recommend first with a medium rare ribeye?", ["Domaine Serene Pinot Noir", "Silver Oak Cabernet", "Duckhorn Merlot", "Catena Malbec"], 1, "Silver Oak's firm tannin cuts the fat.", "What to pour with what"],
    ["What do you recommend first with the duck breast?", ["Silver Oak Cabernet", "Pinot Noir: Domaine Serene or Gevrey Chambertin", "Rombauer", "Cloudy Bay"], 1, "Pinot Noir with duck.", "What to pour with what"],
    ["How many 5 oz glasses does a 750 ml bottle pour?", ["Four", "Five", "Six", "Seven"], 1, "Five pours per bottle.", "Temperatures and pours"],
    ["Gevrey Chambertin is made from…", ["Cabernet Sauvignon", "Syrah", "Pinot Noir", "Merlot"], 2, "Red Burgundy is Pinot Noir.", "Reds by the bottle"],
    ["What is in Tignanello besides Sangiovese?", ["Merlot only", "Cabernet", "Syrah", "Pinot Noir"], 1, "A Super Tuscan: Sangiovese with Cabernet.", "Reds by the bottle"],
    ["At what temperature do we serve reds?", ["45 to 50°F", "50 to 55°F", "60 to 65°F", "68 to 72°F"], 2, "Reds 60 to 65°F.", "Temperatures and pours"],
    ["Which pour goes first with oysters?", ["Caymus", "Chablis ‘Montmains’ or the Veuve", "Rombauer", "Catena Malbec"], 1, "Mineral, oyster shell Chablis, or Champagne.", "What to pour with what"],
    ["Côte Rôtie ‘Brune et Blonde’ is…", ["A Bordeaux blend", "Northern Rhône Syrah, cofermented with a little Viognier", "Spanish Tempranillo", "Napa Cabernet"], 1, "Northern Rhône Syrah with a little Viognier.", "Reds by the bottle"],
  ]),
  quiz("q-wine-service", "Wine Service & Presentation", "wine-service", "Core", [
    ["You present the bottle to…", ["The guest who ordered it", "The whole table", "The host, label facing them, naming producer, wine and vintage", "Whoever is closest"], 2, "Present to the host, label facing them.", "The sequence"],
    ["Where do you cut the foil?", ["Above the lip", "Below the lip, in one clean line", "You remove it entirely", "You leave it on"], 1, "Below the lip, one clean line; pocket the foil.", "The sequence"],
    ["Where does the cork go?", ["In your apron", "To the host's right", "On the bread plate", "Back in the neck of the bottle"], 1, "Place it to the host's right.", "The sequence"],
    ["Who gets the taste pour?", ["The guest who chose the wine", "The host", "The eldest guest", "Nobody, you pour straight away"], 1, "A taste for the host; wait for the nod.", "The sequence"],
    ["After the taste, the pouring order is…", ["Host first, then clockwise", "Ladies first, clockwise, host last", "Clockwise from your left", "Whoever asks first"], 1, "Ladies first, clockwise, host last.", "The sequence"],
    ["How full do you pour?", ["To the rim of the bowl", "5 oz, never above the widest part of the glass", "Half the glass", "6 oz for reds"], 1, "5 oz, never above the widest part.", "The sequence"],
    ["A guest says the wine is “not what I expected.” You…", ["Explain why the wine is correct", "Thank them, take it away without debate and tell the manager", "Pour them another taste", "Offer a discount on the bottle"], 1, "Never argue. It is replaced or swapped, and the manager is told.", "If a guest sends a bottle back"],
    ["Which is a good one sentence story?", ["“It's a red.”", "“It's $165.”", "“Silver Oak from Alexander Valley. American oak, so cedar and vanilla. Made for the ribeye.”", "“People like it.”"], 2, "Producer, place, and why it suits the dish.", "One sentence of story"],
    ["When you set the bottle down, the label faces…", ["The kitchen", "The host", "You", "The middle of the table"], 1, "Label facing the host.", "The sequence"],
    ["Opening the cork should be…", ["A loud pop for theatre", "Quiet, eased out", "Done at the service station", "Done by the bartender"], 1, "Ease the cork out quietly. No pop.", "The sequence"],
  ]),
  quiz("q-liquor", "Liquor Brands", "liquor-brands", "Core", [
    ["Our well gin is…", ["Tanqueray", "Beefeater", "Hendrick's", "The Botanist"], 1, "Beefeater is well; Tanqueray is call; Hendrick's and The Botanist are premium.", "Well · call · premium"],
    ["Which Scotch is peated, from Islay?", ["Glenlivet 12", "Macallan 12", "Lagavulin 16", "Dewar's"], 2, "Lagavulin 16, the smoky Islay malt.", "Well · call · premium"],
    ["A guest asks for a premium reposado tequila. You offer…", ["Espolòn", "Casamigos Blanco", "Clase Azul Reposado", "Bacardí"], 2, "Clase Azul Reposado or Don Julio 1942.", "Well · call · premium"],
    ["“Up” means…", ["Over ice", "Chilled and strained into a coupe", "Room temperature, no ice", "A double"], 1, "Up: chilled, strained into a coupe.", "Neat, up, rocks"],
    ["A “perfect” Manhattan has…", ["Extra bourbon", "Equal parts dry and sweet vermouth", "No vermouth", "A cherry and an orange"], 1, "Perfect means equal dry and sweet vermouth.", "Neat, up, rocks"],
    ["Which is a call bourbon on our list?", ["Old Forester", "Buffalo Trace", "Blanton's", "Woodford Double Oaked"], 1, "Buffalo Trace and Maker's Mark are call.", "Well · call · premium"],
    ["A guest orders a gin and tonic. You say…", ["“Is well OK?”", "“Would you like Tanqueray or Hendrick's in that?”", "“Beefeater it is.”", "“Lime?”"], 1, "Never ring a well drink without offering a choice.", "Call it up"],
    ["“Neat” is served…", ["Over one large cube", "Chilled and strained", "Room temperature, no ice", "With a splash of water"], 2, "Neat: room temperature, no ice.", "Neat, up, rocks"],
    ["Our premium rum is…", ["Bacardí", "Mount Gay Eclipse", "Diplomático Reserva", "Captain Morgan"], 2, "Bacardí is well, Mount Gay is call, Diplomático is premium.", "Well · call · premium"],
    ["A dirty martini contains…", ["Extra vermouth", "Olive brine", "Bitters", "A lemon twist"], 1, "Dirty means olive brine.", "Neat, up, rocks"],
  ]),
  quiz("q-beer", "Beer Brands", "beer-brands", "Core", [
    ["Which draft is the autumn seasonal?", ["Pilsner Urquell", "Allagash White", "Ayinger Oktober Fest Märzen", "Sierra Nevada Pale Ale"], 2, "Ayinger Märzen, toasty malt.", "On draft"],
    ["Which beer is brewed with orange peel and coriander?", ["Allagash White", "Guinness", "Pilsner Urquell", "Sierra Nevada"], 0, "Allagash White, a Belgian wit.", "On draft"],
    ["A guest at the bar with the burger wants something hoppy. You pour…", ["Allagash White", "Sierra Nevada Pale Ale", "Weihenstephaner", "Ayinger"], 1, "Piney, bitter pale ale with the burger.", "On draft"],
    ["What do we offer a guest who is not drinking but wants an IPA?", ["Guinness", "Athletic Run Wild", "Pilsner Urquell", "Nothing"], 1, "Athletic Run Wild, a non alcoholic IPA.", "Bottles and cans"],
    ["How much head on a draft pour?", ["None", "Half an inch", "One inch", "Two inches"], 2, "One inch of head.", "The pour"],
    ["Hefeweizen goes in…", ["A pint glass", "The tall wheat glass", "A snifter", "A tulip"], 1, "Wit and hefeweizen go in the tall wheat glass.", "The pour"],
    ["Which draft goes best with oysters?", ["Ayinger", "Pilsner Urquell", "Sierra Nevada", "Guinness"], 1, "Crisp Czech pilsner with oysters.", "On draft"],
    ["How do you start a draft pour?", ["Glass upright", "Glass at 45°, straighten at half", "Glass flat", "Fast into the centre"], 1, "Glass at 45°, straighten at half.", "The pour"],
    ["A guest wants a beer with the duck. You suggest…", ["Allagash White", "Ayinger Oktober Fest Märzen", "Pilsner Urquell", "Athletic Run Wild"], 1, "Toasty Märzen with duck or ribeye.", "On draft"],
    ["Guinness Draught is served from…", ["A tap", "A nitro can", "A bottle", "A growler"], 1, "The nitro can.", "Bottles and cans"],
  ]),
  quiz("q-cocktails", "Specialty Cocktails", "specialty-cocktails", "Core", [
    ["What is in The 1906?", ["Rye, sweet vermouth, bitters", "Bourbon, Amaro Nonino, orange bitters", "Gin, Campari, vermouth", "Bourbon, lemon, honey"], 1, "2 oz bourbon, ¾ Amaro Nonino, 2 dash orange bitters.", "The list"],
    ["How is The 1906 built?", ["Shaken, rocks", "Stirred, up, coupe, expressed orange", "Built in a highball", "Shaken, up"], 1, "Spirit only, so it is stirred.", "The list"],
    ["Leo's Old Fashioned uses which bourbon?", ["Maker's Mark", "Blanton's", "Woodford Double Oaked", "Buffalo Trace"], 2, "Woodford Double Oaked.", "The list"],
    ["Which cocktail is the autumn special?", ["Garden Gimlet", "Harvest Mule", "Smoke & Velvet", "Espresso Martini"], 1, "Harvest Mule: spiced pear, ginger beer, copper mug.", "The list"],
    ["The Garden Gimlet is made with…", ["Ketel One", "Hendrick's", "Beefeater", "Tanqueray"], 1, "2 oz Hendrick's, lime cordial, muddled cucumber.", "The list"],
    ["Why is the Espresso Martini shaken hard?", ["Only to chill it", "It has fresh espresso, and the hard shake builds the foam", "House preference", "It is stirred, not shaken"], 1, "Anything beyond spirit is shaken; the hard shake builds the crema.", "Stirred or shaken"],
    ["Smoke & Velvet has a salt rim on…", ["The whole rim", "Half the rim, so the guest can choose", "No rim", "The base of the glass"], 1, "Half the rim, so the guest can choose.", "The list"],
    ["How many coffee beans garnish the Espresso Martini?", ["One", "Two", "Three", "Five"], 2, "Three beans.", "The list"],
    ["A drink with citrus should be…", ["Stirred", "Shaken", "Built", "Blended"], 1, "Citrus, cream or egg: shake it.", "Stirred or shaken"],
    ["What base spirit is in Smoke & Velvet?", ["Tequila", "Mezcal", "Scotch", "Rum"], 1, "1½ mezcal, ½ Aperol, grapefruit, agave.", "The list"],
  ]),
  quiz("q-pos", "POS Walkthrough", "pos-walkthrough", "Core", [
    ["A colleague asks you to ring an item under their PIN while they are busy. You…", ["Do it quickly, it saves time", "Ring only under your own PIN", "Use the manager's card", "Write it on paper for later"], 1, "Your PIN is your signature. Never someone else's.", "Your PIN"],
    ["A guest has a shellfish allergy. On the POS you use…", ["A free text note", "The red ALLERGY modifier on the seat", "A comment on the check", "Nothing, you tell the kitchen"], 1, "Red ALLERGY modifier against the seat.", "With your trainer"],
    ["When are mains fired?", ["On send", "When you clear the first course", "When the guest asks", "Ten minutes after send"], 1, "Mains are held and fired when you clear the first course.", "With your trainer"],
    ["How is the soufflé rung?", ["With dessert", "With the mains, flagged ‘fire now’", "On a separate check", "With the starters"], 1, "With the mains, flagged ‘fire now’.", "With your trainer"],
    ["A table wants to split by person. You split…", ["Evenly", "By seat", "By card", "By course"], 1, "Splits are by seat, which is why every item has a seat number.", "Splits, transfers, comps"],
    ["Moving a check to the bar needs…", ["Nothing", "The manager's approval", "The bartender's PIN", "The guest's signature"], 1, "Transfers to the bar need the manager's approval.", "Splits, transfers, comps"],
    ["A dish was sent back. To comp it you need…", ["Your own PIN", "A manager card and a reason", "The chef's OK", "Nothing"], 1, "Comps and voids need a manager card and a reason.", "Splits, transfers, comps"],
    ["When must you close out your checks?", ["End of the week", "Before you leave the section", "When the manager asks", "Next shift"], 1, "Close out before you leave the section.", "Closing a check"],
    ["Modifiers like ‘medium rare’ are entered…", ["As free text", "From the button", "Told to the kitchen in person", "Written on the ticket"], 1, "Modifiers from the button, not free text.", "With your trainer"],
    ["After opening the table, the first thing you enter is…", ["The drinks", "The guest count", "The check split", "Your name"], 1, "Open the table and enter the guest count first.", "With your trainer"],
  ]),
  quiz("q-glass", "Glassware & Silverware", "glassware-silverware", "Core", [
    ["How do you hold a wine glass while polishing?", ["By the bowl", "A linen in each hand, fingers never on the bowl", "By the rim", "Bare hands"], 1, "Two linens; never touch the bowl.", "Polishing glassware"],
    ["How do you check a polished glass?", ["Feel it", "Hold it to the light", "Smell it", "Tap it"], 1, "To the light: no spots, lint or prints.", "Polishing glassware"],
    ["You need to carry six stems to a table. You…", ["Carry them by the rims", "Use a rack", "Carry three per hand by the stems", "Stack them"], 1, "More than four go on a rack.", "Polishing glassware"],
    ["Silverware is polished with…", ["Dish soap", "Vinegar water and linen", "A dry towel only", "Sanitiser spray"], 1, "Vinegar water and linen; inspect both sides.", "Silverware"],
    ["When setting a knife, the blade faces…", ["Out", "In, toward the plate", "Up", "It does not matter"], 1, "Blades in.", "The 1906 setting"],
    ["Where is the bread plate?", ["Top right", "Top left, with the butter knife", "Centre", "Bottom left"], 1, "Top left with the butter knife.", "The 1906 setting"],
    ["How far from the table edge is the setting?", ["Flush", "One inch", "Two inches", "Half an inch"], 1, "One inch from the edge.", "The 1906 setting"],
    ["The glasses sit…", ["Top left", "Top right on a diagonal: water, white, red", "In a line across the top", "In the centre"], 1, "Top right on a diagonal.", "The 1906 setting"],
    ["How do you pick up a fork?", ["By the tines", "By the handle only", "Either way", "With a napkin over the tines"], 1, "By the handle only.", "Silverware"],
    ["Who signs a glassware polish grade?", ["Just the grader", "The grader and you", "The GM", "Nobody"], 1, "Both the grader and you sign.", "Graded"],
  ]),
  quiz("q-sidework", "Side Work, Opening & Closing", "table-setting-sidework", "Core", [
    ["When is the opening checklist due?", ["10:00 am", "10:30 am", "11:00 am", "Noon"], 2, "Opening is due by 11:00 am.", "Initials and time"],
    ["When is the closing checklist due?", ["11:00 pm", "Midnight", "1:00 am", "2:00 am"], 2, "Closing by 1:00 am.", "Initials and time"],
    ["Who signs and submits a checklist?", ["The last person on shift", "The manager, after verifying it", "The host", "Anyone"], 1, "The manager verifies, signs and submits.", "Initials and time"],
    ["Before service, reservations are reviewed for…", ["Party size only", "VIPs, allergies and large parties", "Names only", "Nothing, the host does it"], 1, "VIPs, allergies and large parties.", "Opening"],
    ["Roll ups for tomorrow are…", ["Fork, knife, spoon; seam up", "Knife, fork, spoon; napkin seam underneath", "Any order", "Spoon, fork, knife"], 1, "Knife, fork, spoon; seam underneath.", "Closing"],
    ["At closing the floor is vacuumed…", ["Only the walkways", "Including under the banquettes", "Every other night", "By the morning crew"], 1, "Including under the banquettes, every night.", "Closing"],
    ["Why do you initial each line?", ["To get paid for it", "So we know who finished it and when", "Only for the health inspector", "No reason"], 1, "Every line is initialled and timed.", "Initials and time"],
    ["On the opening checklist, the ice goes…", ["In the server station", "In the ice bin, then poured into the wells behind the bar", "Into the glasses", "In the walk in"], 1, "Ice in the bin, poured into the wells.", "Opening"],
    ["At closing, centerpieces are…", ["Left on", "Taken off, with tables stripped and wiped", "Moved to the bar", "Thrown out"], 1, "Centerpieces off, tables stripped and wiped.", "Closing"],
    ["Silverware for tomorrow is rolled…", ["At opening", "At closing", "Never", "By the dishwasher"], 1, "Linens changed and silverware rolled for tomorrow.", "Closing"],
  ]),
  quiz("q-delivery", "Food & Drink Delivery", "delivery-etiquette", "Core", [
    ["Food is served from…", ["The right", "The left", "Either side", "The host's side"], 1, "Food from the left.", "The rules"],
    ["Drinks are served and plates cleared from…", ["The left", "The right", "Behind the guest", "Wherever is open"], 1, "Drinks and clearing from the right.", "The rules"],
    ["You arrive with four plates and don't know who had the filet. You…", ["Ask “Who had the filet?”", "Read the seat numbers on the ticket", "Put it in the middle", "Wait for the server"], 1, "Never auction food.", "The rules"],
    ["How do you place a plate?", ["Garnish facing the guest", "Protein at six o'clock", "Protein at twelve o'clock", "However it came"], 1, "Protein at six o'clock.", "The rules"],
    ["As you set the plate down you say…", ["“Enjoy.”", "Nothing", "“The Dover sole, deboned at the table.”", "“Careful, hot.”"], 2, "Every plate is announced.", "The rules"],
    ["Who is served first?", ["The host", "Ladies first, then clockwise; host last", "Whoever ordered first", "Children"], 1, "Ladies first, clockwise; host last.", "The rules"],
    ["A table you ran for is still waiting on a side. You…", ["Tell their server", "Own it until it lands", "Leave it to expo", "Move on to your next run"], 1, "If a table is waiting, you own it until it lands.", "Running for others"],
    ["One guest asks you to take their plate while the others are still eating. You…", ["Refuse politely", "Clear it, because they asked", "Wait until everyone has finished", "Ask the table first"], 1, "Clear only when everyone has finished, unless a guest asks.", "The rules"],
    ["Walking back from the floor empty handed is…", ["Fine", "Against “full hands in, full hands out”", "Required", "Only for runners"], 1, "Full hands in, full hands out.", "Running for others"],
    ["Where is the protein placed relative to the guest?", ["Furthest away", "Nearest them, at six o'clock", "On the left", "On the right"], 1, "Six o'clock, nearest the guest.", "The rules"],
  ]),
  quiz("q-recovery", "Recovery & Guest Relations", "recovery-relations", "Core", [
    ["What does LAST stand for?", ["Look, Ask, Serve, Thank", "Listen, Apologise, Solve, Thank", "Listen, Act, Smile, Tell", "Learn, Apologise, Serve, Treat"], 1, "Listen, Apologise, Solve, Thank.", "LAST"],
    ["A guest complains about their server. Before the table leaves…", ["You comp dessert", "The manager visits the table", "You swap the server", "Nothing"], 1, "Any complaint about a person: the manager visits.", "Manager in"],
    ["How many times do you apologise?", ["Every time you visit", "Once, sincerely", "Never, it admits fault", "Twice"], 1, "Sincerely, once.", "LAST"],
    ["Where do you find a regular's anniversary?", ["Ask them at the table", "The reservation notes", "The POS", "Social media"], 1, "Check the reservation notes before the table arrives.", "Recognition"],
    ["A guest raises an allergy concern after eating. You…", ["Reassure them", "Get the manager to the table", "Check the recipe yourself", "Offer a drink"], 1, "Any allergy concern, even after eating: the manager visits.", "Manager in"],
    ["While a guest explains a problem you…", ["Interrupt to fix it fast", "Listen all the way to the end", "Fetch the manager straight away", "Explain the kitchen's side"], 1, "Listen, all the way to the end.", "LAST"],
    ["The last step of LAST is…", ["Solve", "Thank them for telling you", "Comp the item", "Log it"], 1, "Thank them for telling you.", "LAST"],
    ["The farewell is…", ["“Have a good night.”", "“Thank you for spending your evening with us,” and their name", "“Bye!”", "Left to the host"], 1, "Thank them by name.", "The thank you"],
    ["Regulars are greeted…", ["The same as everyone", "By name", "With a free drink", "By the manager only"], 1, "Regulars by name.", "Recognition"],
    ["Who can approve a comp?", ["Any server", "The manager", "The host", "The chef"], 1, "Only the manager approves a comp.", "Manager in"],
  ]),
  quiz("q-somm-challenge", "Sommelier's Table · Advanced", "wine-list", "Advanced", [
    ["A guest wants a big, buttery California Chardonnay. Which bottle is our oakiest?", ["Kistler ‘Les Noisetiers’", "Rombauer, Carneros", "Fèvre Chablis ‘Montmains’", "Cloudy Bay"], 1, "Rombauer: full malolactic, new French oak.", "Chardonnay, lean to oaky"],
    ["Table 12 orders two ribeyes, medium rare. Which red do you recommend first?", ["Domaine Serene Pinot Noir", "Duckhorn Merlot", "Silver Oak Cabernet", "Gevrey Chambertin"], 2, "Silver Oak: the firm tannin cuts the fat.", "What to pour with what"],
    ["A party of ten orders three bottles for a toast of 5 oz each. How many guests can you pour?", ["Ten", "Twelve", "Fifteen", "Eighteen"], 2, "Five pours per 750 ml, so three bottles pour fifteen.", "Temperatures and pours"],
    ["One guest has the duck, the other the Dover sole. One bottle. Which?", ["Silver Oak", "Domaine Serene Pinot Noir", "Caymus", "Catena Malbec"], 1, "Pinot Noir is light enough for the fish, with the fruit for the duck.", "What to pour with what"],
    ["A guest wants a Bordeaux. Which do we pour?", ["Tignanello", "Château Lynch Bages", "Guigal Côte Rôtie", "Duckhorn"], 1, "Lynch Bages, Pauillac.", "Reds by the bottle"],
    ["Which red by the glass is softest for a guest who dislikes tannin?", ["Caymus", "Domaine Serene ‘Yamhill Cuvée’", "Catena Alta Malbec", "Silver Oak"], 1, "The silky Pinot Noir is the softest red we pour by the glass.", "By the glass (5 oz)"],
    ["A guest likes the Kistler but wants something leaner. You move to…", ["Rombauer", "Fèvre Chablis ‘Montmains’", "Caymus", "Veuve"], 1, "The unoaked Chablis is the leanest.", "Chardonnay, lean to oaky"],
    ["A guest wants something bold and Italian with the filet. You offer…", ["Gevrey Chambertin", "Antinori Tignanello", "Cloudy Bay", "Côte Rôtie"], 1, "Tignanello, our bold Italian.", "What to pour with what"],
    ["Which white goes first with the lobster bisque?", ["Cloudy Bay", "Rombauer", "Chablis", "Veuve"], 1, "The richness meets the cream.", "What to pour with what"],
    ["A table orders the Côte Rôtie. Its grape is…", ["Grenache", "Syrah with a little Viognier", "Merlot", "Nebbiolo"], 1, "Northern Rhône Syrah cofermented with Viognier.", "Reds by the bottle"],
  ]),
];

export const QUIZZES: Quiz[] = BASE.map((q) => (q.slug === "q-pos" ? { ...q, kind: "pos" as const } : q));

export const QUIZ_BY_SLUG = Object.fromEntries(QUIZZES.map((q) => [q.slug, q])) as Record<string, Quiz>;

/** Score answers against a library or stored quiz. Returns the fraction correct (0 to 1). */
export function scoreQuiz(questions: Pick<Question, "id" | "answer">[], answers: Record<string, number>) {
  if (!questions.length) return 0;
  const right = questions.filter((q) => answers[q.id] === q.answer).length;
  return right / questions.length;
}
