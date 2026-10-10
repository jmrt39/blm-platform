import { useCallback, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Check, FileSignature, Shirt, Timer, UserX, Repeat } from "lucide-react";
import { SignaturePad, SignatureView } from "./signature";
import { Empty } from "./bits";
import { ErrorNote } from "./shell";
import { useViewer } from "./viewer";
import { useConductMember, useExcuse } from "../queries/conduct";
import { EVENT_LABEL, STEP_LABEL, STEP_SHORT, STRIKE_WINDOW_DAYS, ratingLabel, type EventType, type Step } from "../../shared/conduct";
import { shortDay } from "../lib/format";
import { cn } from "../lib/utils";

export const EVENT_ICON: Record<EventType, typeof Timer> = {
  late: Timer,
  dress_code: Shirt,
  no_show: UserX,
  swap_protocol: Repeat,
};

/** Six dots: the ladder. 3 verbal · 4 written · 5 plan · 6 termination. */
export function StrikeDots({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} title={`${n} strike${n === 1 ? "" : "s"} in ${STRIKE_WINDOW_DAYS} days`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2.5 rounded-full border",
            i < n ? (i >= 5 ? "border-oxblood bg-oxblood" : i >= 2 ? "border-oxblood/80 bg-oxblood/70" : "border-ink bg-ink") : i === 2 ? "border-oxblood/50" : "border-ink-soft/40",
          )}
        />
      ))}
      {n > 6 && <span className="ml-1 text-[11px] font-bold text-oxblood">+{n - 6}</span>}
    </span>
  );
}

export function StepChip({ step, className }: { step: Step | null | undefined; className?: string }) {
  if (!step) return <span className={cn("text-[12px] text-ink-soft", className)}>·</span>;
  return (
    <span
      className={cn(
        "chip",
        step === "verbal" && "!border-gold-deep/60 !text-gold-deep",
        step === "written" && "!border-oxblood/50 !text-oxblood",
        (step === "plan" || step === "termination") && "!border-oxblood !bg-oxblood !text-paper",
        className,
      )}
    >
      {STEP_SHORT[step]}
    </span>
  );
}

export function RatingFigure({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className={cn("text-ink-soft", className)}>·</span>;
  return (
    <span className={cn("figure", value >= 80 ? "text-sage" : value >= 70 ? "text-ink" : value >= 60 ? "text-gold-deep" : "text-oxblood", className)}>{value}</span>
  );
}

export const ACTION_STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_signatures: { label: "Needs signatures", cls: "border-oxblood/50 text-oxblood" },
  awaiting_owner: { label: "Awaiting owner", cls: "border-gold-deep/60 text-gold-deep" },
  final: { label: "On file", cls: "border-ink/40 text-ink" },
  declined: { label: "Owner declined", cls: "border-paper-line text-ink-soft" },
  void: { label: "Void", cls: "border-paper-line text-ink-soft line-through" },
};

export function ActionStatus({ status, step }: { status: string; step?: string }) {
  const s =
    status === "final" && step === "termination"
      ? { label: "Terminated", cls: "border-oxblood/60 text-oxblood" }
      : (ACTION_STATUS[status] ?? { label: status, cls: "" });
  return <span className={cn("chip", s.cls)}>{s.label}</span>;
}

/** A signature pad that owns a stable onChange, so many can live on one page. */
export function SigField({ id, onSig, caption }: { id: string; onSig: (id: string, v: string) => void; caption: string }) {
  const cb = useCallback((v: string) => onSig(id, v), [id, onSig]);
  return <SignaturePad onChange={cb} caption={caption} />;
}

type EventRowData = {
  id: string;
  type: EventType;
  businessDate: string;
  detail: string;
  status: string;
  memberName?: string;
  memberId?: string;
  ackSignature: string | null;
  ackWitness: string | null;
  excusedByName: string | null;
  excusedReason: string | null;
  recordedByName: string;
  inWindow?: boolean;
};

