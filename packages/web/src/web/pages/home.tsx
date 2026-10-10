import { Link } from "wouter";
import { motion } from "motion/react";
import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { HowCalculated } from "../components/how";
import { ProgramBlock, StaffProgram } from "../components/program-home";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Delta, Empty, Spark, Stat, StatusPill } from "../components/bits";
import { Monogram } from "../components/monogram";
import { LastYearStrip } from "../components/last-year";
import { useHome } from "../queries/reports";
import { useTodayChecklists } from "../queries/checklists";
import { useSetupStatus } from "../queries/setup";
import { useMember } from "../queries/team";
import { OnboardingResume } from "./team";
import { FeedbackInbox } from "../components/feedback-inbox";
import { StarHero, TagNotice } from "../components/surveys";
import { dayLabel, money, money2, num, pct, shortDay, timeOf } from "../lib/format";
import { ROLE_LABEL } from "../../shared/domain";
import { cn } from "../lib/utils";

const rise = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.08 + i * 0.07, duration: 0.45 },
});

export default function Home() {
  const v = useViewer();
  if (v.me.level === "staff") return <StaffHome />;
  return <OwnerHome />;
}

/** Shown to a new group until the seven setup steps are done. Disappears on its own. */
function GettingStarted() {
  const q = useSetupStatus();
  const s = q.data;
  if (!s || s.done >= s.total) return null;
  const next = s.steps.find((x) => !x.done);
  return (
    <motion.section {...rise(0)} className="mb-10 rounded-[2px] bg-noir p-6 text-ivory md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">Getting started</div>
          <h2 className="mt-1 font-display text-[26px]">
            {s.done} of {s.total} done. Next: {next?.label}.
          </h2>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gold" style={{ width: `${(s.done / s.total) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-6 grid gap-2 md:grid-cols-2">
        {s.steps.map((st, i) => (
          <li key={st.key}>
            <Link
              href={st.href}
              className={cn(
                "flex items-center gap-3 rounded-[2px] border border-white/10 px-4 py-3 text-[13.5px] transition hover:border-gold/60",
                st.done && "text-[#8b8277] line-through decoration-white/20",
              )}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[11px]", st.done ? "border-gold bg-gold text-noir" : "border-white/25")}>
                {st.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {st.label}
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[12.5px] text-[#b5ab9d]">
        Rather do it in one go?{" "}
        <a href="/templates/blm-client-intake.xlsx" download="BLM client intake.xlsx" className="font-semibold text-gold underline">
          Download the intake sheet
        </a>
        , fill in what you have and send it to BLM. Stores, targets, review pages, your team and last year's sales are set up from it.
      </p>
    </motion.section>
  );
}

const PRIORITY = { 1: "Today", 2: "This week", 3: "When you can" } as const;

function OwnerHome() {
  const v = useViewer();
  const scopeId = v.isLeader ? v.scope : v.storeId;
  const q = useHome(scopeId);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const scopeLabel = v.isLeader && !v.scope ? "All stores combined" : (v.store?.name ?? "");
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const h = q.data;
  if (!h) return <Page title="The bottom line, today">No stores yet.</Page>;

  const storeCount = Math.max(1, h.nightStores.length);
  const priorDays = Math.max(1, h.prior.nights / storeCount);
  const priorSales = h.prior.sales / priorDays;
  const priorCovers = h.prior.covers / priorDays;
  const comp = h.month.totals.compliance;
  const gap = h.month.gap;
  const halfGap = h.month.totals.halfGapAnnual;
  const series = h.month.series;
  const noNight = h.night.checks === 0;
  const below = !noNight && h.night.spt < h.night.ticketTarget;
  const diff = Math.round((h.night.spt - h.night.ticketTarget) * 100) / 100;
  const period30 = `${shortDay(h.month.totals.nights ? (series[0]?.date ?? h.today) : h.today)} to ${shortDay(series[series.length - 1]?.date ?? h.today)}`;
  const tz = h.todayLists[0]?.timezone ?? "America/New_York";
  const ramping = h.month.stores.flatMap((s) => s.gap?.ramping ?? []);
  const rampingAll = ramping.length ? ramping : (gap?.ramping ?? []);

  return (
    <Page
      eyebrow={
        <>
          {dayLabel(h.today)} · {scopeLabel}
        </>
      }
      title={
        <>
          The bottom line, <em className="text-gold-deep">today</em>
        </>
      }
      aside={
        <>
          <Link href="/shift-report" className="btn btn-line">
            Enter shift report
          </Link>
          <Link href="/reports" className="btn btn-ink">
            Full reports <ArrowUpRight className="size-4" />
          </Link>
        </>
      }
    >
      <GettingStarted />
      {/* Last night */}
      <motion.div {...rise(0)} className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="eyebrow">Last night · {shortDay(h.lastNight)}</div>
        <div className="flex items-center gap-3 text-[12px] text-ink-soft">
          <span>Arrows: vs. the 7 nights before</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-oxblood" /> below the store's own target
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-sage" /> at or above
          </span>
        </div>
      </motion.div>
      <motion.div {...rise(1)} className="grid grid-cols-2 gap-x-6 gap-y-8 border-b rule pb-9 lg:grid-cols-4">
        <Stat
          label={
            <>
              Net sales <HowCalculated metric="netSales" period={shortDay(h.lastNight)} />
            </>
          }
          value={money(h.night.sales)}
          sub={<Delta cur={h.night.sales} prev={priorSales} />}
        />
        <Stat
          label={
            <>
              Covers <HowCalculated metric="covers" period={shortDay(h.lastNight)} />
            </>
          }
          value={num(h.night.covers)}
          sub={
            <>
              <Delta cur={h.night.covers} prev={priorCovers} /> · {num(h.night.checks)} tickets
            </>
          }
        />
        <Stat
          label={
            <>
              Spend per ticket <HowCalculated metric="spendPerTicket" period={shortDay(h.lastNight)} />
            </>
          }
          value={noNight ? "·" : money2(h.night.spt)}
          tone={noNight ? undefined : below ? "bad" : "good"}
          sub={
            noNight ? (
              <>Mix target {money2(h.night.ticketTarget)} · no report yet</>
            ) : (
            <>
              Mix target {money2(h.night.ticketTarget)} ·{" "}
              <span className={below ? "text-oxblood" : "text-sage"}>
                {diff >= 0 ? "+" : "−"}
                {money2(Math.abs(diff))}
              </span>
            </>
            )
          }
        />
        <Stat
          label={
            <>
              On time checklist completion · 30d <HowCalculated metric="onTime" period={period30} />
            </>
          }
          value={pct(comp.rate)}
          tone={comp.rate != null && comp.rate >= 0.9 ? "good" : "bad"}
          sub={
            <>
              {comp.onTime} of {comp.expected} expected on time · {comp.late} late · {comp.missed} missed
            </>
          }
        />
      </motion.div>

      <motion.div {...rise(2)}>
        <LastYearStrip night={h.lastYear.night} month={h.lastYear.month} today={h.lastYear.today} lastNight={h.lastNight} />
      </motion.div>

      <motion.div {...rise(2)} className="[&>section]:mt-8 [&>section]:mb-2">
        <FeedbackInbox storeId={scopeId} showStore={v.isLeader && !v.scope} />
      </motion.div>

      {/* What to do next */}
      <motion.div {...rise(2)} className="border-b rule py-8">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="eyebrow">What to do next</div>
          <div className="text-[12px] text-ink-soft">{h.actions.length} open</div>
        </div>
        {h.actions.length ? (
          <div className="divide-y divide-paper-line border-y rule">
            {h.actions.slice(0, 8).map((a, i) => (
              <Link key={i} href={a.href} className="group grid grid-cols-[92px_1fr_auto] items-center gap-3 py-3 hover:bg-paper-2/60 sm:grid-cols-[120px_1fr_auto]">
                <span
                  className={cn(
                    "text-[10.5px] font-bold uppercase tracking-[0.14em]",
                    a.priority === 1 ? "text-oxblood" : a.priority === 2 ? "text-gold-deep" : "text-ink-soft",
                  )}
                >
                  {PRIORITY[a.priority]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{a.text}</span>
                  <span className="block truncate text-[12px] text-ink-soft">{a.detail}</span>
                </span>
                <span className="whitespace-nowrap text-[12.5px] font-semibold text-gold-deep group-hover:underline">{a.cta} →</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-[13.5px] italic text-ink-soft">Nothing outstanding. A clean house.</div>
        )}
      </motion.div>

      <div className="grid gap-10 pt-9 lg:grid-cols-[1.35fr_1fr]">
        {/* The gap */}
        <motion.div {...rise(3)}>
          <div className="eyebrow mb-3">
            Server spend per ticket · last 30 days <HowCalculated metric="serverSpend" period={period30} />
          </div>
          {gap ? (
            <div className="relative overflow-hidden rounded-[2px] bg-noir p-6 text-ivory md:p-7">
              <Monogram size={120} className="absolute -right-6 -top-4 opacity-[0.07]" />
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold">Top two servers</div>
                  <div className="figure mt-1 text-[38px] leading-none text-ivory">{money2(gap.topSpt)}</div>
                  <div className="mt-2 text-[12px] text-[#b9b0a3]">{gap.top.map((p) => p.name).join(" · ")}</div>
                </div>
                <div className="pb-3 font-display text-[22px] italic text-gold">vs</div>
                <div className="text-right">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold">Priority coaching opportunities</div>
                  <div className="figure mt-1 text-[38px] leading-none text-ivory">{money2(gap.bottomSpt)}</div>
                  <div className="mt-2 text-[12px] text-[#b9b0a3]">{gap.bottom.map((p) => p.name).join(" · ")}</div>
                </div>
              </div>
              <div className="mt-6 border-t border-noir-line pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-[12px] text-[#b9b0a3]">Gap per ticket</div>
                    <div className="figure text-[30px] text-gold">{money2(gap.gap)}</div>
                    <div className="text-[11px] text-[#8f877b]">
                      {money2(gap.topSpt)} − {money2(gap.bottomSpt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] text-[#b9b0a3]">
                      Modeled annual sales opportunity <HowCalculated metric="opportunity" period={period30} dark />
                    </div>
                    <div className="figure text-[30px] text-gold">+{money(gap.annualHalfGap)} / yr</div>
                    <div className="text-[11px] text-[#8f877b]">Not verified loss or guaranteed improvement</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAssumptions((x) => !x)}
                  aria-expanded={showAssumptions}
                  className="mt-4 text-[12px] font-semibold text-gold hover:underline"
                >
                  {showAssumptions ? "Hide assumptions ▲" : "Show assumptions ▼"}
                </button>
                {showAssumptions && <Assumptions gap={gap} combined={v.isLeader && !v.scope} stores={h.month.stores} halfGap={halfGap} />}
              </div>
            </div>
          ) : (
            <Empty>Not enough shift reports yet to compare servers.</Empty>
          )}

          {rampingAll.length > 0 && (
            <div className="mt-5 rounded-[2px] border rule p-4">
              <div className="eyebrow mb-1">Ramping · first {30} days, not ranked</div>
              <p className="mb-3 text-[12.5px] text-ink-soft">New colleagues are never compared against veterans. They're tracked against their own 30 / 60 / 90 plan instead.</p>
              <div className="space-y-2">
                {rampingAll.map((p) => (
                  <Link key={p.memberId ?? p.name} href={p.memberId ? `/team/${p.memberId}` : "/team"} className="flex items-baseline justify-between gap-3 text-[13.5px] hover:underline">
                    <span>
                      <span className="font-semibold">{p.name}</span> <span className="text-ink-soft">· {p.storeName}</span>
                    </span>
                    <span className="text-[12.5px] text-ink-soft">
                      Day {p.tenureDays} · {money2(p.spt)} / ticket · {p.shifts} shifts
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {series.length > 1 && (
            <div className="mt-8">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="eyebrow">Spend per ticket by night</div>
                <div className="text-[11.5px] text-ink-soft">dashed = mix target {money2(h.month.totals.ticketTarget)}</div>
              </div>
              <Spark data={series.map((s) => s.spt)} target={h.month.totals.ticketTarget} height={80} />
              <div className="mt-1 flex justify-between text-[11px] text-ink-soft">
                <span>{shortDay(series[0]!.date)}</span>
                <span>{shortDay(series[series.length - 1]!.date)}</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Today */}
        <motion.div {...rise(4)} className="space-y-8">
          <div>
            <div className="eyebrow mb-1">Today's checklists</div>
            <div className="mb-3 text-[12px] text-ink-soft">
              Business date {dayLabel(h.today, { weekday: "short", month: "short", day: "numeric" })} · {tz.replace("_", " ")} · closing for this date is due 1:00 am the next morning
            </div>
            <div className="divide-y divide-paper-line border-y rule">
              {h.todayLists.map((c) => {
                const late = c.status !== "submitted" && new Date(c.dueAt).getTime() < Date.now();
                const notOpen = new Date(c.opensAt).getTime() > Date.now();
                return (
                  <Link key={c.id} href={`/checklists/${c.id}`} className="group flex items-center gap-4 py-3 hover:bg-paper-2/60">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">
                        <span className="capitalize">{c.type}</span> {v.isLeader && !v.scope && <span className="font-normal text-ink-soft">· {c.storeName}</span>}
                      </div>
                      <div className="text-[12px] text-ink-soft">
                        {c.submittedAt
                          ? `Submitted ${timeOf(c.submittedAt, c.timezone)}${c.verifiedByName ? ` · ${c.verifiedByName}` : ""}`
                          : notOpen
                            ? `Opens ${timeOf(c.opensAt, c.timezone)} · due ${timeOf(c.dueAt, c.timezone)}`
                            : `${c.done}/${c.total} done${c.na ? ` (${c.na} N/A)` : ""} · due ${timeOf(c.dueAt, c.timezone)}`}
                      </div>
                    </div>
                    <div className="w-20">
                      <Bar value={c.done} max={c.total} tone={c.status === "submitted" ? "gold" : late ? "bad" : "ink"} />
                    </div>
                    <StatusPill status={c.status} late={late || (c.submittedAt ? new Date(c.submittedAt) > new Date(c.dueAt) : false)} />
                  </Link>
                );
              })}
            </div>
          </div>
          <ProgramBlock storeId={scopeId} />
        </motion.div>
      </div>

      {/* Stores side by side */}
      {h.nightStores.length > 1 && (
        <motion.div {...rise(5)} className="mt-12">
          <div className="eyebrow mb-3">By store · last night and 30 days</div>
          {/* Phone: one card per store */}
          <div className="space-y-3 md:hidden">
            {h.nightStores.map((s) => {
              const m = h.month.stores.find((x) => x.id === s.id);
              const bad = s.nights > 0 && s.spt < s.ticketTarget;
              return (
                <div key={s.id} className="rounded-[2px] border rule p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-[11px] text-ink-soft">Store {s.number}</div>
                  </div>
                  <div className="mt-2 text-[13px]">
                    {s.nights ? (
                      <>
                        <span className="figure text-[18px]">{money(s.sales)}</span> · {num(s.checks)} tickets
                      </>
                    ) : (
                      <span className="text-oxblood">No report last night</span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                    <div>
                      <dt className="text-ink-soft">Spend / ticket</dt>
                      <dd className={cn("font-semibold", bad ? "text-oxblood" : "text-sage")}>{s.nights ? money2(s.spt) : "·"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">30 day baseline</dt>
                      <dd className="font-semibold">{m ? money2(m.spt) : "·"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">On time</dt>
                      <dd className="font-semibold">
                        {pct(m?.compliance.rate)} <span className="font-normal text-ink-soft">of {m?.compliance.expected ?? 0}</span>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex gap-4 text-[12.5px] font-semibold text-gold-deep">
                    <Link href={`/reports?store=${s.id}`}>View findings →</Link>
                    <button type="button" className="font-semibold" onClick={() => v.setScope(s.id)}>
                      View actions →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop: table with a sticky store column */}
          <div className="relative hidden md:block">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-paper">Store</th>
                    <th className="r">Net sales</th>
                    <th className="r">Tickets</th>
                    <th className="r">Spend / ticket</th>
                    <th className="r">Mix target</th>
                    <th className="r">30 day baseline</th>
                    <th className="r">Gap / ticket</th>
                    <th className="r">On time completion</th>
                  </tr>
                </thead>
                <tbody>
                  {h.nightStores.map((s) => {
                    const m = h.month.stores.find((x) => x.id === s.id);
                    return (
                      <tr key={s.id}>
                        <td className="sticky left-0 z-10 bg-paper">
                          <button className="text-left font-semibold hover:underline" onClick={() => v.setScope(s.id)}>
                            {s.name}
                          </button>
                          <div className="text-[11px] text-ink-soft">Store {s.number}</div>
                        </td>
                        <td className="r figure text-[16px]">{s.nights ? money(s.sales) : "·"}</td>
                        <td className="r">{s.nights ? num(s.checks) : "·"}</td>
                        <td className={cn("r font-semibold", s.spt >= s.ticketTarget ? "text-sage" : "text-oxblood")}>{s.nights ? money2(s.spt) : "·"}</td>
                        <td className="r text-ink-soft">{money2(s.ticketTarget)}</td>
                        <td className="r">{m ? money2(m.spt) : "·"}</td>
                        <td className="r">{m?.gap ? money2(m.gap.gap) : "·"}</td>
                        <td className="r">
                          {pct(m?.compliance.rate)} <span className="text-[11px] text-ink-soft">({m?.compliance.onTime ?? 0}/{m?.compliance.expected ?? 0})</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* New hires */}
      {h.newHires.length > 0 && (
        <motion.div {...rise(6)} className="mt-12">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="eyebrow">30 / 60 / 90 · new colleagues</div>
            <Link href="/team/new" className="text-[12.5px] font-semibold text-gold-deep hover:underline">
              + Add a colleague
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {h.newHires.slice(0, 6).map((n) => (
              <Link key={n.id} href={`/team/${n.id}`} className="rounded-[2px] border rule p-4 hover:border-ink">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{n.name}</div>
                  <div className="figure text-[15px] text-gold-deep">Day {n.days}</div>
                </div>
                <div className="mb-2.5 text-[12px] text-ink-soft">{ROLE_LABEL[n.role]}</div>
                <Bar value={n.done} max={n.total} tone="gold" />
                <div className="mt-1.5 text-[11.5px] text-ink-soft">
                  {n.done} of {n.total} steps
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </Page>
  );
}

type HomeData = NonNullable<ReturnType<typeof useHome>["data"]>;
type Gap = NonNullable<HomeData["month"]["gap"]>;

function Assumptions({ gap, combined, stores, halfGap }: { gap: Gap; combined: boolean; stores: HomeData["month"]["stores"]; halfGap: number }) {
  const a = gap.assumptions;
  const per = stores.filter((s) => s.gap);
  return (
    <div className="mt-3 space-y-2 rounded-[2px] bg-noir-2 p-4 text-[12.5px] leading-relaxed text-[#cfc6b8]">
      <div>
        <span className="font-semibold text-ivory">Period:</span> {a.from} to {a.to} ({a.days} days), annualised × {a.annualise} (365 ÷ {a.days})
      </div>
      <div>
        <span className="font-semibold text-ivory">Who is compared:</span> {a.roles.join(" and ")}s with {a.minShifts}+ shifts and {a.rampDays}+ days tenure ({a.poolSize} people).
        Comparable shifts only: same stores, same nights in the period.
      </div>
      <div>
        <span className="font-semibold text-ivory">Top two:</span>{" "}
        {gap.top.map((p) => `${p.name} (${p.storeName}, ${p.checks} tickets, ${p.shifts} shifts, ${p.tenureDays}d)`).join("; ")}
      </div>
      <div>
        <span className="font-semibold text-ivory">Priority coaching:</span>{" "}
        {gap.bottom.map((p) => `${p.name} (${p.storeName}, ${p.checks} tickets, ${p.shifts} shifts, ${p.tenureDays}d)`).join("; ")}
      </div>
      {gap.ramping.length > 0 && (
        <div>
          <span className="font-semibold text-ivory">Left out as ramping:</span> {gap.ramping.map((p) => `${p.name} (day ${p.tenureDays})`).join(", ")}
        </div>
      )}
      <div>
        <span className="font-semibold text-ivory">Recoverable:</span> half the gap ({money2(gap.gap / 2)} per ticket) × {num(a.bottomTickets)} priority tickets × {a.annualise} ={" "}
        <span className="text-gold">{money(gap.annualHalfGap)}</span>
      </div>
      {combined && per.length > 1 && (
        <div>
          <span className="font-semibold text-ivory">All stores:</span> compared store by store instead (each against its own servers):{" "}
          {per.map((s) => `${s.name} ${money(s.gap!.annualHalfGap)}`).join(" + ")} = <span className="text-gold">{money(halfGap)}</span>
        </div>
      )}
      <div className="text-[#8f877b]">This is sales, not contribution or profit. It's a coaching target, not verified loss or guaranteed improvement.</div>
    </div>
  );
}

function StaffResume({ memberId }: { memberId: string }) {
  const q = useMember(memberId);
  if (!q.data) return null;
  return <OnboardingResume items={q.data.onboarding} today={q.data.today} className="mb-10" />;
}

function StaffHome() {
  const v = useViewer();
  const q = useTodayChecklists(v.storeId);
  const first = v.me.accessName.split(" ")[0];
  return (
    <Page eyebrow={`${v.store?.name} · ${ROLE_LABEL[v.me.accessRole]}`} title={<>Welcome back, {first}.</>}>
      {v.me.member && (
        <>
          <TagNotice memberId={v.me.member.id} className="mb-5" />
          <motion.div {...rise(0)} className="mb-10">
            <StarHero memberId={v.me.member.id}>
              <Link href="/rewards/mine" className="btn btn-gold">
                My rewards <ArrowUpRight className="size-4" />
              </Link>
            </StarHero>
          </motion.div>
          <StaffResume memberId={v.me.member.id} />
        </>
      )}
      <div className="eyebrow mb-3">Today's checklists</div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data?.checklists.map((c) => (
            <Link key={c.id} href={`/checklists/${c.id}`} className="group rounded-[2px] border rule p-5 hover:border-ink">
              <div className="flex items-start justify-between">
                <div className="font-display text-[26px] capitalize">{c.type}</div>
                <StatusPill status={c.status} late={c.late} />
              </div>
              <div className="mt-1 text-[12.5px] text-ink-soft">
                {c.done} of {c.total} lines initialled · due {timeOf(c.dueAt)}
              </div>
              <Bar value={c.done} max={c.total} className="mt-4" tone={c.status === "submitted" ? "gold" : "ink"} />
              <div className="mt-4 text-[13px] font-semibold text-gold-deep group-hover:underline">
                {c.status === "open" ? "Initial your lines →" : "View sign off →"}
              </div>
            </Link>
          ))}
        </div>
      )}
      <StaffProgram />
      {v.me.member && (
        <div className="mt-10">
          <Link href={`/team/${v.me.member.id}`} className="btn btn-line">
            My profile & 30/60/90 plan
          </Link>
        </div>
      )}
    </Page>
  );
}
