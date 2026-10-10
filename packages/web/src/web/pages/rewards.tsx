import { useState } from "react";
import { Link } from "wouter";
import { Award, Check, Undo2 } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useAwardReward, useRevokeReward, useRewards } from "../queries/rewards";
import { useLibrary } from "../queries/library";

import { ROLE_LABEL, rolesList } from "../../shared/domain";
import { BONUS_RULE, CONDUCT_BLOCK_RULE, PAYOUT_RULE } from "../../shared/metrics";
import { errMsg, money, shortDay } from "../lib/format";
import { PERIOD_WORD, STATUS_CHIP, STATUS_LABEL, Tick } from "../components/reward-checks";
import { cn } from "../lib/utils";
import { LockedNotice } from "../components/private";

const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export default function RewardsPage() {
  const v = useViewer();
  const q = useRewards(v.storeId);
  const award = useAwardReward();
  const revoke = useRevokeReward();
  const [open, setOpen] = useState<string | null>(null);
  // Rewards with a choice of prizes: which row is picking, and what they picked.
  const [picking, setPicking] = useState<{ key: string; memberId: string; choice: string } | null>(null);
  const L = useLibrary();
  const n = L.lib.rewards.length;
  return (
    <Page eyebrow={`${v.store?.name} · Recognition & rewards`} title={`The ${COUNT_WORD[n] ?? n} rewards`}>
      <StoreTabs />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <div className="-mt-2 mb-8 max-w-[78ch] space-y-1.5 text-[13.5px] text-ink-soft">
            <p>
              Eligibility is worked out from the platform's own numbers: spend per ticket from shift reports, floor grades, sign offs, guest reviews and conduct. Target{" "}
              {money(q.data!.store.ticketTarget)} spend per ticket (bartenders 40% of that), set from your BLM audit and last year's POS history. A manager records the award when it's given.
            </p>
            <p>
              <span className="font-semibold text-ink">Cash.</span> {BONUS_RULE} {PAYOUT_RULE}
            </p>
            <p>
              <span className="font-semibold text-ink">Conduct.</span> {CONDUCT_BLOCK_RULE}
            </p>
            <p>
              <span className="font-semibold text-ink">Reading a board.</span> Each reward lists what it takes, and every colleague gets a tick or a cross on each point. Then one
              status: <b className="text-ink">Eligible now</b> means everything is met if the period ended today. <b className="text-ink">Can still earn</b> means there is time
              left. <b className="text-oxblood">Ineligible</b> means it can't be won this period, and the reason is written under their name: not enough shifts, ramping, conduct,
              or too late.
            </p>
          </div>
          {award.error && <div className="mb-4 text-[13px] text-oxblood">{errMsg(award.error)}</div>}
          <div className="grid gap-5 xl:grid-cols-2">
            {q.data!.boards.map((b) => {
              const r = L.rewardByKey[b.key];
              if (!r) return null;
              const elig = b.entries.filter((e) => e.eligible);
              const order = { eligible: 0, can_earn: 1, ineligible: 2 } as const;
              const rows = [...b.entries].sort((x, y) => order[x.status ?? "can_earn"] - order[y.status ?? "can_earn"]);
              const shown = open === b.key ? rows : rows.slice(0, 6);
              const word = b.closed ? `for ${b.period.label.split(" ")[0]}` : (PERIOD_WORD[r.cadence] ?? "this period");
              return (
                <section key={b.key} className="min-w-0 rounded-[2px] border rule p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="eyebrow mb-1">
                        {r.n} · {r.cadence} · {b.period.label}
                      </div>
                      <h2 className="font-display text-[23px] leading-tight">{r.title}</h2>
                    </div>
                    <span className="chip max-w-[50%] shrink-0 !whitespace-normal text-right border-gold-deep/60 text-gold-deep">{r.value}</span>
                  </div>
                  <div className="mt-3 rounded-[2px] bg-paper-2/50 px-3.5 py-3">
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">What it takes</span>
                      <span className="text-[11.5px] text-ink-soft">
                        {b.openTo.length ? `Open to ${rolesList(b.openTo)}` : "Open to everyone on the floor"}
                        {b.closed ? ` · judged on ${b.period.label}, now closed` : b.ends ? ` · ends ${shortDay(b.ends)}` : " · no end date"}
                      </span>
                    </div>
                    <ol className="space-y-0.5 text-[12.5px]">
                      {b.criteria.map((c, i) => (
                        <li key={c.label} className="flex gap-2">
                          <span className="figure w-4 shrink-0 text-gold-deep">{i + 1}</span>
                          <span>
                            <b className="font-semibold">{c.short}.</b> {c.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <details className="mt-1.5 text-[11.5px] text-ink-soft">
                      <summary className="cursor-pointer list-none font-semibold hover:text-ink">The rule in full</summary>
                      <p className="mt-1">{r.rule}</p>
                      {r.choices?.length ? <p className="mt-1">The prizes: {r.choices.join("; ")}.</p> : null}
                      {b.basis && <p className="mt-1">{b.basis}</p>}
                    </details>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    {rows.length === 0 ? (
                      <div className="py-2 text-[13px] text-ink-soft">Nobody in a role this is open to yet.</div>
                    ) : (
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="border-b rule text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                            <th className="py-1.5 pr-2 font-bold">Colleague</th>
                            {b.criteria.map((c, i) => (
                              <th key={c.label} title={c.label} className="px-1.5 py-1.5 text-center font-bold whitespace-nowrap">
                                {i + 1} {c.short}
                              </th>
                            ))}
                            <th className="py-1.5 pl-2 text-right font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((e) => {
                            const done = b.awarded.find((a) => a.memberId === e.memberId);
                            const mine = q.data!.meId === e.memberId;
                            const st = e.status ?? "can_earn";
                            return (
                              <tr key={e.memberId} className={cn("border-b rule align-top last:border-0", mine && "bg-gold/10")}>
                                <td className="py-2 pr-2">
                                  {q.data!.canAward || mine ? (
                                    <Link href={mine ? "/rewards/mine" : `/rewards/mine/${e.memberId}`} className="font-semibold hover:underline">
                                      {e.name}
                                    </Link>
                                  ) : (
                                    <span className="font-semibold">{e.name}</span>
                                  )}
                                  <span className="ml-1.5 text-[11px] text-ink-soft">{ROLE_LABEL[e.role]}</span>
                                  {e.why && <div className={cn("mt-0.5 max-w-[34ch] text-[11.5px] leading-snug", st === "ineligible" ? "text-oxblood" : "text-ink-soft")}>{e.why}</div>}
                                  {st === "eligible" && e.note && <div className="mt-0.5 text-[11.5px] text-ink-soft">{e.note}</div>}
                                </td>
                                {(e.checks ?? []).map((c) => (
                                  <td key={c.label} title={`${c.label}: ${c.value}`} className="px-1.5 py-2 text-center whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                      <Tick met={c.met} />
                                      <span className={cn("text-[11.5px]", c.met ? "text-ink" : "text-ink-soft")}>{c.short === "Conduct" ? "" : c.value}</span>
                                    </span>
                                  </td>
                                ))}
                                <td className="py-2 pl-2 text-right">
                                  {st === "eligible" ? (
                                    <div className="flex flex-col items-end gap-1">
                                      {e.amount ? <span className="figure text-[14px] text-sage">{money(e.amount)}</span> : null}
                                      {done ? (
                                        <>
                                          <span className="chip border-sage/50 text-sage">
                                            <Check className="size-3" /> Awarded
                                          </span>
                                          {done.note && <span className="max-w-[16rem] text-[11.5px] text-ink-soft">{done.note}</span>}
                                        </>
                                      ) : q.data!.canAward && r.choices?.length && picking?.key === b.key && picking.memberId === e.memberId ? (
                                        <div className="flex w-[15rem] flex-col items-stretch gap-1 text-left">
                                          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Which prize did {e.name.split(" ")[0]} pick?</span>
                                          {r.choices.map((c) => (
                                            <label key={c} className="flex cursor-pointer items-start gap-1.5 text-[12px] leading-snug">
                                              <input
                                                type="radio"
                                                aria-label={c}
                                                className="mt-0.5 accent-[#1c1915]"
                                                name={`prize-${b.key}-${e.memberId}`}
                                                checked={picking.choice === c}
                                                onChange={() => setPicking({ ...picking, choice: c })}
                                              />
                                              {c}
                                            </label>
                                          ))}
                                          <div className="mt-1 flex justify-end gap-2">
                                            <button className="text-[12px] font-semibold text-ink-soft hover:text-ink" onClick={() => setPicking(null)}>
                                              Cancel
                                            </button>
                                            <button
                                              className="btn btn-ink !h-8 !px-3 !text-[12px]"
                                              disabled={award.isPending || !picking.choice}
                                              onClick={() =>
                                                award.mutate(
                                                  { storeId: v.storeId, memberId: e.memberId, reward: b.key, period: e.period ?? b.period.key, amount: e.amount ?? null, note: picking.choice },
                                                  { onSuccess: () => setPicking(null) },
                                                )
                                              }
                                            >
                                              <Award className="size-3.5" /> Award
                                            </button>
                                          </div>
                                        </div>
                                      ) : q.data!.canAward ? (
                                        <button
                                          className="btn btn-ink !h-8 !px-3 !text-[12px]"
                                          disabled={award.isPending}
                                          onClick={() =>
                                            r.choices?.length
                                              ? setPicking({ key: b.key, memberId: e.memberId, choice: "" })
                                              : award.mutate({ storeId: v.storeId, memberId: e.memberId, reward: b.key, period: e.period ?? b.period.key, amount: e.amount ?? null })
                                          }
                                        >
                                          <Award className="size-3.5" /> {r.choices?.length ? "Award a prize" : "Award"}
                                        </button>
                                      ) : (
                                        <span className={cn("chip whitespace-nowrap", STATUS_CHIP.eligible)}>Eligible now</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className={cn("chip whitespace-nowrap", STATUS_CHIP[st])}>{st === "ineligible" ? `Ineligible ${word}` : STATUS_LABEL[st]}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {rows.length > 6 && (
                      <button className="mt-1.5 text-[12px] font-semibold underline" onClick={() => setOpen(open === b.key ? null : b.key)}>
                        {open === b.key ? "Show less" : `Show all ${rows.length}`}
                      </button>
                    )}
                    {b.closed && <div className="mt-2 text-[11.5px] text-ink-soft">{b.period.label} is closed. Each colleague's page shows how this month is going.</div>}
                  </div>
                  {b.awarded.filter((a) => !elig.some((e) => e.memberId === a.memberId)).length > 0 && (
                    <div className="mt-3 text-[12px] text-ink-soft">
                      Also awarded: {b.awarded.filter((a) => !elig.some((e) => e.memberId === a.memberId)).map((a) => a.memberName).join(", ")}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="mt-12">
            <SectionTitle>Awards given</SectionTitle>
            {q.data!.historyLocked ? (
              <LockedNotice what="Awards and payouts">Who was paid what is private.</LockedNotice>
            ) : q.data!.history.length ? (
              <table className="tbl">
                <tbody>
                  {q.data!.history.map((h) => (
                    <tr key={h.id}>
                      <td className="font-semibold">{h.memberName}</td>
                      <td>
                        {L.rewardByKey[h.reward]?.title ?? h.reward}
                        {h.note && <span className="ml-2 text-[12px] text-ink-soft">{h.note}</span>}
                      </td>
                      <td className="text-ink-soft">{h.period}</td>
                      <td className="r">{h.amount ? money(h.amount) : ""}</td>
                      <td className="r text-[12px] text-ink-soft">
                        {h.awardedByName} · {new Date(h.awardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      {q.data!.canAward && (
                        <td className="r">
                          <button aria-label="Undo award" className="text-ink-soft hover:text-oxblood" onClick={() => revoke.mutate({ id: h.id })}>
                            <Undo2 className="size-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No awards recorded yet.</Empty>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
