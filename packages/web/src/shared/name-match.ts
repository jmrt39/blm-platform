// Finds the colleagues a guest names in a review, even when the guest spells the name wrong.
// Used on the server when a review comes in (auto tag) and in the browser to preview the tag.

export type Person = { id: string; name: string; role?: string };

export type NameMatch = {
  memberId: string;
  name: string;
  /** The word in the review that matched, as the guest wrote it. */
  word: string;
  /** 0 to 1. 1 is the name spelled exactly. */
  score: number;
  /** exact: spelled right. close: a small misspelling. guess: the closest name we could find, worth a manager's look. */
  how: "exact" | "close" | "guess";
};

/** Capitalised words that start sentences or describe the evening, never a colleague. */
const STOP = new Set(
  (
    "the a an and but so we our my i it its this that they them their she he her his you your us me what when where why how who " +
    "thank thanks great best good lovely amazing excellent perfect wonderful fantastic awesome nice fine fun ok okay wow " +
    "service dinner lunch brunch food drinks drink wine bar table night evening meal staff team server waiter waitress bartender host " +
    "ask always never very really just also not no yes will may can could would should might must " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december " +
    "christmas easter valentine valentines anniversary birthday mother mothers father fathers day"
  ).split(" "),
);
/** Ordinary words that are also first names. Only matched when someone on the team has exactly that name. */
const NAMEWORDS = new Set("grace hope joy faith rose summer dawn amber ruby jade sky honey candy bill mark art chase rich frank earl pat sage april june may will".split(" "));
const COMMON = new Set([...STOP, ...NAMEWORDS]);

/** Words near a name that tell us the guest is talking about a person who served them. */
const CONTEXT = /\b(server|waiter|waitress|bartender|sommelier|somm|host|hostess|busser|runner|manager|named|name was|ask for|thanks to|thank you|shout ?out|kudos)\b/i;

const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

/** A rough sound alike form: k sounds like c, ph like f, y like i, and doubled letters collapse. */
const sound = (w: string) =>
  norm(w)
    .replace(/ph/g, "f")
    .replace(/^chr/, "cr")
    .replace(/ck/g, "k")
    .replace(/k/g, "c")
    .replace(/y/g, "i")
    .replace(/z/g, "s")
    .replace(/(.)\1+/g, "$1")
    .replace(/h(?=$)/, "");

/** Edit distance where swapping two neighbouring letters costs one (Damerau). */
export function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

/** How alike a written word is to a name, 0 to 1. */
export function similarity(word: string, name: string) {
  const a = norm(word);
  const b = norm(name);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (sound(a) === sound(b)) return 0.93;
  const dist = Math.min(editDistance(a, b), editDistance(sound(a), sound(b)) + 0.5);
  const len = Math.max(a.length, b.length);
  // Short names must be spelled closely: three letters allow nothing, up to five allow one slip.
  const allowed = Math.min(a.length, b.length) <= 2 || len <= 3 ? 0 : len <= 5 ? 1 : 2;
  if (dist > allowed + 0.5) return Math.max(0, 0.6 - dist / len);
  const firstSame = a[0] === b[0] || sound(a)[0] === sound(b)[0];
  return Math.max(0, 0.9 - (dist / len) * 0.6 - (firstSame ? 0 : 0.08));
}

type Token = { raw: string; w: string; i: number; capital: boolean; sentenceStart: boolean; context: boolean };

function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /[A-Za-zÀ-ÿ'’]+/g;
  let m: RegExpExecArray | null;
  const allLower = text === text.toLowerCase();
  while ((m = re.exec(text))) {
    const raw = m[0].replace(/['’]s$/i, "").replace(/['’]/g, "");
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    const near = text.slice(Math.max(0, m.index - 28), Math.min(text.length, m.index + raw.length + 28));
    out.push({
      raw,
      w: norm(raw),
      i: out.length,
      capital: /^[A-ZÀ-Ý]/.test(raw) || allLower,
      sentenceStart: m.index === 0 || /[.!?]\s*$/.test(before) || /^\s*$/.test(text.slice(0, m.index)),
      context: CONTEXT.test(near),
    });
  }
  return out;
}