export function EventRow({ e, showName, canExcuse }: { e: EventRowData; showName?: boolean; canExcuse?: boolean }) {
  const Icon = EVENT_ICON[e.type];
  const excuse = useExcuse();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const off = e.status === "excused" || e.inWindow === false;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", off ? "bg-paper-2 text-ink-soft" : "bg-oxblood/10 text-oxblood")}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {showName && e.memberId && (
              <Link href={`/team/${e.memberId}`} className="font-semibold hover:underline">
                {e.memberName}
              </Link>
            )}
            <span className={cn("text-[13.5px] font-semibold", off && "text-ink-soft line-through decoration-ink-soft/40")}>{EVENT_LABEL[e.type]}</span>
            <span className="text-[12px] text-ink-soft">{shortDay(e.businessDate)}</span>
          </div>
          <div className="text-[12.5px] text-ink-soft">{e.detail}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]">
            {e.status === "acknowledged" && (
              <span className="inline-flex items-center gap-1 text-sage">
                <Check className="size-3" /> Acknowledged
              </span>
            )}
            {e.status === "refused" && <span className="text-oxblood">Refused to sign · witnessed by {e.ackWitness}</span>}
            {e.status === "pending" && <span className="font-semibold text-oxblood">Not yet acknowledged</span>}
            {e.status === "excused" && (
              <span className="text-ink-soft">
                Excused by {e.excusedByName}
                {e.excusedReason ? `: “${e.excusedReason}”` : ""}
              </span>
            )}
            {e.inWindow === false && e.status !== "excused" && <span className="text-ink-soft">Rolled off after {STRIKE_WINDOW_DAYS} days</span>}
            <span className="text-ink-soft">· recorded by {e.recordedByName}</span>
          </div>
        </div>
        {e.ackSignature && <SignatureView value={e.ackSignature} className="hidden h-9 shrink-0 sm:block" />}
        {canExcuse && e.status !== "excused" && e.inWindow !== false && (
          <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[12px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            Excuse
          </button>
        )}
      </div>
      {open && (
        <form
          className="ml-11 mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            await excuse.mutateAsync({ id: e.id, reason });
            setOpen(false);
          }}
        >
          <input
            aria-label="Reason for excusing"
            className="field !h-9 min-w-[240px] flex-1 !text-[13px]"
            placeholder="Why it's excused, like a doctor's note or a subway outage"
            value={reason}
            minLength={3}
            required
            onChange={(ev) => setReason(ev.target.value)}
          />
          <button disabled={excuse.isPending} className="btn btn-ink !h-9 !px-3 !text-[12px]">
            Excuse strike
          </button>
          <ErrorNote error={excuse.error} />
        </form>
      )}
    </li>
  );
}

function Part({ label, value, weight }: { label: string; value: number | null; weight: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-ink-soft">
        {label} <span className="text-[11px]">· {weight}</span>
      </span>
      <RatingFigure value={value} className="text-[17px]" />
    </div>
  );
}

