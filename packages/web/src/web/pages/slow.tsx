import { pctOfTarget } from "../../shared/metrics";
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRightLeft, Moon, Undo2, X } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { RampChip, SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useCloseCall, usePostCall, useSlowBoard, useSlowDecide, useSlowUndo } from "../queries/slow";
import { SHIFT_HOURS, SLOW_ACTIONS, SLOW_PRINCIPLES, COVERS_PER_SERVER, COVERS_PER_BARTENDER, type SlowAction } from "../../shared/slow";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, money2, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Shift = "lunch" | "dinner";
type Board = NonNullable<ReturnType<typeof useSlowBoard>["data"]>;
type Person = Board["floorOrder"][number];

export default function SlowNightPage() {
  const v = useViewer();
  const [shift, setShift] = useState<Shift>("dinner");
  const [expected, setExpected] = useState<number | null>(null);
  const q = useSlowBoard(v.storeId, shift, expected);
  const b = q.data;
  return (
    <Page
      eyebrow={v.store?.name}
      title="Slow night"
      aside={
        <Seg
          value={shift}
          onChange={(s) => {
            setShift(s);
            setExpected(null);
          }}
          options={[
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
          ]}
        />
      }
    >
      <StoreTabs />
      {q.isLoading && !b ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : b ? (
        <>
          <Forecast b={b} expected={expected} setExpected={setExpected} />
          <Calls b={b} shift={shift} />
          <Order title="Servers" list={b.floorOrder} extra={b.extraServers} b={b} shift={shift} />
          {b.barOrder.length > 0 && <Order title="Bar" list={b.barOrder} extra={b.extraBar} b={b} shift={shift} />}
          <Tonight b={b} />
          <Ledger b={b} />
          <Principles />
        </>
      ) : null}
    </Page>
  );
}