/**
 * Which colleagues the review names. Each person appears once, best match first.
 * `worked` (member ids on shift that day) breaks ties between two people with the same first name.
 */
export function matchNames(text: string, people: Person[], opts: { worked?: Set<string> } = {}): NameMatch[] {
  const toks = tokens(text);
  const parts = people.map((p) => {
    const [first = "", ...rest] = p.name.trim().split(/\s+/);
    return { p, first: norm(first), last: norm(rest[rest.length - 1] ?? "") };
  });
  const firsts = new Set(parts.map((x) => x.first));
  const best = new Map<string, NameMatch>();
  const put = (m: NameMatch) => {
    const had = best.get(m.memberId);
    if (!had || m.score > had.score) best.set(m.memberId, m);
  };

  for (const t of toks) {
    if (t.w.length < 2 || !t.capital) continue;
    // An ordinary word only counts as a name when someone on the team has exactly that name.
    // Words like "will" or "may" also need to sit mid sentence; "Grace was lovely" can start one.
    if (COMMON.has(t.w) && !(firsts.has(t.w) && (NAMEWORDS.has(t.w) ? !STOP.has(t.w) || !t.sentenceStart : !t.sentenceStart))) continue;
    const next = toks[t.i + 1];
    const scored = parts
      .map((x) => {
        let score = similarity(t.w, x.first);
        // A surname written alone ("Rhodes was great") also counts.
        if (x.last && x.last.length > 3) score = Math.max(score, similarity(t.w, x.last) - 0.05);
        if (score <= 0) return null;
        if (next && x.last && (similarity(next.w, x.last) >= 0.8 || (next.w.length === 1 && next.w === x.last[0]))) score += 0.08;
        if (t.context) score += 0.04;
        if (opts.worked?.has(x.p.id)) score += 0.03;
        return { x, score: Math.min(1, score) };
      })
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top) continue;
    // Someone else has this exact first name: don't fuzzy match it onto a different colleague.
    if (firsts.has(t.w) && top.x.first !== t.w && top.x.last !== t.w) continue;
    const exact = top.x.first === t.w || top.x.last === t.w;
    const floor = t.context ? 0.5 : 0.62;
    if (top.score < floor) continue;
    put({
      memberId: top.x.p.id,
      name: top.x.p.name,
      word: t.raw,
      score: Math.round(top.score * 100) / 100,
      how: exact ? "exact" : top.score >= 0.78 ? "close" : "guess",
    });
  }

  // No name found, but the guest clearly talks about their server: pick the closest name we have.
  if (!best.size) {
    const named = toks.filter((t) => t.capital && !COMMON.has(t.w) && t.w.length >= 3 && t.context && !t.sentenceStart);
    let pick: { p: Person; word: string; score: number } | null = null;
    for (const t of named)
      for (const x of parts) {
        const sc = 1 - editDistance(sound(t.w), sound(x.first)) / Math.max(t.w.length, x.first.length);
        if (sc >= 0.4 && (!pick || sc > pick.score)) pick = { p: x.p, word: t.raw, score: sc * 0.8 };
      }
    if (pick) put({ memberId: pick.p.id, name: pick.p.name, word: pick.word, score: Math.round(pick.score * 100) / 100, how: "guess" });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Does the review read like someone went above and beyond? A hint for the manager, never a decision. */
export function soundsAboveBeyond(text: string) {
  return /above and beyond|extra mile|out of (her|his|their) way|went beyond|over the top for us|saved (our|the) (night|evening|dinner)|can'?t thank|made (our|the) night|unforgettable|blew us away/i.test(text);
}

export const HOW_LABEL: Record<NameMatch["how"], string> = {
  exact: "Name in the review",
  close: "Close spelling",
  guess: "Best guess",
};
