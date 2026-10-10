import { useCallback, useState } from "react";
import { Link, useParams } from "wouter";
import { AnimatePresence, motion } from "motion/react";
import { Check, Undo2, X } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Empty, StatusPill } from "../components/bits";
import { SignaturePad, SignatureView, SignedStamp } from "../components/signature";
import { PinBoxes } from "./sign-in";
import {
  useChecklist,
  useChecklistHistory,
  useClearLine,
  useInitialLine,
  useMarkNa,
  useSubmitChecklist,
  useTodayChecklists,
  useUnverifyChecklist,
  useVerifyChecklist,
} from "../queries/checklists";
import { dayLabel, errMsg, shortDay, timeOf } from "../lib/format";
import { ROLE_LABEL } from "../../shared/domain";
import { cn } from "../lib/utils";

export function StoreTabs() {
  const v = useViewer();
  if (!v.isLeader || v.me.stores.length < 2) return null;
  return (
    <div className="mb-7 flex flex-wrap gap-2">
      {v.me.stores.map((s) => (
        <button
          key={s.id}
          onClick={() => v.setScope(s.id)}
          className={cn("chip !px-3 !py-1 !text-[12px]", s.id === v.storeId ? "!border-ink bg-ink !text-paper" : "hover:!border-ink")}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function ChecklistsPage() {
  const v = useViewer();
  const today = useTodayChecklists(v.storeId);
  const hist = useChecklistHistory(v.storeId, 21);
  const tz = v.store?.timezone ?? "America/New_York";
  return (
    <Page eyebrow={`${v.store?.name} · Store ${v.store?.number}`} title="Opening & closing">
      <StoreTabs />
      {today.isLoading ? (
        <Loading />
      ) : today.error ? (
        <ErrorNote error={today.error} />
      ) : (
        <>
          <div className="eyebrow mb-3">{today.data && dayLabel(today.data.date)}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {today.data?.checklists.map((c) => (
              <Link key={c.id} href={`/checklists/${c.id}`} className="group relative rounded-[2px] border rule p-6 hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-[30px] capitalize leading-none">{c.type}</div>
                    <div className="mt-2 text-[12.5px] text-ink-soft">
                      Due by {timeOf(c.dueAt, tz)}
                      {c.submittedAt && ` · submitted ${timeOf(c.submittedAt, tz)}`}
                    </div>
                  </div>
                  <StatusPill status={c.status} late={c.late} />
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Bar value={c.done} max={c.total} tone={c.status === "submitted" ? "gold" : c.late ? "bad" : "ink"} />
                  <div className="figure shrink-0 text-[18px]">
                    {c.done}/{c.total}
                  </div>
                </div>
                {c.verifiedByName && (
                  <div className="mt-4 flex items-center gap-3 text-[12px] text-ink-soft">
                    Verified by {c.verifiedByName} <SignatureView value={c.signature} className="h-7" />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="eyebrow mb-3 mt-12">Last three weeks</div>
      {hist.isLoading ? (
        <Loading />
      ) : !hist.data?.length ? (
        <Empty>No history yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Checklist</th>
                <th className="r">Lines</th>
                <th>Verified by</th>
                <th className="r">Submitted</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {hist.data.map((c) => (
                <tr key={c.id} className="hover:bg-paper-2/50">
                  <td>{shortDay(c.businessDate)}</td>
                  <td className="capitalize">
                    <Link href={`/checklists/${c.id}`} className="font-semibold hover:underline">
                      {c.type}
                    </Link>
                  </td>
                  <td className="r">
                    {c.done}/{c.total}
                  </td>
                  <td>{c.verifiedByName ?? "—"}</td>
                  <td className="r">{c.submittedAt ? timeOf(c.submittedAt, tz) : "—"}</td>
                  <td className="r">
                    <StatusPill status={c.status} late={c.late} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

type Roster = { id: string; name: string; initials: string; role: string }[];

function InitialDialog({ roster, lineTitle, onClose, onDone }: { roster: Roster; lineTitle: string; onClose: () => void; onDone: (memberId: string, pin: string) => Promise<void> }) {
  const [who, setWho] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await onDone(who, pin);
    } catch (e) {
      setError(errMsg(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-noir/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ y: 12 }} animate={{ y: 0 }} className="sheet w-full max-w-md p-7" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <button onClick={onClose} className="absolute -right-1 -top-1 text-ink-soft hover:text-ink">
            <X className="size-5" />
          </button>
          <div className="eyebrow mb-1">Initial this line</div>
          <div className="mb-5 font-display text-[20px] leading-snug">{lineTitle}</div>
          <div className="label">Who completed it?</div>
          <div className="mb-5 grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {roster.map((r) => (
              <button
                key={r.id}
                onClick={() => setWho(r.id)}
                className={cn("flex items-center gap-2 rounded-[2px] border px-2.5 py-2 text-left text-[13px]", who === r.id ? "border-ink bg-ink text-paper" : "rule hover:border-ink")}
              >
                <span className="font-display font-semibold">{r.initials}</span>
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
          {who && (
            <>
              <div className="label">{roster.find((r) => r.id === who)?.name.split(" ")[0]}'s 4-digit PIN</div>
              <PinBoxes value={pin} onChange={setPin} dark={false} />
            </>
          )}
          {error && <div className="mt-3 text-[13px] text-oxblood">{error}</div>}
          <button disabled={!who || pin.length !== 4 || busy} onClick={go} className="btn btn-ink mt-5 w-full">
            Initial & time-stamp
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const v = useViewer();
  const q = useChecklist(id!);
  const initial = useInitialLine();
  const clear = useClearLine();
  const verify = useVerifyChecklist();
  const submit = useSubmitChecklist();
  const unverify = useUnverifyChecklist();
  const markNa = useMarkNa();
  const [naFor, setNaFor] = useState<string | null>(null);
  const [naReason, setNaReason] = useState("");
  const [dialogFor, setDialogFor] = useState<{ id: string; title: string } | null>(null);
  const [sig, setSig] = useState("");
  const onSig = useCallback((s: string) => setSig(s), []);
  const [err, setErr] = useState<unknown>(null);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { checklist: c, store, roster, me, canVerify, isToday, rules } = q.data;
  const tz = v.me.stores.find((s) => s.id === store.id)?.timezone ?? "America/New_York";
  const areas = [...new Set(c.lines.map((l) => l.area))];
  const open = c.status === "open";
  const remaining = c.total - c.done;

  const tap = async (lineId: string, title: string) => {
    setErr(null);
    if (me) {
      try {
        await initial.mutateAsync({ lineId });
      } catch (e) {
        setErr(e);
      }
    } else setDialogFor({ id: lineId, title });
  };

  return (
    <Page
      eyebrow={
        <>
          <Link href="/checklists" className="hover:underline">
            Checklists
          </Link>{" "}
          · {store.name} · {dayLabel(c.businessDate)}
        </>
      }
      title={<span className="capitalize">{c.type} checklist</span>}
      aside={
        <div className="text-right">
          <StatusPill status={c.status} late={c.late} />
          <div className="mt-1.5 text-[12px] text-ink-soft">Due by {timeOf(c.dueAt, tz)}</div>
        </div>
      }
    >
      <div className="mb-6 flex items-center gap-4">
        <Bar value={c.done} max={c.total} tone={c.status === "submitted" ? "gold" : "ink"} />
        <div className="figure shrink-0 text-[20px]">
          {c.done}/{c.total}
        </div>
      </div>
      <ChecklistRules type={c.type} businessDate={c.businessDate} rules={rules} tz={tz} />
      {open && me && (
        <div className="mb-6 rounded-[2px] bg-paper-2 px-4 py-3 text-[13px] text-ink-soft">
          Tap a line to initial it as <b className="text-ink">{me.initials}</b> with the time. On a shared tablet, use "Someone else" to initial for a colleague with their PIN.
        </div>
      )}
      <ErrorNote error={err} />

      <div className="space-y-8">
        {areas.map((area) => (
          <div key={area}>
            <div className="eyebrow mb-1">{area}</div>
            <ul className="divide-y divide-paper-line border-y rule">
              {c.lines
                .filter((l) => l.area === area)
                .map((l) => {
                  const done = !!l.doneAt;
                  if (l.naReason)
                    return (
                      <li key={l.id} className="flex items-center gap-4 py-3.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-[2px] border border-dashed border-ink-soft/60 text-[9.5px] font-bold text-ink-soft">N/A</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] text-ink-soft line-through decoration-ink-soft/40">{l.title}</div>
                          <div className="text-[12px] text-ink-soft">
                            Not applicable: “{l.naReason}” · {l.naBy} {l.naAt ? `· ${timeOf(l.naAt, tz)}` : ""}
                          </div>
                        </div>
                        {open && canVerify && (
                          <button onClick={() => clear.mutate({ lineId: l.id })} className="text-ink-soft/60 hover:text-oxblood" title="Undo N/A" aria-label="Undo N/A">
                            <Undo2 className="size-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  if (naFor === l.id)
                    return (
                      <li key={l.id} className="py-3.5">
                        <div className="mb-2 text-[14.5px]">{l.title}</div>
                        <form
                          className="flex flex-wrap gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setErr(null);
                            try {
                              await markNa.mutateAsync({ lineId: l.id, reason: naReason });
                              setNaFor(null);
                              setNaReason("");
                            } catch (x) {
                              setErr(x);
                            }
                          }}
                        >
                          <input
                            aria-label="Reason it doesn't apply today"
                            className="field min-w-[220px] flex-1"
                            placeholder="Why doesn't this apply today? like Patio closed, rain"
                            value={naReason}
                            onChange={(e) => setNaReason(e.target.value)}
                          />
                          <button disabled={naReason.trim().length < 4 || markNa.isPending} className="btn btn-ink">
                            Mark N/A
                          </button>
                          <button type="button" onClick={() => setNaFor(null)} className="btn btn-line">
                            Cancel
                          </button>
                        </form>
                      </li>
                    );
                  return (
                    <li key={l.id} className="flex items-center gap-4 py-3.5">
                      <button
                        disabled={!open || done || initial.isPending}
                        onClick={() => tap(l.id, l.title)}
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-[2px] border transition-colors",
                          done ? "border-ink bg-ink text-paper" : "border-ink-soft/50 hover:border-ink",
                        )}
                        aria-label={done ? "Done" : "Initial"}
                      >
                        {done && <Check className="size-4" />}
                      </button>
                      <div className={cn("min-w-0 flex-1 text-[14.5px]", done && "text-ink")}>{l.title}</div>
                      {done ? (
                        <div className="flex items-center gap-3">
                          <span className="font-display text-[19px] font-semibold tracking-wider text-[#1c2a4a]" title={l.doneByName ?? ""}>
                            {l.initials}
                          </span>
                          <span className="w-16 text-right text-[12.5px] tabular-nums text-ink-soft">{timeOf(l.doneAt, tz)}</span>
                          {open && (canVerify || l.doneById === me?.id) && (
                            <button onClick={() => clear.mutate({ lineId: l.id })} className="text-ink-soft/60 hover:text-oxblood" title="Undo">
                              <Undo2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ) : open ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setNaFor(l.id); setNaReason(""); }} className="text-[12px] font-semibold text-ink-soft hover:text-ink">
                            N/A
                          </button>
                          {me && (
                            <button onClick={() => setDialogFor({ id: l.id, title: l.title })} className="text-[12px] font-semibold text-ink-soft hover:text-ink">
                              Someone else
                            </button>
                          )}
                          <button onClick={() => tap(l.id, l.title)} className="chip hover:!border-ink hover:!text-ink">
                            {me ? `Initial ${me.initials}` : "Initial"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] italic text-oxblood">Not initialled</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      {/* Sign-off */}
      <div className="mt-12 grid gap-8 border-t-2 border-ink pt-8 md:grid-cols-[1fr_auto]">
        {c.status === "open" ? (
          canVerify ? (
            <div className="max-w-xl">
              <div className="eyebrow mb-1">Verified by</div>
              <div className="mb-4 font-display text-[22px]">
                {v.me.accessName} <span className="text-[14px] text-ink-soft">· {ROLE_LABEL[v.me.accessRole]}</span>
              </div>
              {remaining > 0 ? (
                <div className="text-[13.5px] text-ink-soft">
                  {remaining} line{remaining === 1 ? "" : "s"} still to initial (or mark N/A with a reason) before you can sign.
                </div>
              ) : (
                <>
                  <SignaturePad onChange={onSig} />
                  <ErrorNote error={verify.error} />
                  <button disabled={!sig || verify.isPending} onClick={() => verify.mutate({ id: c.id, signature: sig })} className="btn btn-ink mt-3">
                    Verify & sign
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="text-[13.5px] text-ink-soft">A manager walks the room and signs once every line is initialled.</div>
          )
        ) : (
          <div>
            <div className="eyebrow mb-1">Verified by</div>
            <div className="font-display text-[22px]">
              {c.verifiedByName} <span className="text-[14px] text-ink-soft">· {ROLE_LABEL[c.verifiedByRole ?? ""] ?? ""}</span>
            </div>
            <div className="mt-2 border-b border-ink/40 pb-1">
              <SignatureView value={c.signature} className="h-14" />
            </div>
            <div className="mt-1.5 text-[12px] text-ink-soft">Signed {timeOf(c.verifiedAt, tz)}</div>
            {c.status === "verified" && canVerify && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button disabled={submit.isPending} onClick={() => submit.mutate({ id: c.id })} className="btn btn-ink">
                  Submit {c.type} checklist
                </button>
                <button onClick={() => unverify.mutate({ id: c.id })} className="btn btn-line">
                  Re-open
                </button>
              </div>
            )}
          </div>
        )}
        <AnimatePresence>
          {c.status === "submitted" && c.submittedAt && (
            <motion.div initial={{ opacity: 0, scale: 1.4, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="self-center">
              <SignedStamp name={c.verifiedByName ?? ""} when={`Submitted ${timeOf(c.submittedAt, tz)}`} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!isToday && c.status === "open" && <div className="mt-6 text-[12.5px] italic text-oxblood">This checklist was never submitted.</div>}

      <AnimatePresence>
        {dialogFor && (
          <InitialDialog
            roster={roster}
            lineTitle={dialogFor.title}
            onClose={() => setDialogFor(null)}
            onDone={async (memberId, pin) => {
              await initial.mutateAsync({ lineId: dialogFor.id, memberId, pin });
              setDialogFor(null);
            }}
          />
        )}
      </AnimatePresence>
    </Page>
  );
}

const TZ_LABEL: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
};

/** Answers the questions people ask about a checklist: which day, which clock, what counts, who owns it. */
function ChecklistRules({
  type,
  businessDate,
  rules,
  tz,
}: {
  type: "opening" | "closing";
  businessDate: string;
  rules: { timezone: string; opensAt: number; dueAt: number; owner: { name: string; role: string } | null };
  tz: string;
}) {
  const [open, setOpen] = useState(false);
  const zone = TZ_LABEL[rules.timezone] ?? rules.timezone;
  return (
    <div className="mb-6 rounded-[2px] border rule">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-[13px]">
        <span>
          <b>Business date {shortDay(businessDate)}</b> · window {timeOf(rules.opensAt, tz)} – {timeOf(rules.dueAt, tz)}
          {type === "closing" ? " (next morning)" : ""} · {zone}
        </span>
        <span className="font-semibold text-gold-deep">{open ? "Hide the rules" : "How this checklist works"}</span>
      </button>
      {open && (
        <dl className="grid gap-x-8 gap-y-3 border-t rule px-4 py-4 text-[13px] md:grid-cols-2">
          <Rule k="Which day it belongs to">
            The business day runs 4:00 am to 3:59 am. A closing finished at 1:00 am belongs to the night before. This one is {dayLabel(businessDate)}.
          </Rule>
          <Rule k="Which clock">All times are store time: {zone} ({rules.timezone}).</Rule>
          <Rule k="Early ticks">
            Lines can't be initialled before the window opens at {timeOf(rules.opensAt, tz)}. Anything before that would be a guess, so the platform refuses it.
          </Rule>
          <Rule k="On time">Submitted by {timeOf(rules.dueAt, tz)}{type === "closing" ? " the next morning" : ""}. After that it counts as late; never submitted counts as missed.</Rule>
          <Rule k="What the statuses mean">
            <b>Initialled</b>: a colleague did the task and stamped it. <b>Verified</b>: the manager walked the room and signed. <b>Submitted</b>: locked into the record. Only submitted lists count as complete.
          </Rule>
          <Rule k="Who owns it">
            Each line belongs to whoever initials it. The list belongs to the manager on duty; if it's still open at the due time it escalates to {rules.owner ? `${rules.owner.name} (${ROLE_LABEL[rules.owner.role] ?? rules.owner.role})` : "the GM"}.
          </Rule>
          <Rule k="Not applicable">
            Tap N/A and give a reason (like “Patio closed, rain”). The reason, who said so and the time stay on the record, and the manager sees it before signing.
          </Rule>
        </dl>
      )}
    </div>
  );
}

function Rule({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow mb-1 !text-ink-soft">{k}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
