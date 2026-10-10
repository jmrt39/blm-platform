import { useCallback, useState } from "react";
import { Link, useParams } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { SignatureView, SignedStamp } from "../components/signature";
import { ActionStatus, EVENT_ICON, SigField, StrikeDots, Warn } from "../components/conduct-bits";
import { useAction, useOwnerDecide, useSignAction } from "../queries/conduct";
import { PlanPanel } from "../components/plan-panel";
import { EVENT_LABEL, STEPS, STEP_LABEL, STRIKE_WINDOW_DAYS } from "../../shared/conduct";
import { ROLE_LABEL } from "../../shared/domain";
import { dayLabel, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

const NEXT: Record<string, string> = {
  verbal: "Another strike within 90 days moves to a written warning.",
  written: "Another strike within 90 days moves to a performance plan.",
  plan: "Another strike within 90 days moves to termination, subject to owner approval.",
  termination: "Termination is final once the owner approves it.",
};

/** Sign off times read in the store's own time zone, like the rest of the app. */
const stamp = (tz: string) => (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).replace(" AM", " am").replace(" PM", " pm") : "";

export default function WriteUpPage() {
  const { id } = useParams<{ id: string }>();
  const v = useViewer();
  const q = useAction(id!);
  const sign = useSignAction();
  const decide = useOwnerDecide();
  const [mgrSig, setMgrSig] = useState("");
  const [empSig, setEmpSig] = useState("");
  const [refused, setRefused] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [ownerNote, setOwnerNote] = useState("");
  const onMgr = useCallback((_: string, s: string) => setMgrSig(s), []);
  const onEmp = useCallback((_: string, s: string) => setEmpSig(s), []);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} what="This write up" />;
  const { action: a, events, member, store, history, can } = q.data;
  const when = stamp(store?.timezone ?? "America/New_York");
  const rank = STEPS.indexOf(a.step);
  const terminated = a.step === "termination" && a.status === "final";

  return (
    <Page
      eyebrow={
        <>
          <Link href="/conduct" className="hover:underline">
            Conduct
          </Link>{" "}
          · Write up · {store?.name}
        </>
      }
      title={a.stepLabel}
      aside={<ActionStatus status={a.status} step={a.step} />}
    >
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          {a.status === "void" && <Warn>Void: {a.voidReason ?? "no longer applies."}</Warn>}
          {a.status === "declined" && (
            <Warn>
              The owner declined this termination{a.ownerNote ? `: “${a.ownerNote}”` : ""}. {member?.name.split(" ")[0]} stays on a performance plan.
            </Warn>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-ink py-5 text-[13.5px] md:grid-cols-4">
            <Field k="Employee">
              {member ? (
                <Link href={`/team/${member.id}`} className="font-semibold hover:underline">
                  {member.name}
                </Link>
              ) : (
                a.memberName
              )}
              <div className="text-[12px] text-ink-soft">{member ? ROLE_LABEL[member.role] : ""}</div>
            </Field>
            <Field k="Store">
              {store?.name}
              <div className="text-[12px] text-ink-soft">Store {store?.number}</div>
            </Field>
            <Field k="Issued">{dayLabel(a.businessDate, { month: "long", day: "numeric", year: "numeric" })}</Field>
            <Field k={`Strikes · ${STRIKE_WINDOW_DAYS} days`}>
              <div className="flex items-center gap-2">
                <span className="figure text-[22px] leading-none">{a.strikeCount}</span>
                <StrikeDots n={a.strikeCount} />
              </div>
            </Field>
          </div>

          <div>
            <div className="eyebrow mb-3">Progressive discipline</div>
            <div className="grid grid-cols-4 gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className={cn("border-t-[3px] pt-2", i < rank ? "border-ink" : i === rank ? "border-oxblood" : "border-paper-line")}>
                  <div className={cn("text-[12px] font-bold", i === rank ? "text-oxblood" : i < rank ? "text-ink" : "text-ink-soft")}>{STEP_LABEL[s]}</div>
                  <div className="text-[11px] text-ink-soft">{i + 3} strikes</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-soft">{NEXT[a.step]}</p>
          </div>

          <div>
            <div className="eyebrow mb-2">What happened</div>
            <ul className="divide-y divide-paper-line border-y rule">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.type];
                return (
                  <li key={e.id} className="flex gap-3 py-3">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", e.status === "excused" ? "text-ink-soft" : "text-oxblood")} />
                    <div className="text-[13px]">
                      <b className={cn(e.status === "excused" && "line-through")}>{EVENT_LABEL[e.type]}</b> <span className="text-ink-soft">· {shortDay(e.businessDate)}</span>
                      <div className="text-ink-soft">{e.detail}</div>
                      {e.status === "excused" && <div className="text-[11.5px] text-ink-soft">Since excused by {e.excusedByName}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-2">Expectations going forward</div>
            {can.managerSign ? (
              <textarea
                aria-label="Expectations going forward"
                className="field min-h-[96px] !py-2 text-[13.5px]"
                placeholder="Be in full uniform and on the floor by the scheduled start. Swaps only with a screenshot showing the date, start time and written agreement."
                value={notes ?? a.notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            ) : (
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{a.notes || <span className="text-ink-soft">Follow the standards: on time, in uniform, swaps with proof.</span>}</p>
            )}
          </div>

          <div className="grid gap-8 border-t border-ink pt-6 md:grid-cols-2">
            <div>
              <div className="eyebrow mb-2">Manager</div>
              {a.managerSignature ? (
                <SigBlock sig={a.managerSignature} name={a.managerName} sub={`${ROLE_LABEL[a.managerRole ?? ""] ?? ""} · ${when(a.managerSignedAt)}`} />
              ) : can.managerSign ? (
                <>
                  <SigField id="mgr" onSig={onMgr} caption={`Issued by · ${v.me.accessName}`} />
                  <button
                    disabled={!mgrSig || sign.isPending}
                    onClick={() => sign.mutate({ id: a.id, as: "manager", signature: mgrSig, notes: notes ?? undefined })}
                    className="btn btn-ink mt-2 w-full"
                  >
                    Sign as manager
                  </button>
                </>
              ) : (
                <div className="text-[13px] text-ink-soft">{a.status === "void" ? "Nothing to sign." : "Waiting for a manager."}</div>
              )}
            </div>
            <div>
              <div className="eyebrow mb-2">Employee</div>
              {a.employeeSignature ? (
                <SigBlock sig={a.employeeSignature} name={a.memberName} sub={when(a.employeeSignedAt)} />
              ) : a.employeeRefused ? (
                <div className="text-[13px] text-oxblood">
                  Refused to sign · witnessed by {a.managerName} · {when(a.employeeSignedAt)}
                </div>
              ) : can.employeeSign ? (
                <>
                  {refused ? (
                    <div className="grid h-[140px] place-items-center rounded-[2px] border border-dashed border-oxblood/50 text-[13px] text-oxblood">Refused, witnessed by {a.managerName}</div>
                  ) : (
                    <SigField id="emp" onSig={onEmp} caption={`Received · ${a.memberName}`} />
                  )}
                  <label className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                    <input type="checkbox" aria-label="Refused to sign" className="accent-[#7a2a26]" checked={refused} onChange={(e) => setRefused(e.target.checked)} /> Refused to sign
                  </label>
                  <button
                    disabled={(!empSig && !refused) || sign.isPending}
                    onClick={() => sign.mutate({ id: a.id, as: "employee", signature: refused ? undefined : empSig, refused })}
                    className="btn btn-ink mt-2 w-full"
                  >
                    {a.step === "termination" ? "Sign & send to owner" : "Sign & file"}
                  </button>
                  <p className="mt-2 text-[11.5px] text-ink-soft">Signing confirms {a.memberName.split(" ")[0]} received this write up, not that they agree with it.</p>
                </>
              ) : (
                <div className="text-[13px] text-ink-soft">{a.status === "awaiting_signatures" ? "Signs after the manager, on the same device." : "Nothing to sign."}</div>
              )}
            </div>
          </div>
          <ErrorNote error={sign.error} />

          {a.step === "plan" && a.status !== "void" && <PlanPanel actionId={a.id} firstName={a.memberName.split(" ")[0] ?? a.memberName} />}

          {a.step === "termination" && (
            <div className={cn("rounded-[2px] p-5", a.status === "awaiting_owner" ? "bg-noir text-ivory" : "bg-paper-2")}>
              <div className={cn("eyebrow mb-2 flex items-center gap-2", a.status === "awaiting_owner" && "!text-gold")}>
                <ShieldAlert className="size-4" /> Owner approval
              </div>
              {a.ownerDecidedAt ? (
                <div className="text-[13.5px]">
                  {a.status === "final" ? "Approved" : "Declined"} by <b>{a.ownerName}</b> · {when(a.ownerDecidedAt)}
                  {a.ownerNote && <div className="mt-1 italic text-ink-soft">“{a.ownerNote}”</div>}
                </div>
              ) : a.status !== "awaiting_owner" ? (
                <div className="text-[13px] text-ink-soft">Goes to the owner once the manager and {a.memberName.split(" ")[0]} have signed.</div>
              ) : can.decide ? (
                <>
                  <p className="text-[13.5px] text-[#cfc6b8]">Nothing is final until you approve. Approving marks {a.memberName} as departed and ends their access.</p>
                  <input aria-label="Owner note" className="field-noir mt-3" placeholder="Note (optional)" value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} />
                  <ErrorNote error={decide.error} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: true, note: ownerNote })} className="btn btn-gold">
                      Approve termination
                    </button>
                    <button disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: false, note: ownerNote })} className="btn btn-noir-line">
                      Decline, keep on plan
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[13.5px] text-[#cfc6b8]">Waiting for the owner to approve. Until then {a.memberName.split(" ")[0]} remains on the roster.</div>
              )}
            </div>
          )}

          {a.status === "final" && (
            <div className="flex justify-end">
              <SignedStamp label={terminated ? "Terminated" : "On file"} name={terminated ? (a.ownerName ?? "") : (a.managerName ?? "")} when={when(a.ownerDecidedAt ?? a.employeeSignedAt)} />
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[2px] bg-paper-2 p-5 text-[13px] leading-relaxed">
            <div className="eyebrow mb-2">The policy</div>
            Every late arrival (more than 5 minutes), dress code miss, no show and swap without proof is a strike. Strikes count for {STRIKE_WINDOW_DAYS} days unless a manager excuses
            them. 3 strikes is a verbal warning, 4 written, 5 a performance plan, 6 termination, which the owner approves before it's final.
          </div>
          {history.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Earlier write ups</div>
              <ul className="divide-y divide-paper-line border-y rule">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={`/conduct/write-up/${h.id}`} className="flex items-center justify-between gap-2 py-2.5 text-[13px] hover:bg-paper-2/50">
                      <span>
                        {h.stepLabel} · {shortDay(h.businessDate)}
                      </span>
                      <ActionStatus status={h.status} step={h.step} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{k}</div>
      {children}
    </div>
  );
}

function SigBlock({ sig, name, sub }: { sig: string; name: string | null; sub: string }) {
  return (
    <div>
      <div className="border-b border-ink/60 pb-1">
        <SignatureView value={sig} className="h-14" />
      </div>
      <div className="mt-1.5 text-[13px] font-semibold">{name}</div>
      <div className="text-[11.5px] text-ink-soft">{sub}</div>
    </div>
  );
}
