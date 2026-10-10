import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "motion/react";
import { Check, FileSignature, ImageUp, Megaphone, Repeat, ShieldAlert } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { ActionStatus, ConductSection, EventRow, RatingFigure, SigField, StepChip, StrikeDots, SwapStatus } from "../components/conduct-bits";
import { useAcknowledge, useConductOverview, useReviewSwap, useSubmitSwap } from "../queries/conduct";
import { useTeam } from "../queries/team";
import { DEFAULT_CALL, EVENT_LABEL, STEP_LABEL, STRIKE_WINDOW_DAYS, SWAP_RULE, clock12, ratingLabel, type Shift } from "../../shared/conduct";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Overview = NonNullable<NonNullable<ReturnType<typeof useConductOverview>["data"]>>;

export default function ConductPage() {
  const v = useViewer();
  if (!v.isManager)
    return (
      <Page
        eyebrow={`${v.store?.name} · Store ${v.store?.number}`}
        title="My record"
        aside={
          <Link href="/conduct/swap" className="btn btn-ink">
            <Repeat className="size-4" /> Request a shift swap
          </Link>
        }
      >
        {v.me.member ? <ConductSection memberId={v.me.member.id} /> : <Empty>No record.</Empty>}
      </Page>
    );
  return <ManagerConduct />;
}

