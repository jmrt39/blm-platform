import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { motion } from "motion/react";
import { Check, Lock, Sparkles } from "lucide-react";
import { CheckList, PERIOD_WORD } from "../components/reward-checks";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { SectionTitle } from "../components/program-bits";
import { MySurveys, StarHero, TagNotice } from "../components/surveys";
import { useMyRewards } from "../queries/rewards";
import { useLibrary } from "../queries/library";
import { ROLE_LABEL } from "../../shared/domain";
import { money, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Data = NonNullable<ReturnType<typeof useMyRewards>["data"]>;
type Row = Data["boards"][number];
type State = Row["state"];

const STATE: Record<State, { label: string; chip: string; order: number }> = {
  awarded: { label: "Awarded", chip: "border-sage/60 bg-sage/10 text-sage", order: 0 },
  eligible: { label: "Eligible now", chip: "border-gold-deep bg-gold/25 text-ink", order: 1 },
  can_earn: { label: "Can still earn", chip: "border-ink/25 text-ink", order: 2 },
  ineligible: { label: "Ineligible", chip: "border-oxblood/50 bg-oxblood/5 text-oxblood", order: 3 },
  not_open: { label: "Not your role", chip: "border-ink/15 text-ink-soft", order: 4 },
};

const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.1 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

/** A thin gold ring that fills to the person's progress. */
function Ring({ value, state }: { value: number | null | undefined; state: State }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const done = state === "eligible" || state === "awarded";
  const p = done ? 1 : Math.max(0, Math.min(1, value ?? 0));
  const color = state === "ineligible" ? "#8c2f2a" : state === "awarded" ? "#4d6b4f" : done ? "#c5af87" : "#8a7350";
  return (
    <div className="relative size-[84px] shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(28 25 21 / 0.08)" strokeWidth="5" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {state === "ineligible" ? (
          <Lock className="size-5 text-oxblood" />
        ) : done ? (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: "spring", stiffness: 260, damping: 14 }}>
            <Check className={cn("size-7", state === "awarded" ? "text-sage" : "text-gold-deep")} strokeWidth={2.5} />
          </motion.span>
        ) : (
          <span className="figure text-[19px]">{value == null ? "0" : Math.round(p * 100)}%</span>
        )}
      </div>
      {done && state === "eligible" && <Twinkle />}
    </div>
  );
}

