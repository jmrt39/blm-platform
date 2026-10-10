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

import { ROLE_LABEL } from "../../shared/domain";
import { BONUS_RULE, CONDUCT_BLOCK_RULE, PAYOUT_RULE } from "../../shared/metrics";
import { errMsg, money } from "../lib/format";
import { cn } from "../lib/utils";

const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export default function RewardsPage() {
  const v = useViewer();
  const q = useRewards(v.storeId);
  const award = useAwardReward();
  const revoke = useRevokeReward();
  const [open, setOpen] = useState<string | null>(null);
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
              {money(q.data!.store.ticketTarget)} spend per ticket (bartenders 40% of that). A manager records the award when it's given.
            </p>
            <p>
              <span className="font-semibold text-ink">Cash.</span> {BONUS_RULE} {PAYOUT_RULE}
            </p>
            <p>
              <span className="font-semibold text-ink">Conduct.</span> {CONDUCT_BLOCK_RULE}
            </p>
          </div>
          {award.error && <div className="mb-4 text-[13px] text-oxblood">{errMsg(award.error)}</div>}
          <div className="grid gap-5 lg:grid-cols-2">
            {q.data!.boards.map((b) => {
              const r = L.rewardByKey[b.key];
              if (!r) return null;
              const elig = b.entries.filter((e) => e.eligible);
              const others = b.entries.filter((e) => !e.eligible).slice(0, open === b.key ? 20 : 3);
              return (
                <section key={b.key} className="rounded-[2px] border rule p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="eyebrow mb-1">
                        {r.n} · {r.cadence} · {b.period.label}
                      </div>
                      <h2 className="font-display text-[23px] leading-tight">{r.title}</h2>
                      <div className="mt-1 text-[12.5px] text-ink-soft">{r.rule}</div>
                      {b.basis && <div className="mt-1 text-[11.5px] text-ink-soft/80">{b.basis}</div>}
                    </div>
                    <span className="chip shrink-0 border-gold-deep/60 text-gold-deep">{r.value}</span>
                  </div>
                  <div className="mt-4">
                    {elig.length === 0 && <div className="py-2 text-[13px] text-ink-soft">Nobody qualifies yet this period.</div>}
                    {elig.map((e) => {
                      const done = b.awarded.find((a) => a.memberId === e.memberId);
                      const mine = q.data!.meId === e.memberId;
                      return (
                        <div key={e.memberId} className={cn("flex items-center justify-between gap-3 border-b rule py-2.5 last:border-0", mine && "bg-gold/10 px-2")}>
                          <div className="min-w-0">
                            <Link href={`/team/${e.memberId}`} className="text-[14px] font-semibold hover:underline">
                              {e.name}
                            </Link>
                            <span className="ml-2 text-[11.5px] text-ink-soft">{ROLE_LABEL[e.role]}</span>
                            <div className="text-[12px] text-ink-soft">{e.metric}</div>
                            {e.note && <div className="text-[11.5px] text-ink-soft/80">{e.note}</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {e.amount ? <span className="figure text-[15px] text-sage">{money(e.amount)}</span> : null}
                            {done ? (
                              <span className="chip border-sage/50 text-sage">
                                <Check className="size-3" /> Awarded
                              </span>
                            ) : q.data!.canAward ? (
                              <button
                                className="btn btn-ink !h-8 !px-3 !text-[12px]"
                                disabled={award.isPending}
                                onClick={() => award.mutate({ storeId: v.storeId, memberId: e.memberId, reward: b.key, period: e.period ?? b.period.key, amount: e.amount ?? null })}
                              >
                                <Award className="size-3.5" /> Award
                              </button>
                            ) : (
                              <span className="chip border-gold-deep/60 text-gold-deep">Eligible</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {others.length > 0 && (
                    <div className="mt-3 border-t rule pt-3">
                      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Close behind</div>
                      {others.map((e) => (
                        <div key={e.memberId} className="flex justify-between gap-3 py-1 text-[12.5px] text-ink-soft">
                          <span className="min-w-0">
                            {e.name}
                            {e.blocked && <span className="ml-2 chip !border-oxblood/40 !py-0 !text-[10.5px] !text-oxblood">Held back</span>}
                            {e.note && <span className="block text-[11.5px] text-ink-soft/80">{e.note}</span>}
                          </span>
                          <span className="shrink-0 text-right">{e.metric}</span>
                        </div>
                      ))}
                      {b.entries.filter((e) => !e.eligible).length > 3 && (
                        <button className="mt-1 text-[12px] font-semibold underline" onClick={() => setOpen(open === b.key ? null : b.key)}>
                          {open === b.key ? "Show less" : "Show everyone"}
                        </button>
                      )}
                    </div>
                  )}
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
            {q.data!.history.length ? (
              <table className="tbl">
                <tbody>
                  {q.data!.history.map((h) => (
                    <tr key={h.id}>
                      <td className="font-semibold">{h.memberName}</td>
                      <td>{L.rewardByKey[h.reward]?.title ?? h.reward}</td>
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
