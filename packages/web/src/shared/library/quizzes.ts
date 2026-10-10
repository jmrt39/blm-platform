// Knowledge checks. Ten questions each, taken on the staff member's phone. 80% to pass.
// Written to test judgement on the floor, not trivia like clock-in times.
import type { Question, Quiz } from "../program";

type Q = [q: string, choices: string[], answer: number, why: string];

function quiz(slug: string, title: string, module: string | undefined, level: Quiz["level"], qs: Q[]): Quiz {
  return {
    slug,
    title,
    module,
    level,
    questions: qs.map(([q, choices, answer, why], i): Question => {
      const id = `${slug}-${i + 1}`;
      // Deterministic shuffle so the right answer isn't always in the same slot.
      const order = choices.map((_, k) => k).sort((a, b) => hash(`${id}:${a}`) - hash(`${id}:${b}`));
      return { id, q, choices: order.map((k) => choices[k]!), answer: order.indexOf(answer), why };
    }),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const QUIZZES: Quiz[] = [
  quiz("q-standard", "The 1906 Standard", "the-1906-standard", "Core", [
    ["A guest asks where the restroom is. What do you do?", ["Point to the hallway past the bar", "Tell them it is past the bar on the left", "Walk them there", "Ask a host to point it out"], 2, "“Walk it, don't point it.”"],
    ["A guest thanks you for refilling their water. The house reply is…", ["“No problem.”", "“My pleasure.”", "“You got it.”", "“Of course, no worries.”"], 1, "Never ‘no problem’ — always ‘my pleasure’."],
    ["You are walking back to the kitchen from a table you just cleared. What should be in your hands?", ["Nothing — you're moving fast", "Only your check presenter", "Whatever else needs to go back — glasses, plates, linen", "Your phone, to check the next ticket"], 2, "A full hand in, a full hand out."],
    ["A guest asks what you would order. The right answer is…", ["The most expensive thing on the menu", "Whatever the kitchen needs to move", "The dish you genuinely love, and why", "“Everything is good.”"], 2, "Recommend what you love, and say why."],
    ["Which detail most shapes what a guest remembers about the evening?", ["The first drink", "The bread service", "The last five minutes", "The reservation call"], 2, "“The last five minutes are the first thing they remember.”"],
    ["You arrive in a pressed black shirt but left your wine key at home. At line-up this is…", ["Fine if you borrow one", "A dress-code miss — a strike under the conduct policy", "Only a problem on wine nights", "The bartender's job to supply"], 1, "Wine key and two pens are part of the uniform; missing items are a dress-code strike."],
    ["Dinner line-up is at 4:00. You walk in at 4:07. You are…", ["On time — there's a grace period of ten minutes", "Late — more than five minutes after the start", "On time if you clock in before 4:10", "Only late if you miss the specials"], 1, "More than five minutes after the start is late."],
    ["You agreed to cover a colleague's Saturday. What do you need for the swap to count?", ["A verbal OK from the colleague", "A screenshot showing the date, start time and a written yes", "Just tell the host", "Nothing — show up"], 1, "Swaps need a screenshot with the date, the start time and a written yes."],
    ["“The table is never yours” means…", ["Tables are assigned by the manager", "You are a guest in their evening — their pace, their occasion", "Bussers own the table after the entrée", "You can't keep tips from one table"], 1, "It's their evening. We fit around it."],
    ["What is the one thing we promise every guest?", ["The fastest service in town", "They leave feeling expected, known and looked after", "A free dessert on their birthday", "A table within fifteen minutes"], 1, "Expected, known and looked after — first visit or fortieth."],
  ]),
  quiz("q-steps", "Steps of Service", "steps-of-service", "Core", [
    ["A four-top sits down. How long do you have to greet them?", ["30 seconds", "60 seconds", "2 minutes", "Once they've looked at the menu"], 1, "Greet within 60 seconds of the guest sitting down."],
    ["When should the wine be poured?", ["After the first course lands", "Before the first course lands", "With the entrées", "Whenever the guest asks"], 1, "Bottle presented and poured before the first course lands."],
    ["You're taking the order at a table of four with the host at seat 1. Who do you start with?", ["The host", "Whoever is ready", "Ladies first, then clockwise from the host", "The guest on your left"], 2, "Ladies first, clockwise from the host."],
    ["A table wants the chocolate soufflé. When must it be ordered?", ["With the entrées", "When the entrées are cleared", "With the starters", "Any time — it takes ten minutes"], 0, "Soufflé is ordered with the entrées — it's a 20-minute dish."],
    ["After the first course lands, when do you check back?", ["Within two bites or two minutes", "When the plates are half empty", "Only if they wave", "When you bring the entrées"], 0, "Two bites or two minutes."],
    ["Two of four guests have finished their mains. Do you clear?", ["Yes — clear what's finished", "No — wait until every guest has finished, unless asked", "Clear only the bread plates", "Yes, if the kitchen needs the plates"], 1, "Clear only when every guest has finished."],
    ["During the menu introduction you should…", ["Read the menu top to bottom", "Cover the two specials, the market fish and the 86 list", "Only mention the most expensive items", "Wait for questions"], 1, "Two specials, the market fish, the 86 list. Never read the menu to them."],
    ["A business dinner is seated. Your approach is…", ["Linger and build rapport", "Precise and quick — don't linger", "Recommend a long tasting menu", "Seat them near the bar"], 1, "Business dinners: precise and quick."],
    ["The guest asks for the check. You have…", ["5 minutes", "2 minutes", "Until the next table is greeted", "10 minutes"], 1, "Check presented within 2 minutes of asking."],
    ["Before entrées arrive you must…", ["Refill bread", "Mark the table with the correct silver", "Pre-bus the water glasses", "Drop the check"], 1, "Mark the table with correct silver before the food arrives."],
  ]),
  quiz("q-upsell", "The Art of the Upsell", "art-of-the-upsell", "Core", [
    ["Which opening question is a leading question?", ["“Anything to drink?”", "“Would you like a drink?”", "“Can I start you with a glass of the Veuve, or the 1906 — my favourite?”", "“Are you drinking tonight?”"], 2, "Offer a choice between two good options."],
    ["A guest orders a vodka soda. You say…", ["“Coming right up.”", "“Would you like that with Ketel One or Grey Goose?”", "“Well vodka OK?”", "“Lime or lemon?”"], 1, "Call it up with a choice of two brands."],
    ["What is the single biggest lever on average check?", ["Dessert", "The wine with the entrée", "Sides", "Coffee"], 1, "The wine with the entrée."],
    ["What are the three moments that move the check?", ["Greeting, order, farewell", "First drink, wine with the entrée, the finish", "Bread, sides, coffee", "Appetiser, entrée, check"], 1, "First drink, wine with the entrée, the finish."],
    ["The Bar & Grille's spend per guest target is…", ["$68", "$74", "$78", "$92"], 2, "$78 spend per guest at the Bar & Grille."],
    ["A guest declines dessert. You…", ["Describe the soufflé again", "Offer a half portion", "Thank them and move on — maybe offer a coffee or digestif once", "Bring a dessert menu anyway"], 2, "Never push. A finish can still be a coffee or digestif."],
    ["A guest orders the ribeye with no sides. The best line is…", ["“Any sides?”", "“The creamed spinach and the maitake are what most people pair with the ribeye.”", "“Sides are $14.”", "“That comes alone.”"], 1, "Recommend specifically, not as a yes/no."],
    ["“Have you saved room for the soufflé? I'll need to fire it now.” is said…", ["When dropping the check", "When taking the entrée order", "With the first drink", "After clearing mains"], 1, "The soufflé is fired with the entrées, so ask then."],
    ["Where does each server's spend per guest appear?", ["On the line-up sheet only", "On their profile after each shift report", "Only at quarter end", "On the POS receipt"], 1, "Spend per guest shows on the profile after each shift report."],
    ["What makes a recommendation credible?", ["Mentioning the price", "Saying it's popular", "Recommending what you'd order and saying why", "Saying the chef insists"], 2, "What you'd order yourself, and why."],
  ]),
  quiz("q-menu", "Menu & Allergens", "menu-allergens", "Core", [
    ["A guest with a tree-nut allergy asks about the burrata. You say…", ["It's safe", "It has toasted hazelnut — I'll check with the kitchen for an alternative", "Just pick the nuts off", "Burrata is dairy only"], 1, "Burrata with roasted figs has toasted hazelnut — tree nut."],
    ["Which starter contains fish, egg, dairy and gluten?", ["Steak tartare", "Caesar", "Oysters", "Lobster bisque"], 1, "White anchovy, parmesan, crouton and an egg dressing."],
    ["How long does the Dover sole meunière take?", ["10 minutes", "15 minutes", "25 minutes", "35 minutes"], 2, "Deboned tableside, 25 minutes."],
    ["The dry-aged ribeye is…", ["16 oz boneless, 21 days", "22 oz bone-in, 35 days", "22 oz boneless, 28 days", "18 oz bone-in, 45 days"], 1, "22 oz, bone-in, dry-aged 35 days, best medium rare."],
    ["A vegan guest asks about the risotto. You say…", ["It's vegan as is", "It can be made vegan with olive oil — I'll ring it that way", "No vegan options", "Have the halibut"], 1, "Vegan on request with olive oil."],
    ["Where is an allergy recorded?", ["As a free-text note", "On the POS against the seat, then tell the expo in person", "Only told to the manager", "Written on the ticket by hand"], 1, "Ring it against the seat, tell the expo; the manager runs the plate."],
    ["You're not sure if the bordelaise contains dairy. You…", ["Guess no", "Say “Let me check with the kitchen”", "Suggest they skip the sauce without checking", "Ask another server"], 1, "Never guess — check with the kitchen."],
    ["Which dessert is seasonal for autumn?", ["Chocolate soufflé", "Crème brûlée", "Apple tarte tatin", "None"], 2, "Apple tarte tatin with crème fraîche — autumn."],
    ["Who runs an allergy plate to the table?", ["The server", "The food runner", "The manager", "The expo"], 2, "The manager runs the plate."],
    ["The lobster bisque is finished with…", ["Sherry in the kitchen", "Cognac at the table", "Brandy cream", "Madeira"], 1, "Finished with cognac at the table."],
  ]),
  quiz("q-wine", "Wine List", "wine-list", "Core", [
    ["What is our oakiest Chardonnay?", ["William Fèvre Chablis ‘Montmains’", "Kistler ‘Les Noisetiers’", "Rombauer, Carneros", "Cloudy Bay"], 2, "Rombauer: full malolactic and new French oak."],
    ["A guest says “nothing oaky, please” and wants a Chardonnay. You pour…", ["Rombauer", "Kistler", "Fèvre Chablis ‘Montmains’", "Caymus"], 2, "Chablis ‘Montmains’ sees no new oak."],
    ["Which red pairs best with a medium-rare ribeye?", ["Domaine Serene Pinot Noir", "Silver Oak Cabernet", "Duckhorn Merlot", "Allagash White"], 1, "Silver Oak's firm tannin cuts the fat of the ribeye."],
    ["What do you recommend first with the duck breast?", ["Silver Oak Cabernet", "Pinot Noir — Domaine Serene or Gevrey-Chambertin", "Rombauer", "Cloudy Bay"], 1, "Pinot Noir with duck."],
    ["How many 5 oz glasses in a 750 ml bottle?", ["Four", "Five", "Six", "Seven"], 1, "750 ml ÷ ~150 ml = five pours."],
    ["Gevrey-Chambertin is made from…", ["Cabernet Sauvignon", "Syrah", "Pinot Noir", "Merlot"], 2, "Red Burgundy is Pinot Noir."],
    ["What is in Tignanello besides Sangiovese?", ["Merlot only", "Cabernet", "Syrah", "Pinot Noir"], 1, "A Super Tuscan — Sangiovese with Cabernet."],
    ["At what temperature do we serve reds?", ["45–50°F", "50–55°F", "60–65°F", "68–72°F"], 2, "Reds 60–65°F."],
    ["Which by-the-glass pour goes with oysters?", ["Caymus", "Chablis ‘Montmains’ or the Veuve", "Rombauer", "Catena Malbec"], 1, "Mineral, oyster-shell Chablis — or Champagne."],
    ["Côte-Rôtie ‘Brune et Blonde’ is…", ["Bordeaux blend", "Northern Rhône Syrah with a little Viognier", "Spanish Tempranillo", "Napa Cabernet"], 1, "Northern Rhône Syrah, co-fermented with a little Viognier."],
  ]),
  quiz("q-wine-service", "Wine Service & Presentation", "wine-service", "Core", [
    ["You present the bottle to…", ["The guest who ordered it, label facing them", "The whole table", "The host, label facing them — producer, wine, vintage", "Whoever is closest"], 2, "Present to the host, label facing them."],
    ["Where do you cut the foil?", ["Above the lip", "Below the lip in one clean line", "Remove it entirely", "Leave it on"], 1, "Below the lip, one clean line; pocket the foil."],
    ["Where does the cork go?", ["In your apron", "To the host's right", "On the bread plate", "Back in the bottle neck"], 1, "Place it to the host's right."],
    ["Who gets the taste pour?", ["The guest who chose the wine", "The host", "The eldest guest", "Nobody — pour straight away"], 1, "A taste for the host; wait for the nod."],
    ["Pouring order after the taste is…", ["Host first, then clockwise", "Ladies first, clockwise, host last", "Clockwise from your left", "Anyone who asks first"], 1, "Ladies first, clockwise, host last."],
    ["How full do you pour?", ["To the rim of the bowl", "5 oz, never above the widest part of the glass", "Half the glass", "6 oz for reds"], 1, "5 oz, never above the widest part."],
    ["A guest says the wine is “not what I expected”. You…", ["Explain why it is correct", "Thank them, take it away without debate and tell the manager", "Pour another taste", "Offer a discount"], 1, "Never argue. Replace or swap, and tell the manager."],
    ["Which is a good “one sentence of story”?", ["“It's a red.”", "“It's $165.”", "“Silver Oak from Alexander Valley — American oak, cedar and vanilla, made for the ribeye.”", "“People like it.”"], 2, "Producer, place, and why it suits the dish."],
    ["When you set the bottle down, the label faces…", ["The kitchen", "The host", "You", "The middle of the table"], 1, "Label facing the host."],
    ["Opening the cork should be…", ["A loud pop for theatre", "Quiet and eased out", "Done at the service station", "Done by the bartender"], 1, "Ease the cork out quietly."],
  ]),
  quiz("q-liquor", "Liquor Brands", "liquor-brands", "Core", [
    ["Our well gin is…", ["Tanqueray", "Beefeater", "Hendrick's", "The Botanist"], 1, "Beefeater → Tanqueray → Hendrick's, The Botanist."],
    ["Which Scotch is peated, from Islay?", ["Glenlivet 12", "Macallan 12", "Lagavulin 16", "Dewar's"], 2, "Lagavulin 16 — smoky Islay malt."],
    ["A guest asks for a premium reposado tequila. You offer…", ["Espolòn", "Casamigos Blanco", "Clase Azul Reposado", "Bacardí"], 2, "Clase Azul Reposado or Don Julio 1942."],
    ["“Up” means…", ["Over ice", "Chilled and strained into a coupe", "Room temperature, no ice", "A double"], 1, "Up: chilled, strained into a coupe."],
    ["A “perfect” Manhattan has…", ["Extra bourbon", "Equal dry and sweet vermouth", "No vermouth", "A cherry and an orange"], 1, "Perfect = equal dry and sweet vermouth."],
    ["Which is a call bourbon on our list?", ["Old Forester", "Buffalo Trace", "Blanton's", "Woodford Double Oaked"], 1, "Buffalo Trace and Maker's Mark are call."],
    ["A guest orders a gin & tonic. You say…", ["“Well OK?”", "“Would you like Tanqueray or Hendrick's in that?”", "“Beefeater it is.”", "“Lime?”"], 1, "Never ring a well drink without offering a choice."],
    ["“Neat” is served…", ["Over one large cube", "Chilled, strained", "Room temperature, no ice", "With a splash of water"], 2, "Neat: room temperature, no ice."],
    ["Our premium rum is…", ["Bacardí", "Mount Gay Eclipse", "Diplomático Reserva", "Captain Morgan"], 2, "Bacardí → Mount Gay → Diplomático."],
    ["A dirty martini contains…", ["Extra vermouth", "Olive brine", "Bitters", "A twist"], 1, "Dirty = olive brine."],
  ]),
  quiz("q-beer", "Beer Brands", "beer-brands", "Core", [
    ["Which draft is the autumn seasonal?", ["Pilsner Urquell", "Allagash White", "Ayinger Oktober Fest-Märzen", "Sierra Nevada Pale Ale"], 2, "Ayinger Märzen — toasty malt."],
    ["Which beer has orange peel and coriander?", ["Allagash White", "Guinness", "Pilsner Urquell", "Sierra Nevada"], 0, "Allagash White — a Belgian wit."],
    ["A guest at the bar with a burger wants something hoppy. You pour…", ["Allagash White", "Sierra Nevada Pale Ale", "Weihenstephaner", "Ayinger"], 1, "Piney, bitter pale ale with the burger."],
    ["What do we offer for a non-drinker who wants an IPA?", ["Guinness", "Athletic Run Wild", "Pilsner Urquell", "Nothing"], 1, "Athletic Run Wild — non-alcoholic IPA."],
    ["How much head on a pour?", ["None", "Half an inch", "One inch", "Two inches"], 2, "One inch of head."],
    ["Hefeweizen goes in…", ["A pint glass", "A tall wheat glass", "A snifter", "A tulip"], 1, "Wit and hefeweizen go in the tall wheat glass."],
    ["Which draft goes best with oysters?", ["Ayinger", "Pilsner Urquell", "Sierra Nevada", "Guinness"], 1, "Crisp Czech pilsner with oysters."],
    ["How do you start a draft pour?", ["Glass upright", "Glass at 45°, straighten at half", "Glass flat", "Pour into the centre fast"], 1, "Glass at 45°, straighten at half."],
    ["A guest wants a beer with the duck. You suggest…", ["Allagash White", "Ayinger Oktober Fest-Märzen", "Pilsner Urquell", "Athletic"], 1, "Toasty Märzen with duck or ribeye."],
    ["Guinness Draught is served from…", ["A tap", "A nitro can", "A bottle", "A growler"], 1, "Nitro can."],
  ]),
  quiz("q-cocktails", "Specialty Cocktails", "specialty-cocktails", "Core", [
    ["What is in The 1906?", ["Rye, sweet vermouth, bitters", "Bourbon, Amaro Nonino, orange bitters", "Gin, Campari, vermouth", "Bourbon, lemon, honey"], 1, "2 oz bourbon, ¾ Amaro Nonino, 2 dash orange bitters."],
    ["The 1906 is…", ["Shaken, rocks", "Stirred, up, coupe", "Built in a highball", "Shaken, up"], 1, "Spirit-only — stirred, up, coupe, expressed orange."],
    ["Leo's Old Fashioned uses which bourbon?", ["Maker's Mark", "Blanton's", "Woodford Double Oaked", "Buffalo Trace"], 2, "Woodford Double Oaked."],
    ["Which cocktail is the autumn special?", ["Garden Gimlet", "Harvest Mule", "Smoke & Velvet", "Espresso Martini"], 1, "Harvest Mule — spiced pear, ginger beer, copper mug."],
    ["The Garden Gimlet is made with…", ["Ketel One", "Hendrick's", "Beefeater", "Tanqueray"], 1, "2 oz Hendrick's with lime cordial and cucumber."],
    ["Why is the Espresso Martini shaken hard?", ["To chill it only", "It has fresh espresso — shaken builds the foam", "House preference", "It's stirred"], 1, "Anything beyond spirit gets shaken; the hard shake builds the crema."],
    ["Smoke & Velvet has a salt rim on…", ["The whole rim", "Half the rim", "No rim", "The base"], 1, "Half salt rim so the guest can choose."],
    ["How many coffee beans garnish the Espresso Martini?", ["One", "Two", "Three", "Five"], 2, "Three beans."],
    ["A drink with citrus should be…", ["Stirred", "Shaken", "Built", "Blended"], 1, "Citrus, cream or egg — shake it."],
    ["What base spirit is in Smoke & Velvet?", ["Tequila", "Mezcal", "Scotch", "Rum"], 1, "1½ mezcal, ½ Aperol, grapefruit, agave."],
  ]),
  quiz("q-pos", "POS Walkthrough", "pos-walkthrough", "Core", [
    ["A colleague asks you to ring an item under their PIN while they're busy. You…", ["Do it quickly", "Use your own PIN only", "Use the manager's card", "Write it on paper"], 1, "Never use someone else's PIN."],
    ["A guest has a shellfish allergy. On the POS you use…", ["A free-text note", "The red ALLERGY modifier on the seat", "A comment on the check", "Nothing — tell the kitchen"], 1, "Red ALLERGY modifier against the seat."],
    ["When are mains fired?", ["On send", "When you clear the first course", "When the guest asks", "Ten minutes after send"], 1, "Mains are held and fired when you clear firsts."],
    ["How is the soufflé rung?", ["With dessert", "With the mains, flagged ‘fire now’", "On a separate check", "With starters"], 1, "With the mains, flagged ‘fire now’."],
    ["A table wants to split by person. You split…", ["Evenly", "By seat", "By card", "By course"], 1, "Splits by seat — which is why every item has a seat number."],
    ["Moving a check to the bar needs…", ["Nothing", "Manager approval", "The bartender's PIN", "The guest's signature"], 1, "Transfers to the bar with the manager's approval."],
    ["A dish was sent back. To comp it you need…", ["Your own PIN", "A manager card and a reason", "The chef's OK", "Nothing"], 1, "Comps and voids need a manager card and a reason."],
    ["When must you close out your checks?", ["End of the week", "Before you leave the section", "When the manager asks", "Next shift"], 1, "Close out before you leave the section."],
    ["Modifiers like ‘medium rare’ are entered…", ["As free text", "From the button", "Verbally to the kitchen", "On the ticket by hand"], 1, "Modifiers from the button, not free text."],
    ["After opening the table, the first thing you enter is…", ["The drinks", "The guest count", "The check split", "The server name"], 1, "Open the table and enter the guest count."],
  ]),
  quiz("q-glass", "Glassware & Silverware", "glassware-silverware", "Core", [
    ["How do you hold a wine glass while polishing?", ["By the bowl", "One linen in each hand — never touch the bowl", "By the rim", "Bare hands"], 1, "Two linens; never touch the bowl."],
    ["How do you check a polished glass?", ["Feel it", "Hold it to the light", "Smell it", "Tap it"], 1, "Hold it to the light — no spots, lint or prints."],
    ["Carrying six stems to a table, you…", ["Carry them by the rims", "Use a rack", "Carry them by the stems, three per hand", "Stack them"], 1, "Racks, not hands, for more than four."],
    ["Silverware is polished with…", ["Dish soap", "Vinegar water and linen", "Dry towel only", "Sanitiser spray"], 1, "Vinegar water and linen; inspect both sides."],
    ["When setting a knife, the blade faces…", ["Out", "In, toward the plate", "Up", "Doesn't matter"], 1, "Blades in."],
    ["Where is the bread plate?", ["Top right", "Top left with butter knife", "Centre", "Bottom left"], 1, "Bread plate top left with the butter knife."],
    ["How far from the table edge is the setting?", ["Flush", "One inch", "Two inches", "Half an inch"], 1, "One inch from the table edge."],
    ["The glasses sit…", ["Top left", "Top right on a diagonal — water, white, red", "In a line across the top", "In the centre"], 1, "Top right on a diagonal."],
    ["How do you pick up a fork?", ["By the tines", "By the handle only", "Either", "With a napkin over the tines"], 1, "Handle by the handle only."],
    ["Who signs a glassware polish grade?", ["Just the grader", "The grader and the trainee", "The GM", "Nobody"], 1, "Both the grader and the trainee sign."],
  ]),
  quiz("q-sidework", "Side Work, Opening & Closing", "table-setting-sidework", "Core", [
    ["When is the opening checklist due?", ["10:00", "10:30", "11:00", "Noon"], 2, "Opening is due by 11:00."],
    ["When is closing due?", ["11:00 pm", "Midnight", "1:00 am", "2:00 am"], 2, "Closing by 1:00."],
    ["Who signs and submits a checklist?", ["The last person on shift", "The manager, after verifying", "The host", "Anyone"], 1, "The manager verifies, signs and submits."],
    ["Before service you review reservations for…", ["Party size only", "VIPs, allergies and large parties", "Names only", "Nothing — the host does it"], 1, "VIPs, allergies, large parties."],
    ["Roll-ups are…", ["Fork, knife, spoon; seam up", "Knife, fork, spoon; seam underneath", "Any order", "Spoon, fork, knife"], 1, "Knife, fork, spoon; napkin seam underneath."],
    ["At closing the floor is vacuumed…", ["Only the walkways", "Including under the banquettes", "Every other night", "By the morning crew"], 1, "Including under banquettes."],
    ["Why initial each line?", ["To get paid", "So we know who finished it and when", "For the health inspector only", "No reason"], 1, "Every line is initialled and timed."],
    ["Ice in the opening checklist goes…", ["In the server station", "In the bin, poured into the wells behind the bar", "Into the glasses", "In the walk-in"], 1, "Ice in the bin, poured into the wells."],
    ["Centerpieces at closing are…", ["Left on", "Taken off; tables stripped and wiped", "Moved to the bar", "Thrown out"], 1, "Centerpieces off, tables stripped and wiped."],
    ["Silverware for tomorrow is…", ["Rolled at opening", "Rolled at closing", "Not rolled", "Rolled by the dishwasher"], 1, "Linens changed, silverware rolled for tomorrow."],
  ]),
  quiz("q-delivery", "Food & Drink Delivery", "delivery-etiquette", "Core", [
    ["Food is served from…", ["The right", "The left", "Either", "The host's side"], 1, "Food from the left."],
    ["Drinks are served and plates cleared from…", ["The left", "The right", "Behind", "Wherever is open"], 1, "Drinks and clearing from the right."],
    ["You arrive with four plates and don't know who had the filet. You…", ["Ask “Who had the filet?”", "Read the seat numbers on the ticket", "Put it in the middle", "Wait for the server"], 1, "Never auction food — seat numbers are on the ticket."],
    ["How do you place a plate?", ["Garnish facing the guest", "Protein at six o'clock", "Protein at twelve", "However it came"], 1, "Protein at six o'clock."],
    ["As you set it down you say…", ["“Enjoy.”", "Nothing", "“The Dover sole, deboned at the table.”", "“Careful, hot.”"], 2, "Every plate announced."],
    ["Who is served first?", ["The host", "Ladies first, then clockwise; host last", "Whoever ordered first", "Children"], 1, "Ladies first, clockwise; host last."],
    ["A table you ran for is waiting on a side. You…", ["Tell their server", "Own it until it lands", "Leave it to expo", "Ignore it"], 1, "If a table is waiting, you own it until it lands."],
    ["One guest asks you to take their plate while others are eating. You…", ["Refuse", "Clear it — they asked", "Wait until all finish", "Ask the table"], 1, "Clear only when everyone has finished — unless a guest asks."],
    ["Walking back from the floor empty-handed is…", ["Fine", "Against “full hands in, full hands out”", "Required", "Only for runners"], 1, "Full hands in, full hands out."],
    ["Where is the protein placed relative to the guest?", ["Furthest away", "Closest to them, six o'clock", "Left side", "Right side"], 1, "Six o'clock — nearest the guest."],
  ]),
  quiz("q-recovery", "Recovery & Guest Relations", "recovery-relations", "Core", [
    ["What does LAST stand for?", ["Look, Ask, Serve, Thank", "Listen, Apologise, Solve, Thank", "Listen, Act, Smile, Tell", "Learn, Apologise, Serve, Treat"], 1, "Listen, Apologise, Solve, Thank."],
    ["A guest complains about their server. Before they leave…", ["Comp dessert", "The manager visits the table", "Swap the server", "Nothing"], 1, "Any complaint about a person: the manager visits."],
    ["How many times do you apologise?", ["Every time you visit", "Once, sincerely", "Never — it admits fault", "Twice"], 1, "Apologise sincerely, once."],
    ["Where do you find a regular's anniversary?", ["Ask them", "The reservation notes", "The POS", "Social media"], 1, "Check the reservation notes before the table arrives."],
    ["A guest raises an allergy concern after eating. You…", ["Reassure them", "Get the manager to the table", "Check the recipe yourself", "Offer a drink"], 1, "Any allergy concern: the manager visits."],
    ["While a guest explains a problem you…", ["Interrupt to fix it fast", "Listen all the way to the end", "Fetch the manager immediately", "Explain the kitchen's side"], 1, "Listen — all the way to the end."],
    ["The last step of LAST is…", ["Solve", "Thank them for telling you", "Comp the item", "Log it"], 1, "Thank them for telling you."],
    ["The farewell is…", ["“Have a good night.”", "“Thank you for spending your evening with us, [name].”", "“Bye!”", "Handled by the host only"], 1, "Thank them by name."],
    ["Regulars are greeted…", ["The same as everyone", "By name", "With a free drink", "By the manager only"], 1, "Regulars by name."],
    ["Who can approve a comp?", ["Any server", "The manager", "The host", "The chef"], 1, "Comps need the manager."],
  ]),
  quiz("q-somm-challenge", "Sommelier's Table · Advanced", undefined, "Advanced", [
    ["A guest wants a big, buttery California Chardonnay. Which bottle on our list is the oakiest?", ["Kistler ‘Les Noisetiers’", "Rombauer, Carneros", "Fèvre Chablis ‘Montmains’", "Cloudy Bay"], 1, "Rombauer — full malolactic, new French oak."],
    ["Table 12 orders two ribeyes, medium rare. Which red do you recommend first?", ["Domaine Serene Pinot Noir", "Duckhorn Merlot", "Silver Oak Cabernet", "Gevrey-Chambertin"], 2, "Silver Oak — firm tannin cuts the fat."],
    ["A party of ten orders three bottles for a toast of 5 oz each. How many guests can you pour?", ["Ten", "Twelve", "Fifteen", "Eighteen"], 2, "Five pours per 750 ml × 3 = fifteen."],
    ["One guest has duck, the other the Dover sole. One bottle — which?", ["Silver Oak", "Domaine Serene Pinot Noir", "Caymus", "Catena Malbec"], 1, "Pinot Noir bridges the duck and a delicate fish."],
    ["A guest wants a Bordeaux. Which do we pour?", ["Tignanello", "Château Lynch-Bages", "Guigal Côte-Rôtie", "Duckhorn"], 1, "Lynch-Bages, Pauillac."],
    ["Which by-the-glass red is softest for a guest who dislikes tannin?", ["Caymus", "Domaine Serene ‘Yamhill Cuvée’", "Catena Alta Malbec", "Silver Oak"], 1, "Silky Pinot Noir."],
    ["A guest likes Kistler but wants it leaner. You move to…", ["Rombauer", "Fèvre Chablis ‘Montmains’", "Caymus", "Veuve"], 1, "Unoaked Chablis is the leanest."],
    ["A guest asks for something Italian and bold with the filet. You offer…", ["Gevrey-Chambertin", "Antinori Tignanello", "Cloudy Bay", "Côte-Rôtie"], 1, "Super Tuscan Sangiovese-Cabernet."],
    ["Which white goes with the lobster bisque?", ["Cloudy Bay", "Rombauer", "Chablis", "Veuve"], 1, "The richness meets the cream."],
    ["Guests order a bottle of Côte-Rôtie. Its grape is…", ["Grenache", "Syrah with a little Viognier", "Merlot", "Nebbiolo"], 1, "Northern Rhône Syrah co-fermented with Viognier."],
  ]),
];

export const QUIZ_BY_SLUG = Object.fromEntries(QUIZZES.map((q) => [q.slug, q])) as Record<string, Quiz>;

/** Score answers against a library or stored quiz. Returns the fraction correct (0–1). */
export function scoreQuiz(questions: Pick<Question, "id" | "answer">[], answers: Record<string, number>) {
  if (!questions.length) return 0;
  const right = questions.filter((q) => answers[q.id] === q.answer).length;
  return right / questions.length;
}