function Forecast({ b, expected, setExpected }: { b: Board; expected: number | null; setExpected: (n: number | null) => void }) {
  const onFloor = b.floorOrder.filter((p) => !p.decided).length;
  const onBar = b.barOrder.filter((p) => !p.decided).length;
  return (
    <div className="mb-10 grid gap-8 md:grid-cols-[1.1fr_1fr]">
      <div className="rounded-[2px] border-2 border-ink p-6">
        <div className="eyebrow mb-2 flex items-center gap-2">
          <Moon className="size-3.5" /> {shortDay(b.today)} {b.shift} · {b.lineupStarted ? "from tonight's line-up" : "from the selling roster"}
        </div>
        <div className="font-display text-[26px] leading-tight md:text-[30px]">
          {b.needServers > onFloor ? (
            <>
              Tonight needs <span className="figure">{b.needServers}</span> servers and you have <span className="figure">{onFloor}</span>.{" "}
              <span className="text-oxblood">You're {b.needServers - onFloor} short.</span> Post a call for cover below and don't send anyone home.
            </>
          ) : b.extraServers + b.extraBar > 0 ? (
            <>
              Tonight needs <span className="figure">{b.needServers}</span> server{b.needServers === 1 ? "" : "s"} and{" "}
              <span className="figure">{b.needBar}</span> on bar. You have <span className="figure">{onFloor}</span> and{" "}
              <span className="figure">{onBar}</span>, so <span className="text-oxblood">{b.extraServers + b.extraBar}</span> could be redeployed or go home.
            </>
          ) : (
            <>Tonight is staffed right. Nobody needs to lose hours.</>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="label">Expected covers</span>
            <input
              aria-label="Expected covers"
              type="number"
              min={0}
              max={2000}
              className="field !w-32"
              value={expected ?? b.expected}
              onChange={(e) => setExpected(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
            />
          </label>
          <div className="pb-2 text-[12.5px] text-ink-soft">
            {b.forecast != null ? (
              <>
                Forecast <span className="figure text-ink">{b.forecast}</span> from {b.forecastFrom.length} same weekday{b.forecastFrom.length === 1 ? "" : "s"} (
                {b.forecastFrom.map(shortDay).join(", ")}). Change it if the book says otherwise.
              </>
            ) : (
              "No history for this weekday yet. Enter what the book shows."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            {b.forecast != null && b.forecast > 40 && (
              <>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">What if</span>
                {[0.5, 0.7].map((f) => {
                  const n = Math.round(b.forecast! * f);
                  return (
                    <button key={f} className={cn("chip !px-3 !py-1 !text-[12px]", expected === n ? "!border-ink bg-ink !text-paper" : "hover:!border-ink")} onClick={() => setExpected(n)}>
                      {n} covers
                    </button>
                  );
                })}
              </>
            )}
            {expected != null && (
              <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setExpected(null)}>
                Use forecast
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-soft">
          One server carries about {COVERS_PER_SERVER} covers well; one bartender about {COVERS_PER_BARTENDER} bar guests (we assume 14% of covers sit at or order from the bar).
          We always keep at least one of each.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6 self-start">
        <Stat label="Hours protected" value={`${b.protectedHours}h`} tone="good" sub="Sister stores, outreach, training · 4 weeks" />
        <Stat label="Hours sent home" value={`${b.cutHours}h`} tone="bad" sub="Volunteered or cut · 4 weeks" />
        <Stat
          label="Who stays, vs own target"
          value={pctOfTarget(b.keepAvg)}
          tone="gold"
          sub={b.allAvg != null ? `The ${b.keepCount} who stay vs ${pctOfTarget(b.allAvg)} for the whole floor` : "Needs shift reports"}
        />
        <Stat
          label="Worth tonight"
          value={b.liftPerTicket ? money2(b.liftPerTicket * b.expected) : "·"}
          sub={
            b.liftPerTicket
              ? `Extra sales from putting tables with your best sellers, priced at tonight's ${money2(b.tonightTarget)} target`
              : "Nobody goes home tonight, so the whole floor works the book"
          }
        />
      </div>
    </div>
  );
}

function Calls({ b, shift }: { b: Board; shift: Shift }) {
  const post = usePostCall();
  const close = useCloseCall();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ role: "server", hours: SHIFT_HOURS, note: "" });
  const incoming = b.calls.filter((c) => c.status === "open");
  if (!incoming.length && !b.myCalls.length && !open)
    return (
      <div className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border rule px-5 py-4 text-[13px]">
        <span className="text-ink-soft">No sister store has asked for cover this week. Short tonight? Ask the group.</span>
        <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setOpen(true)}>
          Ask sister stores for cover
        </button>
      </div>
    );
  return (
    <div className="mb-10 grid gap-6 md:grid-cols-2">
      <div>
        <SectionTitle>Sister stores need cover</SectionTitle>
        {incoming.length ? (
          <div className="space-y-2">
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-[2px] border border-sage/50 bg-sage/5 px-4 py-3 text-[13px]">
                <div>
                  <div className="font-semibold">
                    {c.storeName} · {ROLE_LABEL[c.role] ?? c.role} · {c.hours}h
                  </div>
                  <div className="text-ink-soft">
                    {shortDay(c.businessDate)} {c.shift} · posted by {c.postedByName}
                    {c.note && ` · ${c.note}`}
                  </div>
                </div>
                <ArrowRightLeft className="size-4 shrink-0 text-sage" />
              </div>
            ))}
            <div className="text-[12px] text-ink-soft">Send someone with the Sister store option below. Their hours stay in the group.</div>
          </div>
        ) : (
          <Empty>No open requests from other stores.</Empty>
        )}
      </div>
      <div>
        <SectionTitle
          aside={
            !open && (
              <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setOpen(true)}>
                Ask for cover
              </button>
            )
          }
        >
          Your requests
        </SectionTitle>
        {open && (
          <form
            className="mb-3 grid grid-cols-[1fr_90px] gap-3 rounded-[2px] border-2 border-ink p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await post.mutateAsync({ storeId: b.store.id, shift, ...f }).catch(() => null);
              if (r) setOpen(false);
            }}
          >
            <select aria-label="Role needed" className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {["server", "bartender", "host", "busser", "food_runner", "sommelier"].map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <input aria-label="Hours" type="number" min={1} max={12} className="field" value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} />
            <input aria-label="Note" className="field col-span-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Private party of 30, need a section from 6" />
            {post.error && <div className="col-span-2 text-[12px] text-oxblood">{errMsg(post.error)}</div>}
            <div className="col-span-2 flex gap-2">
              <button className="btn btn-ink !h-9" disabled={post.isPending}>
                Post to the group
              </button>
              <button type="button" className="btn btn-line !h-9" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {b.myCalls.length ? (
          <div className="space-y-2">
            {b.myCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-[2px] border rule px-4 py-3 text-[13px]">
                <div>
                  <div className="font-semibold">
                    {ROLE_LABEL[c.role] ?? c.role} · {c.hours}h · {shortDay(c.businessDate)} {c.shift}
                  </div>
                  <div className="text-ink-soft">{c.status === "filled" ? `Covered by ${c.filledByName}` : "Waiting for a sister store"}</div>
                </div>
                <button aria-label="Withdraw request" className="btn btn-line !h-8 !px-2" onClick={() => close.mutate({ id: c.id })}>
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !open && <Empty>You haven't asked for cover.</Empty>
        )}
      </div>
    </div>
  );
}

function Order({ title, list, extra, b, shift }: { title: string; list: Person[]; extra: number; b: Board; shift: Shift }) {
  return (
    <div className="mb-10">
      <SectionTitle aside={<span className="text-[12px] text-ink-soft">{extra ? `First ${extra} in line, if you need to` : "Everyone needed tonight"}</span>}>
        {title} · who goes first
      </SectionTitle>
      {list.length ? (
        <div className="divide-y divide-paper-line border-y rule">
          {list.map((p, i) => (
            <PersonRow key={p.id} p={p} rank={i + 1} suggested={i < extra} b={b} shift={shift} />
          ))}
        </div>
      ) : (
        <Empty>Nobody on tonight.</Empty>
      )}
    </div>
  );
}

function PersonRow({ p, rank, suggested, b, shift }: { p: Person; rank: number; suggested: boolean; b: Board; shift: Shift }) {
  const decide = useSlowDecide();
  const undo = useSlowUndo();
  const [open, setOpen] = useState(false);
  const calls = b.calls.filter((c) => c.status === "open" && c.businessDate === b.today && c.shift === shift && (c.role === p.role || (p.role === "sommelier" && c.role === "server")));
  const [action, setAction] = useState<SlowAction>(calls.length && (p.crossStore || !p.volunteerEarly) ? "sister_store" : "voluntary_out");
  const [hours, setHours] = useState(SHIFT_HOURS);
  const [callId, setCallId] = useState<string>("");
  const [detail, setDetail] = useState("");
  const chosenCall = callId || calls[0]?.id || "";
  return (
    <div className={cn("px-1 py-4", suggested && !p.decided && "bg-gold/[0.07]")}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="figure w-6 pt-0.5 text-[18px] text-ink-soft">{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/team/${p.id}`} className="text-[14.5px] font-semibold hover:underline">
              {p.name}
            </Link>
            <span className="text-[12px] text-ink-soft">{ROLE_LABEL[p.role]}</span>
            <RampChip days={p.tenureDays} />
            {p.volunteerEarly && <span className="chip border-sage/50 text-sage">Happy to go early</span>}
            {p.crossStore && <span className="chip border-paper-line text-ink-soft">Will work other stores</span>}
            {suggested && !p.decided && <span className="chip border-gold-deep/60 text-gold-deep">Suggested</span>}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-soft">{p.reasons.join(" · ")}</div>
        </div>
        <div className="grid grid-cols-3 gap-5 text-right text-[12px]">
          <div>
            <div className="figure text-[15px] text-ink">
              {p.weekHours}/{p.goal}h
            </div>
            this week
          </div>
          <div>
            <div className="figure text-[15px] text-ink">{pctOfTarget(p.vs)}</div>
            {p.spt != null ? `${money2(p.spt)} vs ${money2(p.target ?? 0)}` : "of own target"}
          </div>
          <div>
            <div className="figure text-[15px] text-ink">{p.lost28}h</div>
            lost · 4 wks
          </div>
        </div>
        <div className="w-full shrink-0 md:w-auto">
          {p.decided ? (
            <div className="flex items-center gap-2">
              <span className={cn("chip", SLOW_ACTIONS[p.decided.action].keepsPay ? "border-sage/50 text-sage" : "border-oxblood/40 text-oxblood")}>
                {SLOW_ACTIONS[p.decided.action].short} · {p.decided.hours}h{p.decided.toStoreName && ` · ${p.decided.toStoreName}`}
              </span>
              <button aria-label={`Undo ${p.name}`} className="btn btn-line !h-8 !px-2" onClick={() => undo.mutate({ id: p.decided!.id })} disabled={undo.isPending}>
                <Undo2 className="size-3.5" />
              </button>
            </div>
          ) : (
            !open && (
              <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setOpen(true)}>
                Decide
              </button>
            )
          )}
        </div>
      </div>
      {open && !p.decided && (
        <form
          className="ml-10 mt-3 rounded-[2px] border-2 border-ink p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await decide
              .mutateAsync({ storeId: b.store.id, shift, memberId: p.id, action, hours, callId: action === "sister_store" ? chosenCall || null : null, detail })
              .catch(() => null);
            if (r) setOpen(false);
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SLOW_ACTIONS) as SlowAction[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setAction(k)}
                className={cn(
                  "chip !px-3 !py-1 !text-[12px]",
                  action === k ? "!border-ink bg-ink !text-paper" : "hover:!border-ink",
                  k === "sister_store" && !calls.length && "opacity-40",
                )}
                disabled={k === "sister_store" && !calls.length}
              >
                {SLOW_ACTIONS[k].short}
                {SLOW_ACTIONS[k].keepsPay ? " · keeps pay" : ""}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[12px] text-ink-soft">{SLOW_ACTIONS[action].label}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-[100px_1fr_1fr]">
            <label className="block">
              <span className="label">Hours</span>
              <input aria-label="Hours" type="number" min={0.5} max={12} step={0.5} className="field" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
            </label>
            {action === "sister_store" && (
              <label className="block">
                <span className="label">Covering</span>
                <select aria-label="Sister store shift" className="field" value={chosenCall} onChange={(e) => setCallId(e.target.value)}>
                  {calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.storeName} · {c.shift} · {c.hours}h
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={cn("block", action !== "sister_store" && "md:col-span-2")}>
              <span className="label">Note (optional)</span>
              <input
                aria-label="Note"
                className="field"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={action === "outreach" ? "Calling Saturday no-shows and December party leads" : ""}
              />
            </label>
          </div>
          {!SLOW_ACTIONS[action].keepsPay && p.surplus < 0 && (
            <div className="mt-3 text-[12px] text-oxblood">
              {p.name.split(" ")[0]} is {-p.surplus}h short of their weekly goal. Check the sister stores or ask for a volunteer first.
            </div>
          )}
          {decide.error && <div className="mt-2 text-[12px] text-oxblood">{errMsg(decide.error)}</div>}
          <div className="mt-3 flex gap-2">
            <button className="btn btn-ink !h-9" disabled={decide.isPending || (action === "sister_store" && !chosenCall)}>
              Record
            </button>
            <button type="button" className="btn btn-line !h-9" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Tonight({ b }: { b: Board }) {
  const undo = useSlowUndo();
  if (!b.tonight.length) return null;
  return (
    <div className="mb-10">
      <SectionTitle>Decided tonight</SectionTitle>
      <div className="space-y-2">
        {b.tonight.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-[2px] border rule px-4 py-3 text-[13px]">
            <div>
              <span className="font-semibold">{a.memberName}</span> · {SLOW_ACTIONS[a.action].label} · {a.hours}h{a.toStoreName && ` at ${a.toStoreName}`}
              <div className="text-[12px] text-ink-soft">
                Decided by {a.decidedByName}
                {a.detail && ` · ${a.detail}`}
              </div>
            </div>
            <button aria-label={`Undo ${a.memberName}`} className="btn btn-line !h-8 !px-2" onClick={() => undo.mutate({ id: a.id })}>
              <Undo2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ledger({ b }: { b: Board }) {
  return (
    <div className="mb-10">
      <SectionTitle aside={<span className="text-[12px] text-ink-soft">Last 4 weeks · so it isn't always the same person</span>}>Fairness ledger</SectionTitle>
      {b.ledger.length ? (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] uppercase tracking-wider text-ink-soft">
              <th className="py-2 font-bold">Name</th>
              <th className="py-2 font-bold">Role</th>
              <th className="py-2 text-right font-bold">Hours sent home</th>
              <th className="py-2 text-right font-bold">Hours kept another way</th>
            </tr>
          </thead>
          <tbody>
            {b.ledger.map((l) => (
              <tr key={l.id} className="border-b rule">
                <td className="py-2.5">
                  <Link href={`/team/${l.id}`} className="font-semibold hover:underline">
                    {l.name}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-soft">{ROLE_LABEL[l.role]}</td>
                <td className={cn("figure py-2.5 text-right", l.lost > 12 && "text-oxblood")}>{l.lost}h</td>
                <td className="figure py-2.5 text-right text-sage">{l.kept}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>Nobody has lost or moved hours in the last four weeks.</Empty>
      )}
    </div>
  );
}

function Principles() {
  return (
    <div>
      <SectionTitle>How we handle a slow night</SectionTitle>
      <ol className="grid gap-5 md:grid-cols-2">
        {SLOW_PRINCIPLES.map((x, i) => (
          <li key={x.h} className="flex gap-4">
            <span className="figure text-[22px] text-gold-deep">{i + 1}</span>
            <div>
              <div className="text-[14px] font-semibold">{x.h}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{x.p}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
