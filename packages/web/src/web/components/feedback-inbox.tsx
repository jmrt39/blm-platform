import { useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, ChevronDown, Heart, MessageSquareQuote, Sparkles, Star, TrendingUp, Undo2, X } from "lucide-react";
import { useAboveBeyond, useFeedbackInbox, useReadFeedback, useRespondFeedback, useTagFeedback } from "../queries/guests";
import { Seg } from "./bits";
import { THEME_LABEL, isPlatform } from "../../shared/reviews";
import { MarkedQuote } from "./surveys";
import { ROLE_LABEL, isManagementRole } from "../../shared/domain";
import { HOW_LABEL, soundsAboveBeyond } from "../../shared/name-match";
import { shortDay } from "../lib/format";
import { cn } from "../lib/utils";
import { LockedNotice } from "./private";

type Inbox = NonNullable<ReturnType<typeof useFeedbackInbox>["data"]>;
type Item = Inbox["items"][number];
type Person = Inbox["staff"][string][number];

function Stars({ n, size = "size-3.5" }: { n: number | null; size?: string }) {
  if (n == null) return <span className="text-[11.5px] text-ink-soft">No stars</span>;
  return (
    <span className="inline-flex gap-0.5 text-gold-deep" aria-label={`${n} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= n ? "fill-current" : "opacity-25")} />
      ))}
    </span>
  );
}

/** Who the review counts for, and the controls to change it. */
function TagBar({ f, staff }: { f: Item; staff: Person[] }) {
  const tag = useTagFeedback();
  const ab = useAboveBeyond();
  const set = (ids: string[]) => tag.mutate({ id: f.id, memberIds: ids });
  const auto = f.tagSource === "auto";
  const left = staff.filter((p) => !f.memberIds.includes(p.id));
  const hint = !f.aboveBeyond && soundsAboveBeyond(f.quote);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Counts for</span>
      {f.memberIds.map((id, i) => {
        const m = f.matches.find((x) => x.memberId === id);
        const guess = auto && m?.how === "guess";
        return (
          <span
            key={id}
            className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-[12.5px] font-semibold", guess ? "border-oxblood/40 bg-oxblood/5" : "border-ink/25 bg-paper")}
          >
            <Link href={`/team/${id}`} className="hover:underline">
              {f.memberNames[i]}
            </Link>
            {auto && m && (
              <span className={cn("text-[11px] font-normal", guess ? "text-oxblood" : "text-ink-soft")}>
                {HOW_LABEL[m.how]}
                {m.how !== "exact" && <> · “{m.word}”</>}
              </span>
            )}
            <button type="button" aria-label={`Untag ${f.memberNames[i]}`} className="grid size-5 place-items-center rounded-full text-ink-soft hover:bg-ink/10 hover:text-ink" onClick={() => set(f.memberIds.filter((x) => x !== id))}>
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      {!f.memberIds.length && <span className="text-[12.5px] text-ink-soft">Nobody yet</span>}
      <select
        aria-label="Tag a colleague"
        className="field !h-8 !w-auto !py-0 !text-[12.5px]"
        value=""
        disabled={tag.isPending}
        onChange={(e) => e.target.value && set([...f.memberIds, e.target.value])}
      >
        <option value="">{f.memberIds.length ? "+ Tag someone else" : "+ Tag a colleague"}</option>
        {left.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {ROLE_LABEL[p.role] ?? p.role}
            {isManagementRole(p.role) ? " (no rewards)" : ""}
          </option>
        ))}
      </select>
      {auto && f.memberIds.length > 0 && (
        <button type="button" className="btn btn-line !h-8 !px-3 !text-[12px]" disabled={tag.isPending} onClick={() => set(f.memberIds)}>
          <Check className="size-3.5" /> Confirm
        </button>
      )}
      <button
        type="button"
        className={cn("btn !h-8 !px-3 !text-[12px]", f.aboveBeyond ? "btn-ink" : hint ? "btn-line !border-gold-deep !text-gold-deep" : "btn-line")}
        disabled={ab.isPending || !f.memberIds.length}
        title={f.memberIds.length ? undefined : "Tag who it was first"}
        onClick={() => ab.mutate({ id: f.id, on: !f.aboveBeyond })}
      >
        <Sparkles className="size-3.5" /> {f.aboveBeyond ? "Above and beyond" : hint ? "Sounds like above and beyond" : "Mark above and beyond"}
      </button>
      {f.tagSource === "manager" && f.taggedByName && <span className="text-[11.5px] text-ink-soft">Tagged by {f.taggedByName}</span>}
    </div>
  );
}

/** Reply where the review was posted (a new tab), then mark it done here so nobody replies twice. */
function RespondBar({ f }: { f: Item }) {
  const respond = useRespondFeedback();
  const platform = isPlatform(f.source);
  if (f.respondedAt)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-sage">
        <Check className="size-3.5" /> {platform ? "Replied" : "Followed up"} by {f.respondedByName} · {new Date(f.respondedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        {f.responseNote && <span className="text-ink-soft">· {f.responseNote}</span>}
        <button type="button" className="inline-flex items-center gap-1 text-ink-soft hover:text-ink" disabled={respond.isPending} onClick={() => respond.mutate({ id: f.id, done: false })}>
          <Undo2 className="size-3" /> Undo
        </button>
      </div>
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {f.respondUrl && (
        <a href={f.respondUrl} target="_blank" rel="noopener noreferrer" className={cn("btn !h-8 !px-3 !text-[12px]", f.tone === "opportunity" ? "btn-ink" : "btn-line")}>
          Respond on {f.source} <ArrowUpRight className="size-3.5" />
        </a>
      )}
      <button type="button" className="btn btn-line !h-8 !px-3 !text-[12px]" disabled={respond.isPending} onClick={() => respond.mutate({ id: f.id, done: true })}>
        <Check className="size-3.5" /> {platform ? "Mark replied" : "Mark followed up"}
      </button>
      {f.respondUrl && !f.externalUrl && <span className="text-[11px] text-ink-soft">Opens the store's {f.source} page. Add the review link to go straight to it.</span>}
    </div>
  );
}

function FullItem({ f, staff, showStore }: { f: Item; staff: Person[]; showStore: boolean }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("relative border-b rule py-5 last:border-0", !f.readAt && "pl-4")}>
      {!f.readAt && <span className="absolute left-0 top-7 size-2 rounded-full bg-gold-deep" aria-label="New" />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars n={f.rating} size="size-4" />
        <span className={cn("chip", f.tone === "opportunity" ? "border-oxblood/40 text-oxblood" : "border-sage/50 text-sage")}>{f.tone === "opportunity" ? "Opportunity" : "Loved"}</span>
        <span className="text-[12px] text-ink-soft">
          {f.guestName || "A guest"} · {f.source} · {shortDay(f.receivedOn)}
          {showStore && <> · {f.storeName}</>}
        </span>
        {f.themes.map((t) => (
          <span key={t} className="text-[11.5px] text-oxblood">
            {THEME_LABEL[t]}
          </span>
        ))}
      </div>
      <blockquote className="mt-2 font-display text-[18px] italic leading-snug">
        “<MarkedQuote text={f.quote} words={f.matches.map((m) => m.word)} />”
      </blockquote>
      <TagBar f={f} staff={staff} />
      <RespondBar f={f} />
    </motion.li>
  );
}

/** One line on the front page: stars, the quote, who it names, and a reply link for platform reviews. */
function Glance({ f, onOpen }: { f: Item; onOpen: () => void }) {
  return (
    <li className="border-b rule py-3 last:border-0">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", f.readAt ? "bg-transparent" : "bg-gold-deep")} />
        <Stars n={f.rating} />
        <span className="truncate text-[11.5px] text-ink-soft">
          {f.source} · {shortDay(f.receivedOn)} · {f.memberNames.length ? f.memberNames.join(", ") : "Untagged"}
        </span>
      </div>
      <button type="button" onClick={onOpen} className="mt-1 line-clamp-2 text-left font-display text-[15.5px] italic leading-snug hover:underline">
        “{f.quote}”
      </button>
      {f.tone === "opportunity" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]">
          {f.respondedAt ? (
            <span className="inline-flex items-center gap-1 text-sage">
              <Check className="size-3.5" /> Replied by {f.respondedByName}
            </span>
          ) : f.respondUrl ? (
            <a href={f.respondUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-oxblood hover:underline">
              Respond on {f.source} <ArrowUpRight className="size-3.5" />
            </a>
          ) : (
            <span className="text-ink-soft">{f.source}: follow up in person</span>
          )}
        </div>
      )}
    </li>
  );
}

/** Home page: what guests loved, what to improve, and the full list with one tap tagging and replies. */
export function FeedbackInbox({ storeId, showStore }: { storeId: string | null; showStore: boolean }) {
  const q = useFeedbackInbox(storeId);
  const read = useReadFeedback();
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<"all" | "loved" | "opportunity">("all");
  const d = q.data;
  if (!d) return null;
  const unread = d.items.filter((f) => !f.readAt);
  const loved = d.items.filter((f) => f.tone === "loved");
  const opps = d.items.filter((f) => f.tone === "opportunity");
  // Unanswered opportunities first, then newest.
  const oppsFirst = [...opps].sort((a, b) => Number(!!a.respondedAt) - Number(!!b.respondedAt));
  const shown = tone === "all" ? d.items : d.items.filter((f) => f.tone === tone);
  const openAt = (t: typeof tone) => {
    setTone(t);
    setOpen(true);
  };
  return (
    <section className="mt-12 rounded-[2px] border rule" aria-label="Guest feedback">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-6">
        <div className="flex items-center gap-4">
          <span className="grid size-11 place-items-center rounded-full bg-noir text-gold">
            <MessageSquareQuote className="size-5" />
          </span>
          <div>
            <div className="eyebrow">Guest feedback · last 60 days</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 font-display text-[22px] leading-tight">
              {unread.length ? `${unread.length} new review${unread.length === 1 ? "" : "s"}` : d.items.length ? "You're caught up" : "No reviews yet"}
              {d.stars != null && (
                <span className="inline-flex items-baseline gap-1.5 text-[15px] text-ink-soft">
                  <Star className="size-4 translate-y-0.5 fill-gold-deep text-gold-deep" /> {d.stars.toFixed(1)} across {d.rated}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.needsLook > 0 && <span className="chip border-oxblood/40 text-oxblood">{d.needsLook} best guess tag{d.needsLook === 1 ? "" : "s"} to check</span>}
          {d.opportunitiesToRespond > 0 && <span className="chip border-oxblood/40 text-oxblood">{d.opportunitiesToRespond} to reply to</span>}
          {unread.length > 0 && (
            <button type="button" className="btn btn-line !h-9 !px-3 !text-[12.5px]" disabled={read.isPending} onClick={() => read.mutate({ ids: unread.map((f) => f.id) })}>
              Mark all read
            </button>
          )}
          <button type="button" className="btn btn-ink !h-9 !px-3 !text-[12.5px]" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Collapse" : `Show all ${d.items.length}`} <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {d.hiddenNamed > 0 && (
        <LockedNotice what="Reviews naming staff" className="border-t rule px-5 py-3 md:px-6">
          {d.hiddenNamed} review{d.hiddenNamed === 1 ? " names" : "s name"} someone on the team and {d.hiddenNamed === 1 ? "is" : "are"} kept private.
        </LockedNotice>
      )}

      {!open && d.items.length > 0 && (
        <div className="grid border-t rule md:grid-cols-2">
          <div className="px-5 py-4 md:border-r md:px-6 rule">
            <button type="button" onClick={() => openAt("loved")} className="flex w-full items-baseline justify-between text-left">
              <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-sage">
                <Heart className="size-3.5" /> What guests loved
              </span>
              <span className="figure text-[24px] text-sage">{d.toneAll.loved}</span>
            </button>
            {loved.length ? (
              <ul className="mt-1">
                {loved.slice(0, 2).map((f) => (
                  <Glance key={f.id} f={f} onOpen={() => openAt("loved")} />
                ))}
              </ul>
            ) : d.toneAll.hiddenLoved ? null : (
              <p className="mt-3 text-[13px] text-ink-soft">Nothing glowing in the last 60 days yet.</p>
            )}
            {d.toneAll.hiddenLoved > 0 && (
              <p className="mt-2 text-[12px] text-ink-soft">
                Plus {d.toneAll.hiddenLoved} that praise{d.toneAll.hiddenLoved === 1 ? "s" : ""} a team member by name, kept private.
              </p>
            )}
          </div>
          <div className="border-t px-5 py-4 md:border-t-0 md:px-6 rule">
            <button type="button" onClick={() => openAt("opportunity")} className="flex w-full items-baseline justify-between text-left">
              <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-oxblood">
                <TrendingUp className="size-3.5" /> Opportunities to improve
              </span>
              <span className="figure text-[24px] text-oxblood">{d.toneAll.opportunity}</span>
            </button>
            {d.themes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.themes.slice(0, 4).map((t) => (
                  <span key={t.key} className="chip border-oxblood/30 text-oxblood">
                    {THEME_LABEL[t.key]} · {t.n}
                  </span>
                ))}
              </div>
            )}
            {opps.length ? (
              <ul className="mt-1">
                {oppsFirst.slice(0, 2).map((f) => (
                  <Glance key={f.id} f={f} onOpen={() => openAt("opportunity")} />
                ))}
              </ul>
            ) : d.toneAll.hiddenOpportunity ? null : (
              <p className="mt-3 text-[13px] text-ink-soft">No complaints in the last 60 days. Keep it that way.</p>
            )}
            {d.toneAll.hiddenOpportunity > 0 && (
              <p className="mt-2 text-[12px] text-ink-soft">
                Plus {d.toneAll.hiddenOpportunity} that name{d.toneAll.hiddenOpportunity === 1 ? "s" : ""} a team member, kept private.
              </p>
            )}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }} className="overflow-hidden">
            <div className="border-t rule px-5 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <p className="max-w-2xl text-[12.5px] text-ink-soft">
                  Names are found in the text automatically, misspellings included, and underlined. Reply on Google, Yelp and the rest in a new tab, then mark it replied so nobody answers twice.
                </p>
                <Seg
                  value={tone}
                  onChange={setTone}
                  options={[
                    { value: "all", label: `All ${d.items.length}` },
                    { value: "loved", label: `Loved ${loved.length}` },
                    { value: "opportunity", label: `To improve ${opps.length}` },
                  ]}
                />
              </div>
              {shown.length ? (
                <ul>
                  {shown.map((f) => (
                    <FullItem key={f.id} f={f} staff={d.staff[f.storeId] ?? []} showStore={showStore} />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-[13.5px] text-ink-soft">Nothing here in the last 60 days.</p>
              )}
              <div className="flex flex-wrap justify-between gap-2 border-t rule py-3 text-[12.5px]">
                <Link href="/guests" className="font-semibold text-gold-deep hover:underline">
                  Add or import reviews →
                </Link>
                <Link href="/stores" className="font-semibold text-gold-deep hover:underline">
                  Review platform links →
                </Link>
                <Link href="/rewards" className="font-semibold text-gold-deep hover:underline">
                  Survey rewards →
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