/** Rating, strikes, write-ups and history for one colleague. Used on their profile. */
export function ConductSection({ memberId }: { memberId: string }) {
  const v = useViewer();
  const q = useConductMember(memberId);
  if (q.isLoading) return null;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  const r = d.rating;
  const seller = ["server", "sommelier", "bartender"].includes(d.member.role);
  const live = d.actions.filter((a) => a.status !== "void");
  const canExcuse = v.isManager && v.me.member?.id !== memberId;
  return (
    <div className="grid gap-10 border-t rule pt-8 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-6">
        <div>
          <div className="eyebrow mb-3">Overall rating</div>
          <div className="flex items-end gap-4">
            <RatingFigure value={r?.overall} className="text-[64px] leading-none" />
            <div className="pb-1.5">
              <div className="font-display text-[20px] leading-tight">{ratingLabel(r?.overall)}</div>
              <div className="text-[12px] text-ink-soft">75% performance · 25% conduct</div>
            </div>
          </div>
          {r && (
            <div className="mt-4 divide-y divide-paper-line border-y rule">
              <Part label="Performance" value={r.performance} weight="75%" />
              {seller && (
                <div className="pl-4 text-[12px]">
                  <Part label="Check average vs target" value={r.parts.checkAvg} weight="50%" />
                  <Part label="Sales per shift vs peers" value={r.parts.sales} weight="25%" />
                  <Part label="Checklists" value={r.parts.checklists} weight="25%" />
                </div>
              )}
              <Part label="Conduct & attendance" value={r.conduct} weight="25%" />
            </div>
          )}
          <div className="mt-2 text-[11.5px] text-ink-soft">Conduct starts at 100 and drops 20 for each strike in the last {STRIKE_WINDOW_DAYS} days.</div>
        </div>
        <div className="rounded-[2px] bg-paper-2 p-5">
          <div className="eyebrow mb-3">Standing · last {STRIKE_WINDOW_DAYS} days</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="figure text-[38px] leading-none">{d.strikes}</div>
              <div className="mt-1 text-[12px] text-ink-soft">strike{d.strikes === 1 ? "" : "s"}</div>
            </div>
            <div className="text-right">
              <StrikeDots n={d.strikes} />
              <div className="mt-2">
                <StepChip step={d.step} />
              </div>
            </div>
          </div>
          {d.next && (
            <div className="mt-3 text-[12px] text-ink-soft">
              {d.next.in === 1 ? "One more strike means" : `${d.next.in} more strikes mean`} {d.next.step === "plan" ? "a performance plan" : d.next.step === "termination" ? "termination" : `a ${STEP_LABEL[d.next.step].toLowerCase()}`}.
            </div>
          )}
          {d.lineups.total > 0 && (
            <div className="mt-3 border-t border-paper-line pt-3 text-[12.5px] text-ink-soft">
              Line ups: {d.lineups.onTime} of {d.lineups.total} on time · in uniform {d.lineups.inUniform} of {d.lineups.attended}
            </div>
          )}
        </div>
        {live.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Write-ups</div>
            <ul className="divide-y divide-paper-line border-y rule">
              {live.map((a) => (
                <li key={a.id}>
                  <Link href={`/conduct/write-up/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-paper-2/50">
                    <span className="flex items-center gap-2.5">
                      <FileSignature className="size-4 text-gold-deep" />
                      <span className="text-[13.5px] font-semibold">{a.stepLabel}</span>
                      <span className="text-[12px] text-ink-soft">{shortDay(a.businessDate)}</span>
                    </span>
                    <ActionStatus status={a.status} step={a.step} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <div className="eyebrow">Conduct record</div>
          <div className="text-[11.5px] text-ink-soft">since {shortDay(d.windowFrom)}</div>
        </div>
        {!d.events.length ? (
          <Empty>Clean record. On time and in uniform.</Empty>
        ) : (
          <ul className="divide-y divide-paper-line border-y rule">
            {d.events.map((e) => (
              <EventRow key={e.id} e={e} canExcuse={canExcuse} />
            ))}
          </ul>
        )}
        {d.swaps.length > 0 && (
          <div className="mt-8">
            <div className="eyebrow mb-2">Shift swaps</div>
            <ul className="divide-y divide-paper-line border-y rule text-[13px]">
              {d.swaps.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    {shortDay(s.businessDate)} {s.shift} · {s.fromName} → {s.toName}
                  </span>
                  <SwapStatus status={s.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function SwapStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "chip",
        status === "approved" && "!border-sage/60 !text-sage",
        status === "rejected" && "!border-oxblood/50 !text-oxblood",
        status === "pending" && "!border-gold-deep/60 !text-gold-deep",
      )}
    >
      {status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Waiting for review"}
    </span>
  );
}

export function Warn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-[2px] border border-oxblood/30 bg-oxblood/5 px-3 py-2 text-[12.5px] text-oxblood", className)}>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

