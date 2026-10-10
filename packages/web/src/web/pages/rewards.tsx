import { useState } from "react";
import { Link } from "wouter";
import { Award, Check, Undo2 } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useAwardReward, useRevokeReward, useRewards } from "../queries/rewards";
import { REWARD_BY_KEY } from "../../shared/library/rewards";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, money } from "../lib/format";
import { cn } from "../lib/utils";

export default function RewardsPage() {
  const v = useViewer();
  const q = useRewards(v.storeId);
  const award = useAwardReward();
  const revoke = useRevokeReward();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Page eyebrow={`${v.store?.name} · Recognition & rewards`} title="The eight rewards">
      <StoreTabs />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <p className="-mt-2 mb-8 max-w-[70ch] text-[13.5px] text-ink-soft">
            Eligibility is worked out from the platform's own numbers: spend per ticket from shift reports, floor grades, sign-offs, guest quotes and conduct. Target{" "}
            {money(q.data!.store.ticketTarget)} spend per ticket (bartenders 40% of that). A manager records the award when it's given.
          </p>
          {award.error && <div className="mb-4 text-[13px] text-oxblood">{errMsg(award.error)}</div>}
          <div className="grid gap-5 lg:grid-cols-2">
            {q.data!.boards.map((b) => {
              const r = REWARD_BY_KEY[b.key];
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
                                onClick={() => award.mutate({ storeId: v.storeId, memberId: e.memberId, reward: b.key, period: b.period.key, amount: e.amount ?? null })}
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
                        <div key={e.memberId} className="flex justify-between py-1 text-[12.5px] text-ink-soft">
                          <span>{e.name}</span>
                          <span>{e.metric}</span>
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
                      <td>{REWARD_BY_KEY[h.reward as keyof typeof REWARD_BY_KEY]?.title}</td>
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
