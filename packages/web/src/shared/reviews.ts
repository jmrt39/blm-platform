// Review platforms: where a review was posted, how a manager replies there, and whether it is praise or an
// opportunity to improve. Replies always happen on the platform itself, in a new tab: none of them let a third
// party post a reply without the owner's own verified account.

export const REVIEW_PLATFORMS = ["Google", "Yelp", "OpenTable", "Tripadvisor", "Resy"] as const;
export type ReviewPlatform = (typeof REVIEW_PLATFORMS)[number];

/** Per store: the public page on each platform, and Google's Place ID. All optional. */
export type ReviewLinks = Partial<Record<ReviewPlatform, string>> & { googlePlaceId?: string };

export const PLATFORM_INFO: Record<
  ReviewPlatform,
  { owner: string; ownerLabel: string; pagePlaceholder: string; reply: string; api: string; live: "possible" | "read_only" | "partner" }
> = {
  Google: {
    owner: "https://business.google.com/reviews",
    ownerLabel: "Google Business Profile",
    pagePlaceholder: "https://maps.app.goo.gl/…",
    reply: "Reply from Google Business Profile while signed in as the owner or a manager of the listing.",
    api: "Google Business Profile API: needs the listing verified, an approved API access request and an owner signing in once with Google. Then reviews come in automatically and replies can be posted from here.",
    live: "possible",
  },
  Yelp: {
    owner: "https://biz.yelp.com/",
    ownerLabel: "Yelp for Business",
    pagePlaceholder: "https://www.yelp.com/biz/…",
    reply: "Reply from Yelp for Business, as a public comment or a private message.",
    api: "Yelp Fusion API: read only, and only the three newest review excerpts. Yelp doesn't allow replies through any API, so replies stay on Yelp for Business.",
    live: "read_only",
  },
  OpenTable: {
    owner: "https://guestcenter.opentable.com/",
    ownerLabel: "OpenTable GuestCenter",
    pagePlaceholder: "https://www.opentable.com/r/…",
    reply: "Reply from GuestCenter under Reviews.",
    api: "OpenTable's API is for approved partners only. Until then, export reviews from GuestCenter and import the file here.",
    live: "partner",
  },
  Tripadvisor: {
    owner: "https://www.tripadvisor.com/Owners",
    ownerLabel: "Tripadvisor Management Center",
    pagePlaceholder: "https://www.tripadvisor.com/Restaurant_Review…",
    reply: "Reply from the Management Center as the verified owner.",
    api: "Tripadvisor's Content API is read only and doesn't allow replies.",
    live: "read_only",
  },
  Resy: {
    owner: "https://os.resy.com/",
    ownerLabel: "ResyOS",
    pagePlaceholder: "https://resy.com/cities/…",
    reply: "Reply from ResyOS under Guest feedback.",
    api: "Resy has no public review API. Export from ResyOS and import the file here.",
    live: "partner",
  },
};

export const isPlatform = (source: string): source is ReviewPlatform => (REVIEW_PLATFORMS as readonly string[]).includes(source);

/** Where the manager goes to reply: the review itself if we have its link, otherwise the store's page on that platform. */
export function respondUrl(source: string, externalUrl: string | null | undefined, links: ReviewLinks | null | undefined): string | null {
  if (!isPlatform(source)) return null;
  if (externalUrl) return externalUrl;
  if (source === "Google" && links?.googlePlaceId) return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(links.googlePlaceId)}`;
  return links?.[source] || PLATFORM_INFO[source].owner;
}

/* ── Praise or an opportunity to improve ─────────────────────────────────────────────── */

/** What guests most often raise, with the words that give it away. Used to group opportunities on the home page. */
export const THEMES: { key: string; label: string; words: RegExp }[] = [
  { key: "wait", label: "Wait times", words: /\b(slow|waited|waiting|wait was|took forever|forever|took ages|long wait|an hour|45 minutes|delay(ed)?)\b/i },
  { key: "attention", label: "Attention at the table", words: /\b(ignored|forgot|forgotten|never came|never checked|nobody checked|no one checked|hard to find|inattentive|disappeared|had to ask)\b/i },
  { key: "food", label: "Food quality", words: /\b(cold|lukewarm|bland|salty|overcooked|undercooked|dry|soggy|burnt|mediocre)\b/i },
  { key: "accuracy", label: "Order accuracy", words: /\b(wrong (order|dish|wine|bottle)|mixed up|not what (we|i) ordered|missing)\b/i },
  { key: "manner", label: "Manner and tone", words: /\b(rude|dismissive|condescending|unfriendly|attitude|rushed us|rushed)\b/i },
  { key: "room", label: "Room and noise", words: /\b(loud|noisy|cramped|dirty|sticky|freezing|too hot|draft)\b/i },
  { key: "value", label: "Price and value", words: /\b(overpriced|expensive for|not worth|pricey|small portions?)\b/i },
  { key: "booking", label: "Booking and seating", words: /\b(reservation (was|got)|lost our reservation|double booked|seated late|bad table|by the kitchen)\b/i },
];

const SOFT_NEGATIVE = /\b(disappoint(ed|ing)?|unfortunately|but the|however|could have been|wasn't great|not great|let down|shame)\b/i;

export type Tone = "loved" | "opportunity";

export function themesOf(quote: string) {
  return THEMES.filter((t) => t.words.test(quote)).map((t) => t.key);
}

/** 1 to 3 stars is an opportunity. 4 stars with a complaint in it is too. 5 stars, or praise with no stars, is loved. */
export function toneOf(rating: number | null | undefined, quote: string): Tone {
  if (rating != null && rating <= 3) return "opportunity";
  const flagged = themesOf(quote).length > 0 || SOFT_NEGATIVE.test(quote);
  if (rating === 5) return "loved";
  return flagged ? "opportunity" : "loved";
}

export const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.key, t.label])) as Record<string, string>;
