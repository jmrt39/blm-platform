import { useId, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronDown, Sparkles, Star } from "lucide-react";
import { useAckSurveys, useMySurveys } from "../queries/guests";
import { shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Mine = NonNullable<ReturnType<typeof useMySurveys>["data"]>;
type Item = Mine["items"][number];

/** Five large stars filled to the exact average, so 4.6 shows six tenths of the fifth star. */
export function BigStars({
  value,
  size = 44,
  tone = "gold",
  className,
}: {
  value: number | null;
  size?: number;
  tone?: "gold" | "deep";
  className?: string;
}) {
  const id = useId();
  const v = value ?? 0;
  const fill = tone === "gold" ? "#c5af87" : "#8a7350";
  const empty =
    tone === "gold" ? "rgb(197 175 135 / 0.22)" : "rgb(138 115 80 / 0.22)";
  const gap = size * 0.18;
  const w = size * 5 + gap * 4;
  const path =
    "M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  return (
    <>
      <span className="sr-only">
        {value == null ? "No stars yet" : `${v.toFixed(1)} of 5 stars`}
      </span>
      <svg
        width={w}
        height={size}
        viewBox={`0 0 ${w} ${size}`}
        className={className}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={`${id}-c`}>
            <motion.rect
              x={0}
              y={0}
              height={size}
              initial={{ width: 0 }}
              animate={{ width: w }}
              transition={{
                duration: 1.1,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.2,
              }}
            />
          </clipPath>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g
            key={i}
            transform={`translate(${i * (size + gap)} 0) scale(${size / 24})`}
          >
            <path d={path} fill={empty} />
          </g>
        ))}
        <g clipPath={`url(#${id}-c)`}>
          {[0, 1, 2, 3, 4].map((i) => {
            // Fill each star by its own share so the gaps between stars don't eat the fraction.
            const share = Math.max(0, Math.min(1, v - i));
            return (
              <g
                key={i}
                transform={`translate(${i * (size + gap)} 0) scale(${size / 24})`}
              >
                <clipPath id={`${id}-s${i}`}>
                  <rect x={0} y={0} width={24 * share} height={24} />
                </clipPath>
                <path d={path} fill={fill} clipPath={`url(#${id}-s${i})`} />
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}

/** Wraps the words the platform matched in the review so the manager sees why it tagged who it did. */
export function MarkedQuote({
  text,
  words,
}: {
  text: string;
  words: string[];
}) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(
    `\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:['’]s)?\\b`,
    "gi",
  );
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <mark
        key={m.index}
        className="bg-transparent text-inherit underline decoration-gold decoration-2 underline-offset-4"
      >
        {m[0]}
      </mark>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function SmallStars({ n }: { n: number | null }) {
  if (n == null)
    return <span className="text-[11.5px] text-ink-soft">No stars given</span>;
  return (
    <span
      className="inline-flex gap-0.5 text-gold-deep"
      aria-label={`${n} stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-3.5", i <= n ? "fill-current" : "opacity-25")}
        />
      ))}
    </span>
  );
}

function tagLine(f: Item, memberId: string) {
  if (f.tagSource === "manager")
    return f.taggedByName
      ? `Tagged by ${f.taggedByName}`
      : "Tagged by a manager";
  const m = f.matches.find((x) => x.memberId === memberId);
  return m ? `We found your name: “${m.word}”` : "Found in the review";
}

/** One review as the colleague sees it. */
function SurveyRow({ f, memberId }: { f: Item; memberId: string }) {
  return (
    <li
      className={cn("border-b rule py-4 last:border-0", f.unseen && "relative")}
    >
      {f.unseen && (
        <span
          className="absolute -left-3 top-5 size-1.5 rounded-full bg-gold-deep"
          aria-label="New"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SmallStars n={f.rating} />
        <span className="text-[12px] text-ink-soft">
          {f.guestName || "A guest"} · {f.source} · {shortDay(f.receivedOn)}
        </span>
        {f.aboveBeyond && (
          <span className="chip border-gold-deep/60 text-gold-deep">
            <Sparkles className="size-3" /> Above and beyond
          </span>
        )}
      </div>
      <blockquote className="mt-2 font-display text-[17px] italic leading-snug">
        “{f.quote}”
      </blockquote>
      <div className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {tagLine(f, memberId)}
      </div>
    </li>
  );
}

/** "My surveys": every review tagged to the colleague, folded away until they want it. */
export function MySurveys({
  memberId,
  defaultOpen = false,
}: {
  memberId: string | null;
  defaultOpen?: boolean;
}) {
  const q = useMySurveys(memberId);
  const ack = useAckSurveys();
  const [open, setOpen] = useState(defaultOpen);
  const d = q.data;
  if (!d) return null;
  const unseen = d.items.filter((f) => f.unseen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && d.isSelf && unseen.length)
      ack.mutate({ ids: unseen.map((f) => f.id) });
  };
  return (
    <section id="surveys" className="scroll-mt-24 rounded-[2px] border rule">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-paper-2/50"
      >
        <span className="flex items-baseline gap-3">
          <span className="font-display text-[22px]">
            {d.isSelf ? "My surveys" : "Surveys"}
          </span>
          <span className="figure text-[18px] text-gold-deep">{d.count}</span>
          {unseen.length > 0 && (
            <span className="chip border-gold-deep/60 bg-gold/15 text-gold-deep">
              {unseen.length} new
            </span>
          )}
        </span>
        <span className="flex items-center gap-3 text-[12.5px] text-ink-soft">
          <span className="hidden sm:inline">
            {d.month} this month · last 12 months
          </span>
          <ChevronDown
            className={cn("size-5 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t rule px-5 pb-2 pl-8">
              {d.items.length ? (
                <ul>
                  {d.items.map((f) => (
                    <SurveyRow key={f.id} f={f} memberId={d.member.id} />
                  ))}
                </ul>
              ) : (
                <p className="py-5 text-[13.5px] text-ink-soft">
                  No guest has named{" "}
                  {d.isSelf ? "you" : d.member.name.split(" ")[0]} yet. When one
                  does, it lands here and counts toward the stars.
                </p>
              )}
              <p className="border-t rule py-3 text-[12px] text-ink-soft">
                Your guest stars are the average of every review and survey
                tagged to you in the last 12 months. A manager can move a review
                to the right colleague if the name was read wrong.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** The new tag notice: who tagged you, in which review. */
export function TagNotice({
  memberId,
  className,
  linkToRewards = true,
}: {
  memberId: string | null;
  className?: string;
  linkToRewards?: boolean;
}) {
  const q = useMySurveys(memberId);
  const ack = useAckSurveys();
  const d = q.data;
  const unseen = (d?.items ?? []).filter((f) => f.unseen);
  if (!d || !d.isSelf || !unseen.length) return null;
  const f = unseen[0]!;
  const who =
    f.tagSource === "manager" ? (f.taggedByName ?? "Your manager") : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-[2px] border border-gold-deep/50 bg-gold/10 px-5 py-4",
        className,
      )}
    >
      <Bell className="mt-0.5 size-5 shrink-0 text-gold-deep" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">
          {who
            ? `${who} tagged you in a ${f.rating ?? ""}${f.rating ? " star " : ""}review`
            : `A guest named you in a ${f.rating ?? ""}${f.rating ? " star " : ""}review`}
          {unseen.length > 1 && (
            <span className="font-normal text-ink-soft">
              {" "}
              · and {unseen.length - 1} more
            </span>
          )}
        </div>
        <div className="mt-1 line-clamp-2 font-display text-[16px] italic text-ink-soft">
          “{f.quote}”
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {linkToRewards && (
          <Link
            href="/rewards/mine#surveys"
            className="btn btn-ink !h-9 !px-3 !text-[12.5px]"
          >
            See my surveys
          </Link>
        )}
        <button
          className="btn btn-line !h-9 !px-3 !text-[12.5px]"
          disabled={ack.isPending}
          onClick={() => ack.mutate({ ids: unseen.map((x) => x.id) })}
        >
          Got it
        </button>
      </div>
    </motion.div>
  );
}

/** The guest star hero: very large stars, the average, and how many reviews it comes from. */
export function StarHero({
  memberId,
  title,
  children,
}: {
  memberId: string | null;
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const q = useMySurveys(memberId);
  const d = q.data;
  return (
    <section className="noir-frame grain relative overflow-hidden rounded-[2px] px-6 py-8 text-ivory md:px-10 md:py-10">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">
            Guest stars
          </div>
          {title && (
            <div className="mt-1 font-display text-[22px] text-ivory/90">
              {title}
            </div>
          )}
          <div className="mt-4">
            <BigStars
              value={d?.stars ?? null}
              size={80}
              className="h-auto w-full max-w-[460px] drop-shadow-[0_0_24px_rgb(197_175_135/0.25)]"
            />
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="figure text-[64px] leading-none text-gold">
              {d?.stars != null ? d.stars.toFixed(1) : "New"}
            </span>
            <span className="text-[13px] text-[#b9b0a3]">
              {d
                ? d.rated
                  ? `from ${d.rated} guest review${d.rated === 1 ? "" : "s"} that named you`
                  : "Your stars appear with your first guest review"
                : "Loading"}
            </span>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