/** The shifts behind the percentages, so a ring is never a mystery. */
function ShiftsCounted({ d, first }: { d: Data; first: string }) {
  const x = d.shifts;
  const you = d.isSelf ? "you" : first;
  return (
    <div className="mt-4 rounded-[2px] border rule bg-paper-2/40 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <b className="figure text-[17px]">{x.solo30}</b> solo shift{x.solo30 === 1 ? "" : "s"} in the last 30 days
        </span>
        <span>
          <b className="figure text-[17px]">{x.soloQuarter}</b> so far in {x.quarterLabel}
        </span>
        {x.notCounted > 0 && (
          <span className="text-ink-soft">
            {x.notCounted} more logged but not counted (training, being trained, events or cut short)
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-soft">
        {x.firstSolo ? `First solo shift ${shortDay(x.firstSolo)}` : "No solo shifts yet"}
        {x.last ? ` · last shift on a report ${shortDay(x.last)}` : ""}. Every ring below is the lower of two things: the shifts a reward needs and spend per ticket against the bar, so a
        strong first week never reads as nearly there.
        {x.rampingUntil && ` ${d.isSelf ? "You're" : `${first} is`} ramping until ${shortDay(x.rampingUntil)}: shown here, but not ranked against people with a full month on the floor.`}
        {!x.solo30 && ` Rewards that need shifts start counting once ${you} work${d.isSelf ? "" : "s"} solo.`}
      </p>
    </div>
  );
}

/** Three small gold sparks around a qualified ring. Quiet, and only once the ring has filled. */
function Twinkle() {
  const spots = [
    { x: "88%", y: "6%", d: 1.2 },
    { x: "-4%", y: "30%", d: 1.6 },
    { x: "80%", y: "88%", d: 2.1 },
  ];
  return (
    <>
      {spots.map((s, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rotate-45 bg-gold"
          style={{ left: s.x, top: s.y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{ delay: s.d, duration: 1.6, repeat: Infinity, repeatDelay: 3 + i }}
        />
      ))}
    </>
  );
}

/** Board text is written about a colleague; on your own page it reads to you. */
const toYou = (s: string) => s.replace(/\bthem\b/g, "you").replace(/\btheir\b/g, "your").replace(/\bThey\b/g, "You");

function RewardCard({ row, i, self }: { row: Row; i: number; self: boolean }) {
  const say = (s: string) => (self ? toYou(s) : s);
  const L = useLibrary();
  const r = L.rewardByKey[row.key];
  if (!r) return null;
  const e = row.entry;
  const st = STATE[row.state];
  const lit = row.state === "eligible" || row.state === "awarded";
  const label = row.state === "ineligible" ? `Ineligible ${e?.upcoming && e.status !== "eligible" ? "this month" : (PERIOD_WORD[r.cadence] ?? "this period")}` : st.label;
  // For rewards paid on last month, what to act on is the month now running.
  const ahead = e?.upcoming && e.status !== "eligible" && !row.awarded ? e.upcoming : null;
  return (
    <motion.article {...rise(i)} className={cn("relative overflow-hidden rounded-[2px] border bg-paper p-5", lit ? "border-gold-deep/70 shadow-[0_10px_30px_-18px_rgba(138,115,80,0.7)]" : "rule")}>
      {lit && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
        />
      )}
      <div className="flex gap-5">
        <Ring value={e?.progress} state={row.state} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="eyebrow">
              {r.cadence} · {ahead ? ahead.label : row.period.label}
            </div>
            <span className={cn("chip", st.chip)}>
              {lit && <Sparkles className="size-3" />} {label}
            </span>
          </div>
          <h3 className="mt-1 font-display text-[22px] leading-tight">{r.title}</h3>
          <div className="text-[12.5px] font-semibold text-gold-deep">
            {r.value}
            {row.key === "above_beyond" && e?.amount ? <> · {money(e.amount)} in all</> : null}
          </div>
          {r.choices?.length ? (
            <ul className="mt-1 space-y-0.5 text-[12px] text-ink-soft">
              {r.choices.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          ) : null}
          {row.why && (
            <div className={cn("mt-1.5 text-[13px] font-semibold leading-snug", row.state === "ineligible" ? "text-oxblood" : row.state === "not_open" ? "text-ink-soft" : "text-ink")}>
              {say(row.why)}
            </div>
          )}
        </div>
      </div>
      {e && row.state !== "not_open" && (
        <div className="mt-4 space-y-3 border-t rule pt-3 text-[12.5px]">
          {row.awarded && (
            <div className="font-semibold text-sage">
              Awarded by {row.awarded.awardedByName} on {new Date(row.awarded.awardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {row.awarded.amount ? ` · ${money(row.awarded.amount)}` : ""}
              {row.awarded.note ? ` · ${row.awarded.note}` : ""}
            </div>
          )}
          {ahead ? (
            <>
              <CheckList title={`${ahead.label}: what it takes`} checks={ahead.checks.map((c) => ({ ...c, label: say(c.label) }))} />
              <div className="text-ink-soft">
                <span className="font-semibold text-ink">{row.period.label}:</span> {say(e.why ?? "not earned")}
              </div>
            </>
          ) : (
            e.checks && <CheckList title={`What it takes · ${row.period.label}`} checks={e.checks.map((c) => ({ ...c, label: say(c.label) }))} />
          )}
          {!e.blocked && (
            <div className="space-y-1">
              {e.next && row.state !== "ineligible" && <div className="font-display text-[16px] italic leading-snug">{e.next}</div>}
              <div className="text-ink-soft">{e.metric}</div>
              {e.live && <div className="text-ink-soft">{e.live}</div>}
              {e.eligible && e.amount ? <div className="font-semibold text-sage">{money(e.amount)}</div> : null}
              {e.note && !ahead && !row.why?.includes(e.note) && <div className="text-ink-soft">{e.note}</div>}
              {e.rank && row.leaders.length > 0 && !e.eligible && <div className="text-ink-soft">Leading now: {row.leaders.join(", ")}</div>}
            </div>
          )}
        </div>
      )}
      <details className="group mt-3 text-[12px] text-ink-soft">
        <summary className="cursor-pointer list-none font-semibold text-ink-soft hover:text-ink">The rule in full</summary>
        <p className="mt-1.5">{r.rule}</p>
        <p className="mt-1">{row.basis}</p>
      </details>
    </motion.article>
  );
}

export default function MyRewardsPage() {
  const v = useViewer();
  const params = useParams<{ id?: string }>();
  const memberId = params.id ?? v.me.member?.id ?? null;
  const q = useMyRewards(memberId, !!memberId);
  const L = useLibrary();

  useEffect(() => {
    if (q.data && window.location.hash === "#surveys") document.getElementById("surveys")?.scrollIntoView({ behavior: "smooth" });
  }, [q.data]);

  if (!memberId)
    return (
      <Page title="My rewards">
        <p className="text-[14px] text-ink-soft">Open your store and sign in with your PIN to see where you stand.</p>
      </Page>
    );
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} what="Their rewards and pay" />;
  const d = q.data!;
  const first = d.member.name.split(" ")[0];
  const rows = [...d.boards].sort((a, b) => STATE[a.state].order - STATE[b.state].order);
  const open = rows.filter((r) => r.state !== "not_open");
  const closed = rows.filter((r) => r.state === "not_open");
  const count = (s: State[]) => open.filter((r) => s.includes(r.state)).length;
  const numbers = [
    { label: "Eligible now", value: count(["eligible", "awarded"]), tone: "text-gold-deep" },
    { label: "Can still earn", value: count(["can_earn"]), tone: "" },
    { label: "Ineligible", value: count(["ineligible"]), tone: count(["ineligible"]) ? "text-oxblood" : "" },
    { label: "Earned this year", value: money(d.earnedThisYear), tone: "text-sage" },
  ];
  const held = open.filter((r) => r.state === "ineligible" && r.why?.startsWith("Conduct")).length;

  return (
    <Page
      eyebrow={`${d.store.name} · ${d.isSelf ? "My rewards" : `${d.member.name} · ${ROLE_LABEL[d.member.role]}`}`}
      title={
        d.isSelf ? (
          <>
            Where you <em className="text-gold-deep">stand</em>, {first}
          </>
        ) : (
          <>
            Where {first} <em className="text-gold-deep">stands</em>
          </>
        )
      }
      aside={
        !d.isSelf && (
          <Link href={`/team/${d.member.id}`} className="btn btn-line">
            Profile
          </Link>
        )
      }
    >
      {d.isSelf && <TagNotice memberId={d.member.id} className="mb-5" linkToRewards={false} />}
      <motion.div {...rise(0)}>
        <StarHero memberId={d.member.id}>
          <div className="max-w-[34ch] text-[13px] leading-relaxed text-[#b9b0a3]">
            Every guest review or survey that names {d.isSelf ? "you" : first} counts here. The most in a month wins, and a review a manager marks above and beyond can earn $500 and a
            paid day off.
          </div>
        </StarHero>
      </motion.div>

      <motion.div {...rise(1)} className="mt-5">
        <MySurveys memberId={d.member.id} />
      </motion.div>

      <motion.dl {...rise(2)} className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-y rule py-6 md:grid-cols-4">
        {numbers.map((n) => (
          <div key={n.label}>
            <dt className="eyebrow">{n.label}</dt>
            <dd className={cn("figure mt-1 text-[38px] leading-none", n.tone)}>{n.value}</dd>
          </div>
        ))}
      </motion.dl>
      <ShiftsCounted d={d} first={first ?? ""} />
      {held > 0 && (
        <p className="mt-4 rounded-[2px] border border-oxblood/30 bg-oxblood/5 px-4 py-3 text-[13px] text-oxblood">
          {held} reward{held === 1 ? " is" : "s are"} held back for this period because of a written warning, performance plan or termination. Eligibility returns from the next full
          period.
        </p>
      )}

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {open.map((row, i) => (
          <RewardCard key={row.key} row={row} i={i + 3} self={d.isSelf} />
        ))}
      </div>
      {closed.length > 0 && (
        <p className="mt-5 text-[12.5px] text-ink-soft">
          Not open to {ROLE_LABEL[d.member.role]?.toLowerCase() ?? "this role"}s: {closed.map((r) => L.rewardByKey[r.key]?.title ?? r.key).join(", ")}.
        </p>
      )}

      <div className="mt-12">
        <SectionTitle>Received</SectionTitle>
        {d.awards.length ? (
          <ul className="divide-y divide-paper-line border-y rule">
            {d.awards.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-[13.5px]">
                <span>
                  <span className="font-semibold">{L.rewardByKey[a.reward as keyof typeof L.rewardByKey]?.title ?? a.reward}</span>
                  <span className="ml-2 text-ink-soft">{a.period}</span>
                  {a.note && <span className="ml-2 text-ink-soft">· {a.note}</span>}
                </span>
                <span className="text-[12.5px] text-ink-soft">
                  {a.amount ? <span className="figure mr-3 text-[16px] text-sage">{money(a.amount)}</span> : null}
                  {a.awardedByName} · {new Date(a.awardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-soft">Nothing yet. The first one is the best one.</p>
        )}
      </div>
    </Page>
  );
}