function ManagerConduct() {
  const v = useViewer();
  const scope = v.isLeader ? v.scope : v.storeId;
  const q = useConductOverview(scope);
  const [filter, setFilter] = useState<"all" | "strikes" | "step">("all");
  const d = q.data;
  const storeName = (id: string) => d?.stores.find((s) => s.id === id)?.name ?? "";
  const combined = v.isLeader && !v.scope;
  return (
    <Page
      eyebrow={combined ? "All stores, combined" : `${v.store?.name} · Store ${v.store?.number}`}
      title="Conduct & discipline"
      aside={
        <>
          {!combined && (
            <Link href="/lineup" className="btn btn-ink">
              <Megaphone className="size-4" /> Run line-up
            </Link>
          )}
          <Link href="/conduct/swap" className="btn btn-line">
            <Repeat className="size-4" /> Log a swap
          </Link>
        </>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error || !d ? (
        <ErrorNote error={q.error} />
      ) : (
        <div className="space-y-12">
          <div className="grid grid-cols-2 gap-6 border-b rule pb-8 md:grid-cols-6">
            <Stat label={`Strikes · ${STRIKE_WINDOW_DAYS} days`} value={d.totals.strikes} />
            <Stat label="Late" value={d.totals.late} tone={d.totals.late ? "bad" : undefined} />
            <Stat label="Dress code" value={d.totals.dress} tone={d.totals.dress ? "bad" : undefined} />
            <Stat label="No shows" value={d.totals.noShow} tone={d.totals.noShow ? "bad" : undefined} />
            <Stat label="Swap protocol" value={d.totals.swap} tone={d.totals.swap ? "bad" : undefined} />
            <Stat label="On a step" value={d.totals.atStep} sub="verbal or higher" tone="gold" />
          </div>

          <Attention d={d} combined={combined} storeName={storeName} />

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Everyone · rating & standing</div>
              <Seg
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `Everyone · ${d.people.length}` },
                  { value: "strikes", label: "With strikes" },
                  { value: "step", label: "On a step" },
                ]}
              />
            </div>
            <PeopleTable people={d.people.filter((p) => (filter === "all" ? true : filter === "strikes" ? p.strikes > 0 : !!p.step))} combined={combined} storeName={storeName} />
            <div className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">
              Rating = 75% performance (check average, sales, checklists) + 25% conduct. Conduct is 100 minus 20 per strike. Strikes roll off after {STRIKE_WINDOW_DAYS} days. Ladder: 3 verbal ·
              4 written · 5 performance plan · 6 termination (owner approves).
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="eyebrow">Last 30 days</div>
                <div className="text-[11.5px] text-ink-soft">Excuse anything with a good reason and it stops counting.</div>
              </div>
              {!d.recent.length ? (
                <Empty>No strikes in the last 30 days.</Empty>
              ) : (
                <ul className="divide-y divide-paper-line border-y rule">
                  {d.recent.map((e) => (
                    <EventRow key={e.id} e={e} showName canExcuse={v.me.member?.id !== e.memberId} />
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-8">
              <div>
                <div className="eyebrow mb-2">Shift swaps · 30 days</div>
                {!d.swaps.length ? (
                  <Empty>No swaps.</Empty>
                ) : (
                  <ul className="divide-y divide-paper-line border-y rule">
                    {d.swaps.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                        {s.screenshotUrl && <img src={s.screenshotUrl} alt="" className="h-10 w-7 shrink-0 rounded-[2px] border border-paper-line object-cover object-top" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            {s.fromName} → <b>{s.toName}</b>
                          </div>
                          <div className="text-[11.5px] text-ink-soft">
                            {shortDay(s.businessDate)} · {s.shift} · {clock12(s.startTime)}
                            {combined && ` · ${storeName(s.storeId)}`}
                          </div>
                        </div>
                        <SwapStatus status={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {d.recentActions.length > 0 && (
                <div>
                  <div className="eyebrow mb-2">Write-ups on file</div>
                  <ul className="divide-y divide-paper-line border-y rule">
                    {d.recentActions.map((a) => (
                      <li key={a.id}>
                        <Link href={`/conduct/write-up/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:bg-paper-2/50">
                          <span>
                            <b>{a.memberName}</b> · {a.stepLabel} · {shortDay(a.businessDate)}
                          </span>
                          <ActionStatus status={a.status} step={a.step} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function Attention({ d, combined, storeName }: { d: Overview; combined: boolean; storeName: (id: string) => string }) {
  const owner = d.openActions.filter((a) => a.status === "awaiting_owner");
  const sign = d.openActions.filter((a) => a.status === "awaiting_signatures");
  const swaps = d.swaps.filter((s) => s.status === "pending");
  const acks = useMemo(() => {
    const m = new Map<string, Overview["pendingAcks"]>();
    for (const e of d.pendingAcks) m.set(e.memberId, [...(m.get(e.memberId) ?? []), e]);
    return [...m.values()];
  }, [d.pendingAcks]);
  if (!owner.length && !sign.length && !swaps.length && !acks.length)
    return (
      <div className="flex items-center gap-3 rounded-[2px] bg-paper-2 px-5 py-4 text-[13.5px]">
        <Check className="size-4 text-sage" /> Nothing waiting. Every strike is signed for, every write-up is on file and every swap is reviewed.
      </div>
    );
  return (
    <div>
      <div className="eyebrow mb-4 !text-oxblood">Needs attention</div>
      <div className="space-y-6">
        {owner.length > 0 && (
          <div className="space-y-2">
            {owner.map((a) => (
              <Link key={a.id} href={`/conduct/write-up/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] bg-noir px-5 py-4 text-ivory hover:bg-noir-2">
                <span className="flex items-center gap-3">
                  <ShieldAlert className="size-5 text-gold" />
                  <span>
                    <span className="font-display text-[19px]">{a.memberName}</span>
                    <span className="text-[13px] text-[#b9b0a3]">
                      {" "}
                      · Termination · {a.strikeCount} strikes{combined ? ` · ${storeName(a.storeId)}` : ""}
                    </span>
                  </span>
                </span>
                <span className="text-[12.5px] font-semibold text-gold">{d.canDecide ? "Owner decision needed →" : "Waiting for the owner"}</span>
              </Link>
            ))}
          </div>
        )}
        {sign.length > 0 && (
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Write-ups to sign</div>
            <ul className="divide-y divide-paper-line border-y rule">
              {sign.map((a) => (
                <li key={a.id}>
                  <Link href={`/conduct/write-up/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-paper-2/50">
                    <span className="flex items-center gap-3">
                      <FileSignature className="size-4 text-oxblood" />
                      <b>{a.memberName}</b>
                      <span className="text-[13px] text-ink-soft">
                        {a.stepLabel} · {a.strikeCount} strikes · opened {shortDay(a.businessDate)}
                        {combined && ` · ${storeName(a.storeId)}`}
                      </span>
                    </span>
                    <span className="text-[12.5px] font-semibold">{a.managerSignature ? "Employee to sign →" : "Manager to sign →"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {acks.length > 0 && (
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Strikes waiting for a signature · weren't at line-up</div>
            <div className="divide-y divide-paper-line border-y rule">
              {acks.map((list) => (
                <AckPanel key={list[0]!.memberId} events={list} />
              ))}
            </div>
          </div>
        )}
        {swaps.length > 0 && (
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Swaps to review</div>
            <div className="space-y-3">
              {swaps.map((s) => (
                <SwapReview key={s.id} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AckPanel({ events }: { events: Overview["pendingAcks"] }) {
  const v = useViewer();
  const ack = useAcknowledge();
  const [open, setOpen] = useState(false);
  const [sig, setSig] = useState("");
  const [refused, setRefused] = useState(false);
  const onSig = useCallback((_: string, val: string) => setSig(val), []);
  const e0 = events[0]!;
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/team/${e0.memberId}`} className="font-semibold hover:underline">
            {e0.memberName}
          </Link>
          <span className="text-[13px] text-ink-soft"> · {events.map((e) => `${EVENT_LABEL[e.type]} ${shortDay(e.businessDate)}`).join(" · ")}</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="btn btn-line !h-8 !px-3 !text-[12px]">
          {open ? "Close" : "Sign on this device"}
        </button>
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 grid gap-4 rounded-[2px] bg-paper-2 p-4 md:grid-cols-[1fr_1.2fr]">
          <ul className="space-y-2 text-[13px]">
            {events.map((e) => (
              <li key={e.id}>
                <b className="text-oxblood">{EVENT_LABEL[e.type]}.</b> <span className="text-ink-soft">{e.detail}</span>
              </li>
            ))}
            <li className="pt-1 text-[12px] italic text-ink-soft">“I understand this is recorded on my record for the next 90 days.”</li>
          </ul>
          <div>
            {refused ? (
              <div className="grid h-[140px] place-items-center rounded-[2px] border border-dashed border-oxblood/50 text-[13px] text-oxblood">Refused, witnessed by {v.me.accessName}</div>
            ) : (
              <SigField id={e0.memberId} onSig={onSig} caption={`Signed · ${e0.memberName}`} />
            )}
            <label className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
              <input type="checkbox" aria-label="Refused to sign" className="accent-[#7a2a26]" checked={refused} onChange={(ev) => setRefused(ev.target.checked)} /> Refused to sign
            </label>
            <ErrorNote error={ack.error} />
            <button
              disabled={(!sig && !refused) || ack.isPending}
              onClick={() => ack.mutate({ ids: events.map((e) => e.id), signature: refused ? undefined : sig, refused })}
              className="btn btn-ink mt-2 w-full"
            >
              Record acknowledgement
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function SwapReview({ s }: { s: Overview["swaps"][number] }) {
  const review = useReviewSwap();
  const [c, setC] = useState({ hasDate: false, hasStartTime: false, hasWrittenAgreement: false });
  const [strike, setStrike] = useState(false);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState(false);
  const all = c.hasDate && c.hasStartTime && c.hasWrittenAgreement;
  const toggle = (k: keyof typeof c) => setC((x) => ({ ...x, [k]: !x[k] }));
  return (
    <div className="grid gap-5 rounded-[2px] border border-gold-deep/40 p-4 md:grid-cols-[180px_1fr]">
      <button onClick={() => setZoom(true)} className="block overflow-hidden rounded-[2px] border border-paper-line bg-paper-2" aria-label="Open screenshot">
        {s.screenshotUrl ? <img src={s.screenshotUrl} alt="Text screenshot" className="h-56 w-full object-cover object-top" /> : <div className="grid h-56 place-items-center text-[12px] text-ink-soft">No preview</div>}
      </button>
      <div>
        <div className="font-display text-[20px]">
          {s.fromName} → {s.toName}
        </div>
        <div className="text-[13px] text-ink-soft">
          {shortDay(s.businessDate)} · {s.shift === "lunch" ? "Lunch" : "Dinner"} · starts {clock12(s.startTime)} · submitted by {s.submittedByName}
        </div>
        <div className="mt-3 text-[12.5px] font-semibold">Does the screenshot show…</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(
            [
              ["hasDate", `The date (${shortDay(s.businessDate)})`],
              ["hasStartTime", `The start time (${clock12(s.startTime)})`],
              ["hasWrittenAgreement", `${s.toName.split(" ")[0]}'s written agreement`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={cn("flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[12.5px]", c[k] ? "border-sage bg-sage/10 font-semibold text-sage" : "border-paper-line text-ink-soft hover:border-ink-soft")}
            >
              <span className={cn("grid size-4 place-items-center rounded-[2px] border", c[k] ? "border-sage bg-sage text-paper" : "border-ink-soft/50")}>{c[k] && <Check className="size-3" />}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] text-ink-soft">A thumbs-up or emoji is not a written agreement.</div>
        <input aria-label="Note" className="field mt-3 !h-9 !text-[13px]" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {s.worked && (
          <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-soft">
            <input type="checkbox" aria-label="Record a strike" className="accent-[#7a2a26]" checked={strike} onChange={(e) => setStrike(e.target.checked)} />
            If rejecting: the swap was already worked, so record a strike for {s.fromName.split(" ")[0]}
          </label>
        )}
        <ErrorNote error={review.error} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={!all || review.isPending} onClick={() => review.mutate({ id: s.id, approve: true, ...c, note })} className="btn btn-ink !h-9">
            <Check className="size-4" /> Approve swap
          </button>
          <button disabled={review.isPending} onClick={() => review.mutate({ id: s.id, approve: false, ...c, note, strike: s.worked && strike })} className="btn btn-line !h-9 !text-oxblood">
            Reject
          </button>
        </div>
      </div>
      {zoom && s.screenshotUrl && (
        <button className="fixed inset-0 z-50 grid place-items-center bg-noir/85 p-6" onClick={() => setZoom(false)} aria-label="Close screenshot">
          <img src={s.screenshotUrl} alt="Text screenshot" className="max-h-full max-w-full rounded-[3px] shadow-2xl" />
        </button>
      )}
    </div>
  );
}

function PeopleTable({ people, combined, storeName }: { people: Overview["people"]; combined: boolean; storeName: (id: string) => string }) {
  if (!people.length) return <Empty>No one matches.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            {combined && <th>Store</th>}
            <th className="r">Rating</th>
            <th>Strikes · 90 days</th>
            <th className="r">Late</th>
            <th className="r">Dress</th>
            <th className="r">No show</th>
            <th className="r">Swap</th>
            <th>Step</th>
            <th>Rolls off</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="hover:bg-paper-2/50">
              <td>
                <Link href={`/team/${p.id}`} aria-label={p.name} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-noir font-display text-[12px] text-gold">{p.initials}</span>
                  <span>
                    <span className="block font-semibold hover:underline">{p.name}</span>
                    <span className="block text-[11.5px] text-ink-soft">{ROLE_LABEL[p.role]}</span>
                  </span>
                </Link>
              </td>
              {combined && <td className="text-ink-soft">{storeName(p.storeId)}</td>}
              <td className="r">
                <RatingFigure value={p.rating?.overall} className="text-[20px]" />
                <div className="text-[10.5px] text-ink-soft">{ratingLabel(p.rating?.overall)}</div>
              </td>
              <td>
                <StrikeDots n={p.strikes} />
                {p.pending > 0 && <div className="mt-1 text-[11px] font-semibold text-oxblood">{p.pending} unsigned</div>}
              </td>
              <td className={cn("r", p.late && "font-semibold text-oxblood")}>
                {p.late || "—"}
                {p.avgLate != null && <div className="text-[10.5px] font-normal text-ink-soft">avg {p.avgLate} min</div>}
              </td>
              <td className={cn("r", p.dress && "font-semibold text-oxblood")}>{p.dress || "—"}</td>
              <td className={cn("r", p.noShow && "font-semibold text-oxblood")}>{p.noShow || "—"}</td>
              <td className={cn("r", p.swap && "font-semibold text-oxblood")}>{p.swap || "—"}</td>
              <td>
                <StepChip step={p.step} />
                {p.next && p.strikes >= 2 && (
                  <div className="mt-1 text-[10.5px] text-ink-soft">
                    next: {STEP_LABEL[p.next.step].toLowerCase()}
                    {p.next.in > 1 && ` in ${p.next.in}`}
                  </div>
                )}
              </td>
              <td className="text-[12px] text-ink-soft">{p.rollsOff ? shortDay(p.rollsOff) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Log a shift swap ─────────────────────────────────────────

export function SwapNewPage() {
  const v = useViewer();
  const [, nav] = useLocation();
  const [storeId, setStoreId] = useState(v.storeId);
  const team = useTeam(storeId);
  const submit = useSubmitSwap();
  const [shift, setShift] = useState<Shift>("dinner");
  const [f, setF] = useState({
    date: v.me.today ?? "",
    startTime: DEFAULT_CALL.dinner,
    fromMemberId: v.isManager ? "" : (v.me.member?.id ?? ""),
    toMemberId: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const people = (team.data ?? []).filter((m) => !["gm", "agm", "floor_manager", "bar_manager"].includes(m.role));
  const [done, setDone] = useState(false);

  if (done)
    return (
      <Page eyebrow="Conduct · Shift swap" title="Swap submitted.">
        <p className="max-w-lg text-[14.5px] leading-relaxed">
          A manager checks the screenshot for the date, the start time and a written agreement. Until it's approved, the shift is still{" "}
          {people.find((p) => p.id === f.fromMemberId)?.name.split(" ")[0] ?? "theirs"}'s.
        </p>
        <div className="mt-6 flex gap-2">
          <button onClick={() => nav("/conduct")} className="btn btn-ink">
            Back to conduct
          </button>
        </div>
      </Page>
    );

  return (
    <Page
      eyebrow={
        <>
          <Link href="/conduct" className="hover:underline">
            Conduct
          </Link>{" "}
          · Shift swap
        </>
      }
      title={v.isManager ? "Log a shift swap" : "Request a shift swap"}
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
        <form
          className="grid content-start gap-5 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            await submit.mutateAsync({ storeId, shift, date: f.date, startTime: f.startTime, fromMemberId: f.fromMemberId, toMemberId: f.toMemberId, file });
            setDone(true);
          }}
        >
          {v.isLeader && v.me.stores.length > 1 && (
            <div className="md:col-span-2">
              <span className="label">Store</span>
              <select aria-label="Store" className="field" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {v.me.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.number}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span className="label">Date of the shift</span>
            <input aria-label="Date of the shift" type="date" required className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div>
            <span className="label">Shift</span>
            <div className="flex items-center gap-3">
              <Seg
                value={shift}
                onChange={(s) => {
                  setShift(s);
                  setF((x) => ({ ...x, startTime: DEFAULT_CALL[s] }));
                }}
                options={[
                  { value: "lunch", label: "Lunch" },
                  { value: "dinner", label: "Dinner" },
                ]}
              />
              <input aria-label="Start time" type="time" required className="field !w-36" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
            </div>
          </div>
          <div>
            <span className="label">Giving up the shift</span>
            <select aria-label="Giving up the shift" required className="field" value={f.fromMemberId} disabled={!v.isManager} onChange={(e) => setF({ ...f, fromMemberId: e.target.value })}>
              <option value="">Choose…</option>
              {(v.isManager ? people : (team.data ?? []).filter((p) => p.id === v.me.member?.id)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {ROLE_LABEL[p.role]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Picking it up</span>
            <select aria-label="Picking it up" required className="field" value={f.toMemberId} onChange={(e) => setF({ ...f, toMemberId: e.target.value })}>
              <option value="">Choose…</option>
              {people
                .filter((p) => p.id !== f.fromMemberId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {ROLE_LABEL[p.role]}
                  </option>
                ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <span className="label">Screenshot of the text</span>
            <label className="flex cursor-pointer items-center gap-4 rounded-[2px] border border-dashed border-ink-soft/50 p-4 hover:border-ink">
              {preview ? (
                <img src={preview} alt="Screenshot preview" className="h-40 w-auto rounded-[2px] border border-paper-line" />
              ) : (
                <span className="grid size-16 place-items-center rounded-full bg-paper-2">
                  <ImageUp className="size-6 text-gold-deep" />
                </span>
              )}
              <span className="text-[13px]">
                <b>{file ? file.name : "Upload the screenshot"}</b>
                <br />
                <span className="text-ink-soft">PNG or JPG from your phone.</span>
              </span>
              <input type="file" aria-label="Screenshot of the text" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="md:col-span-2">
            {submit.error && <div className="mb-3 text-[13px] text-oxblood">{errMsg(submit.error)}</div>}
            <button disabled={!file || submit.isPending} className="btn btn-ink">
              <Repeat className="size-4" /> {submit.isPending ? "Uploading…" : "Submit for approval"}
            </button>
          </div>
        </form>
        <aside className="rounded-[2px] bg-noir p-6 text-ivory">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">Swap protocol</div>
          <p className="mt-3 text-[14px] leading-relaxed">{SWAP_RULE}</p>
          <ul className="mt-5 space-y-2 text-[13px] text-[#cfc6b8]">
            {["The date of the shift", "The start time", "Their written “yes, I'll take it”"].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-gold" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-noir-line pt-4 text-[12px] text-[#8b8277]">Working a swap that wasn't approved is a strike for the person who gave the shift away.</div>
        </aside>
      </div>
    </Page>
  );
}
