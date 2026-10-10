import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Printer } from "lucide-react";
import { Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Delta, Empty, Seg, Spark, Stat } from "../components/bits";
import { HowCalculated } from "../components/how";
import { Monogram } from "../components/monogram";
import { useRange } from "../queries/reports";
import { LastYearLine } from "../components/last-year";
import { money, money2, num, pct, shortDay } from "../lib/format";
import { ROLE_LABEL } from "../../shared/domain";
import { MIX_RULE, pctOfTarget } from "../../shared/metrics";
import { cn } from "../lib/utils";
import { motion } from "motion/react";

export default function ReportsPage() {
  const v = useViewer();
  const [days, setDays] = useState(30);
  const urlStore = new URLSearchParams(window.location.search).get("store");
  useEffect(() => {
    if (urlStore && v.isLeader && v.scope !== urlStore && v.me.stores.some((s) => s.id === urlStore)) v.setScope(urlStore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStore]);
  const scopeId = v.isLeader ? v.scope : v.storeId;
  const q = useRange(scopeId, days);
  const r = q.data;
  const title = v.isLeader && !v.scope ? "Combined report" : "Store report";
  const scopeName = v.isLeader && !v.scope ? `${v.me.orgName} · all ${v.me.stores.length} stores` : `${v.store?.name} · Store ${v.store?.number}`;
  const [lbRole, setLbRole] = useState<"floor" | "bar" | "all">("floor");

  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="sheet px-5 py-7 md:px-10 md:py-10">
      {/* Report header */}
      <div className="relative mb-8 flex flex-wrap items-center justify-between gap-5 border-b-2 border-ink pb-6">
        <div className="flex items-center gap-5">
          <div className="grid size-[74px] place-items-center rounded-full bg-noir">
            <Monogram size={50} />
          </div>
          <div>
            <div className="eyebrow mb-1">{scopeName}</div>
            <h1 className="font-display text-[34px] leading-none md:text-[44px]">{title}</h1>
            {r && (
              <div className="mt-2 text-[12.5px] text-ink-soft">
                {shortDay(r.from)} – {shortDay(r.to)} · {r.days} nights · compared with the {r.days} before
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {v.isLeader && v.me.stores.length > 1 && (
            <select aria-label="Select" className="field !h-9 !w-auto" value={v.scope ?? "all"} onChange={(e) => v.setScope(e.target.value === "all" ? null : e.target.value)}>
              <option value="all">All stores combined</option>
              {v.me.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Seg
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7d" },
              { value: 30, label: "30d" },
              { value: 90, label: "90d" },
            ]}
          />
          <button onClick={() => window.print()} className="btn btn-line !h-9">
            <Printer className="size-4" /> Print
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !r || !r.totals.nights ? (
        <Empty>No shift reports in this range yet.</Empty>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b rule pb-9 lg:grid-cols-5">
            <Stat label={<>Net sales <HowCalculated metric="netSales" period={`${r.from} to ${r.to}`} /></>} value={money(r.totals.sales)} sub={r.comparable ? <Delta cur={r.totals.sales} prev={r.previous.sales} /> : <span className="text-ink-soft">No full prior period</span>} />
            <Stat label="Covers" value={num(r.totals.covers)} sub={r.comparable ? <Delta cur={r.totals.covers} prev={r.previous.covers} /> : <span className="text-ink-soft">No full prior period</span>} />
            <Stat
              label={<>Spend per ticket <HowCalculated metric="spendPerTicket" period={`${r.from} to ${r.to}`} /></>}
              value={money2(r.totals.spt)}
              tone={r.totals.spt >= r.totals.ticketTarget ? "good" : "bad"}
              sub={
                <>
                  Mix target {money2(r.totals.ticketTarget)} · {num(r.totals.checks)} tickets {r.comparable && (
                    <>
                      {" · "}
                      <Delta cur={r.totals.spt} prev={r.previous.spt} fmt={(x) => money2(x)} />
                    </>
                  )}
                </>
              }
            />
            <Stat
              label={<>On time checklist completion <HowCalculated metric="onTime" period={`${r.from} to ${r.to}`} /></>}
              value={pct(r.totals.compliance.rate)}
              tone={(r.totals.compliance.rate ?? 0) >= 0.9 ? "good" : "bad"}
              sub={`${r.totals.compliance.onTime} of ${r.totals.compliance.expected} expected on time`}
            />
            <Stat label="Comps, voids, discounts" value={pct(r.totals.leakageRate, 1)} sub={`${money(r.totals.comps + r.totals.voids + r.totals.discounts)} of sales`} />
          </div>
          {r.lastYear && (
            <div className="border-b rule py-4">
              <LastYearLine c={r.lastYear} />
            </div>
          )}

          <div className="grid gap-10 py-9 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="eyebrow">Sales by night</div>
                <div className="text-[11.5px] text-ink-soft">{r.series.length} nights</div>
              </div>
              <SalesBars series={r.series} />
              <div className="mb-2 mt-8 flex items-baseline justify-between">
                <div className="eyebrow">Spend per ticket by night</div>
                <div className="text-[11.5px] text-ink-soft">dashed = mix target</div>
              </div>
              <Spark data={r.series.map((s) => s.spt)} target={r.totals.ticketTarget} height={70} />
            </div>
            <div>
              <div className="eyebrow mb-3">Server spend per ticket <HowCalculated metric="serverSpend" period={`${r.from} to ${r.to}`} /></div>
              {r.gap ? (
                <div className="rounded-[2px] bg-noir p-6 text-ivory">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold">Top two</div>
                      <div className="figure text-[30px]">{pctOfTarget(r.gap.topVs)}</div>
                      <div className="text-[11px] text-[#8f877b]">of own target · {money2(r.gap.topSpt)} a ticket</div>
                      <div className="text-[11.5px] text-[#b9b0a3]">{r.gap.top.map((p) => p.name).join(" · ")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold">Priority coaching</div>
                      <div className="figure text-[30px]">{pctOfTarget(r.gap.bottomVs)}</div>
                      <div className="text-[11px] text-[#8f877b]">of own target · {money2(r.gap.bottomSpt)} a ticket</div>
                      <div className="text-[11.5px] text-[#b9b0a3]">{r.gap.bottom.map((p) => p.name).join(" · ")}</div>
                    </div>
                  </div>
                  <div className="mt-5 border-t border-noir-line pt-4 text-[13px] text-[#b9b0a3]">
                    A <span className="font-semibold text-gold">{money2(r.gap.gap)}</span> gap per ticket: {Math.max(0, Math.round((r.gap.topVs - r.gap.bottomVs) * 100))} points of target between the two pairs, priced at the priority pair's own mix target of {money2(r.gap.bottomTarget)}. Modeled annual sales opportunity if half is closed:{" "}
                    <span className="figure text-[20px] text-gold">{money(r.gap.annualHalfGap)}</span>
                    <HowCalculated metric="opportunity" dark />
                    <div className="mt-1 text-[11px] text-[#8f877b]">
                      Ranked on percentage of own target, so lunch, dinner, part and full time compare fairly. Not verified loss or guaranteed improvement. {r.gap.ramping.length > 0 && <>Ramping, not ranked: {r.gap.ramping.map((p) => `${p.name} (day ${p.tenureDays})`).join(", ")}.</>}
                    </div>
                  </div>
                </div>
              ) : (
                <Empty>Need four servers with three or more shifts and 30+ days tenure to compare.</Empty>
              )}
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <Mini label="On time" value={r.totals.compliance.onTime} tone="text-sage" />
                <Mini label="Late" value={r.totals.compliance.late} tone="text-gold-deep" />
                <Mini label="Missed" value={r.totals.compliance.missed} tone="text-oxblood" />
              </div>
            </div>
          </div>

          {r.stores.length > 1 && (
            <div className="border-t rule py-9">
              <div className="eyebrow mb-3">Store by store</div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-paper">Store</th>
                      <th className="r">Net sales</th>
                      <th className="r">Tickets</th>
                      <th className="r">Spend / ticket</th>
                      <th className="r">Mix target</th>
                      <th className="r">vs mix</th>
                      <th className="r">Gap / ticket</th>
                      <th className="r">Modeled opportunity / yr</th>
                      <th className="r">Leakage</th>
                      <th className="r">On time completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.stores.map((s) => (
                      <tr key={s.id}>
                        <td className="sticky left-0 z-10 bg-paper">
                          <button onClick={() => v.setScope(s.id)} className="font-semibold hover:underline">
                            {s.name}
                          </button>
                        </td>
                        <td className="r figure text-[16px]">{money(s.sales)}</td>
                        <td className="r">{num(s.checks)}</td>
                        <td className={cn("r font-semibold", s.spt >= s.ticketTarget ? "text-sage" : "text-oxblood")}>{money2(s.spt)}</td>
                        <td className="r text-ink-soft">
                          {money2(s.ticketTarget)}
                          {Math.abs(s.ticketTarget - s.headlineTarget) >= 0.01 && <div className="text-[10.5px]">headline {money2(s.headlineTarget)}</div>}
                        </td>
                        <td className={cn("r font-semibold", s.vs == null ? "text-ink-soft" : s.vs >= 1 ? "text-sage" : "text-oxblood")}>{pctOfTarget(s.vs)}</td>
                        <td className="r">{s.gap ? money2(s.gap.gap) : "·"}</td>
                        <td className="r">{s.gap ? money(s.gap.annualHalfGap) : "·"}</td>
                        <td className="r">{pct(s.leakageRate, 1)}</td>
                        <td className="r">
                          <div className="ml-auto flex w-28 items-center gap-2">
                            <Bar value={s.compliance.rate ?? 0} max={1} tone={(s.compliance.rate ?? 0) >= 0.9 ? "gold" : "bad"} />
                            <span className="w-9 text-right">{pct(s.compliance.rate)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="border-t rule py-9">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div className="eyebrow">Leaderboard · spend per ticket vs own target</div>
              <Seg
                value={lbRole}
                onChange={setLbRole}
                options={[
                  { value: "floor", label: "Servers & somms" },
                  { value: "bar", label: "Bar" },
                  { value: "all", label: "Everyone" },
                ]}
              />
            </div>
            <p className="mb-3 max-w-3xl text-[12.5px] text-ink-soft">{MIX_RULE}</p>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Name</th>
                    {r.combined && <th>Store</th>}
                    <th className="r">Shifts</th>
                    <th className="r">Tickets</th>
                    <th className="r">Sales</th>
                    <th className="r">Spend / ticket</th>
                    <th className="r">Own target</th>
                    <th className="r">vs own target</th>
                    <th className="r">Wine / 100</th>
                    <th className="r">Dessert attach</th>
                  </tr>
                </thead>
                <tbody>
                  {r.leaderboard
                    .filter((p) => (lbRole === "all" ? true : lbRole === "bar" ? p.role === "bartender" : p.role === "server" || p.role === "sommelier"))
                    .sort((a, b) => Number(a.ramping) - Number(b.ramping) || (b.vs ?? 0) - (a.vs ?? 0) || b.spt - a.spt)
                    .map((p, _i, arr) => {
                      const rank = p.ramping ? null : arr.filter((x) => !x.ramping).indexOf(p) + 1;
                      const tgt = p.target ?? r.stores.find((s) => s.id === p.storeId)?.ticketTarget ?? r.totals.ticketTarget;
                      const judged = p.role !== "bartender" && !p.ramping;
                      return (
                        <tr key={p.key}>
                          <td className="figure text-[16px] text-gold-deep">{rank ?? <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">New</span>}</td>
                          <td>
                            {p.memberId ? (
                              <Link href={`/team/${p.memberId}`} className="font-semibold hover:underline">
                                {p.name}
                              </Link>
                            ) : (
                              p.name
                            )}
                            <span className="ml-2 text-[11.5px] text-ink-soft">{ROLE_LABEL[p.role]}</span>
                            {p.ramping && <span className="ml-2 chip">Ramping · day {p.tenureDays}</span>}
                          </td>
                          {r.combined && <td className="text-ink-soft">{p.storeName}</td>}
                          <td className="r">{p.shifts}</td>
                          <td className="r">{num(p.checks)}</td>
                          <td className="r">{money(p.sales)}</td>
                          <td className="r">{money2(p.spt)}</td>
                          <td className="r text-ink-soft">{money2(tgt)}</td>
                          <td className={cn("r font-semibold", judged && ((p.vs ?? 0) >= 1 ? "text-sage" : "text-oxblood"))}>{pctOfTarget(p.vs)}</td>
                          <td className="r">{p.winePer100.toFixed(1)}</td>
                          <td className="r">{pct(p.dessertAttach)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between border-t-2 border-ink pt-4 text-[11px] text-ink-soft">
            <span>The Platform · Bottom Line Multiplied</span>
            <span>{v.me.isDemo ? "Demo data · illustrative" : "From signed shift reports and checklists"}</span>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[2px] border rule py-3">
      <div className={cn("figure text-[26px] leading-none", tone)}>{value}</div>
      <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</div>
    </div>
  );
}

function SalesBars({ series }: { series: { date: string; sales: number }[] }) {
  const max = Math.max(...series.map((s) => s.sales), 1);
  return (
    <div className="flex h-36 items-end gap-[2px]">
      {series.map((s) => {
        const d = new Date(`${s.date}T12:00:00Z`).getUTCDay();
        const weekend = d === 5 || d === 6;
        return (
          <div key={s.date} className="group relative flex-1" style={{ height: `${(s.sales / max) * 100}%` }}>
            <div className={cn("h-full w-full", weekend ? "bg-gold" : "bg-ink/85")} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-noir px-2 py-1 text-[11px] text-ivory group-hover:block">
              {shortDay(s.date)} · {money(s.sales)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
