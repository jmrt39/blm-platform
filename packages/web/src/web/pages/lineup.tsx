import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "motion/react";
import { Check, ClipboardList, FileSignature, Megaphone, Repeat, X } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg } from "../components/bits";
import { SignatureView, SignedStamp } from "../components/signature";
import { ActionStatus, EventRow, SigField, StepChip, StrikeDots, Warn } from "../components/conduct-bits";
import { QuoteCard } from "./guests";
import { LineupBrief } from "../components/lineup-brief";
import { useGuestFeedback } from "../queries/guests";
import { useUpdates } from "../queries/updates";
import { UPDATE_KINDS, type UpdateKind } from "../../shared/program";
import { useAddEntry, useCloseLineup, useLineup, useMarkRest, useRemoveEntry, useSetEntry, useSetLineup, useStartLineup } from "../queries/lineups";
import {
  DEFAULT_CALL,
  EVENT_LABEL,
  LATE_GRACE_MIN,
  STEP_LABEL,
  SWAP_RULE,
  clock12,
  infractionsFor,
  minutesBetween,
  stepForStrikes,
  stepRank,
  type Arrival,
  type Shift,
  type Step,
} from "../../shared/conduct";
import { ROLE_LABEL } from "../../shared/domain";
import { dayLabel, errMsg, shortDay, timeOf } from "../lib/format";
import { cn } from "../lib/utils";

type Data = NonNullable<ReturnType<typeof useLineup>["data"]>;
type Entry = Data["entries"][number];

function nowHHMM(tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).formatToParts(new Date());
  return `${p.find((x) => x.type === "hour")!.value}:${p.find((x) => x.type === "minute")!.value}`;
}
/** Best guess for "arrived at" when someone is marked late: now, if now is plausibly after the call; otherwise call + 10. */
function lateDefault(call: string, now: string | null) {
  if (now) {
    const m = minutesBetween(call, now);
    if (m > LATE_GRACE_MIN && m < 240) return now;
  }
  return addMin(call, 10);
}
function addMin(hhmm: string, n: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h! * 60 + m! + n + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function LineupPage() {
  const v = useViewer();
  const tz = v.store?.timezone ?? "America/New_York";
  const [shift, setShift] = useState<Shift>(() => (Number(nowHHMM(tz).slice(0, 2)) < 15 ? "lunch" : "dinner"));
  const [date, setDate] = useState<string | undefined>(undefined);
  const q = useLineup(v.storeId, shift, date);
  const d = q.data;

  return (
    <Page
      eyebrow={
        <>
          {v.store?.name} · Store {v.store?.number}
          {v.isLeader && !v.scope && <span className="text-oxblood"> · pick a store in “Viewing” to switch</span>}
        </>
      }
      title="Line up"
      aside={
        <>
          <Seg value={shift} onChange={setShift} options={[{ value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }]} />
          <input
            type="date"
            aria-label="Date"
            className="field !h-9 !w-auto !text-[13px]"
            value={d?.date ?? ""}
            max={v.me.today ?? undefined}
            onChange={(e) => setDate(e.target.value || undefined)}
          />
          <Link href="/conduct" className="btn btn-line !h-9">
            Conduct
          </Link>
        </>
      }
    >
      {q.isLoading || !d ? (
        q.error ? <ErrorNote error={q.error} /> : <Loading />
      ) : !d.lineup ? (
        <NotStarted d={d} shift={shift} />
      ) : d.lineup.status === "open" ? (
        <Running d={d} tz={tz} />
      ) : (
        <Signed d={d} tz={tz} />
      )}
    </Page>
  );
}

function NotStarted({ d, shift }: { d: Data; shift: Shift }) {
  const start = useStartLineup();
  const v = useViewer();
  const [call, setCall] = useState(DEFAULT_CALL[shift]);
  const approved = d.swaps.filter((s) => s.status === "approved");
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="eyebrow mb-2">{dayLabel(d.date)}</div>
        <h2 className="font-display text-[28px] leading-tight">
          {shift === "lunch" ? "Lunch" : "Dinner"} line up hasn't started.
        </h2>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-ink-soft">
          Run it at the pre shift standup. Mark who's on time, who's late, and whether everyone is in dress code. Anyone with a strike signs for it on this device before you sign off.
        </p>
        {d.isToday ? (
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <span className="label">Scheduled start</span>
              <input type="time" aria-label="Scheduled start" className="field !w-40" value={call} key={shift} onChange={(e) => setCall(e.target.value)} />
            </div>
            <button disabled={start.isPending} onClick={() => start.mutate({ storeId: d.store.id, shift, callTime: call, date: d.date })} className="btn btn-ink">
              <Megaphone className="size-4" /> Start line up · {d.roster.filter((r) => !["gm", "agm", "floor_manager", "bar_manager"].includes(r.role)).length} on the roster
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <Empty>No line up was run for this shift.</Empty>
          </div>
        )}
        <div className="mt-2 text-[12px] text-ink-soft">Late means more than {LATE_GRACE_MIN} minutes after the scheduled start.</div>
        <ErrorNote error={start.error} />
        {d.isToday && (
          <div className="mt-8">
            <LineupBrief storeId={d.store.id} date={d.date} today={v.me.today ?? null} target={v.store?.ticketTarget ?? null} topics="" />
          </div>
        )}
        {approved.length > 0 && (
          <div className="mt-8">
            <div className="eyebrow mb-2">Approved swaps on this shift</div>
            <ul className="divide-y divide-paper-line border-y rule text-[13.5px]">
              {approved.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2.5">
                  <Repeat className="size-4 text-gold-deep" /> {s.fromName} → <b>{s.toName}</b> · starts {clock12(s.startTime)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <aside className="space-y-6">
        {d.pending.length > 0 && (
          <div className="rounded-[2px] border border-oxblood/30 p-5">
            <div className="eyebrow mb-2 !text-oxblood">Waiting for a signature</div>
            <ul className="space-y-1.5 text-[13px]">
              {d.pending.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <b>{e.memberName}</b> · {EVENT_LABEL[e.type]} · {shortDay(e.businessDate)}
                </li>
              ))}
            </ul>
            <Link href="/conduct" className="mt-3 inline-block text-[12.5px] font-semibold underline-offset-2 hover:underline">
              Have them sign in Conduct
            </Link>
          </div>
        )}
        <div className="rounded-[2px] bg-paper-2 p-5">
          <div className="eyebrow mb-3">Last two weeks</div>
          {!d.recent.length ? (
            <div className="text-[13px] text-ink-soft">No line ups yet.</div>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {d.recent.slice(0, 10).map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>
                    {shortDay(r.date)} · {r.shift === "lunch" ? "Lunch" : "Dinner"}
                  </span>
                  <span className={cn(r.status === "signed" ? "text-sage" : "text-oxblood")}>{r.status === "signed" ? `✓ ${r.runByName}` : "Never signed"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

const ARRIVAL_OPTS: { value: Arrival; label: string }[] = [
  { value: "on_time", label: "On time" },
  { value: "late", label: "Late" },
  { value: "no_show", label: "No show" },
  { value: "swap_unapproved", label: "Swap, no approval" },
];

function Running({ d, tz }: { d: Data; tz: string }) {
  const l = d.lineup!;
  const v = useViewer();
  const setLineup = useSetLineup();
  const markRest = useMarkRest();
  const addEntry = useAddEntry();
  const close = useCloseLineup();
  const [sigs, setSigs] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<Record<string, boolean>>({});
  const [mgrSig, setMgrSig] = useState("");
  const onSig = useCallback((id: string, val: string) => setSigs((s) => ({ ...s, [id]: val })), []);
  const onMgr = useCallback((_: string, val: string) => setMgrSig(val), []);

  const unmarked = d.entries.filter((e) => e.arrival === "pending" || ((e.arrival === "on_time" || e.arrival === "late") && e.uniformOk == null));
  const withInf = d.entries.map((e) => ({ e, inf: infractionsFor(e, l.shift) })).filter((x) => x.inf.length);
  const present = withInf.filter((x) => x.e.arrival === "on_time" || x.e.arrival === "late");
  const absent = withInf.filter((x) => !(x.e.arrival === "on_time" || x.e.arrival === "late"));
  const missingAck = present.filter((x) => !sigs[x.e.id] && !refused[x.e.id]);
  const notOn = d.roster.filter((r) => !d.entries.some((e) => e.memberId === r.id));
  const counts = {
    onTime: d.entries.filter((e) => e.arrival === "on_time" || (e.arrival === "late" && (e.minutesLate ?? 0) <= LATE_GRACE_MIN)).length,
    late: d.entries.filter((e) => e.arrival === "late" && (e.minutesLate ?? 0) > LATE_GRACE_MIN).length,
    dress: d.entries.filter((e) => e.uniformOk === false).length,
    out: d.entries.filter((e) => e.arrival === "no_show" || e.arrival === "swap_unapproved").length,
  };

  return (
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex gap-6 md:border-r md:pr-8 rule">
          <div>
            <div className="eyebrow mb-1">Scheduled start</div>
            <input
              type="time"
              aria-label="Scheduled start"
              className="field !h-10 !w-36 figure !text-[18px]"
              defaultValue={l.callTime}
              key={l.callTime}
              onBlur={(e) => e.target.value && e.target.value !== l.callTime && setLineup.mutate({ id: l.id, callTime: e.target.value })}
            />
            <div className="mt-1 text-[11.5px] text-ink-soft">Late after {clock12(addMin(l.callTime, LATE_GRACE_MIN))}</div>
          </div>
          <div className="grid grid-cols-4 gap-4 self-start">
            <Mini label="On time" n={counts.onTime} />
            <Mini label="Late" n={counts.late} bad />
            <Mini label="Dress code" n={counts.dress} bad />
            <Mini label="Out" n={counts.out} bad />
          </div>
        </div>
        <div>
          <span className="label">Topics · specials, 86 list, VIPs, focus</span>
          <textarea
            aria-label="Topics"
            className="field min-h-[72px] !py-2 text-[13.5px]"
            key={l.topics}
            defaultValue={l.topics}
            placeholder="Tonight's focus: suggest the half-bottle list at every two-top. 86 the halibut. Party of 12 at 7:30, nut allergy on table 4."
            onBlur={(e) => e.target.value !== l.topics && setLineup.mutate({ id: l.id, topics: e.target.value })}
          />
        </div>
      </div>

      <LineupBrief
        storeId={l.storeId}
        date={d.date}
        today={v.me.today ?? null}
        target={v.store?.ticketTarget ?? null}
        topics={l.topics}
        onAdd={(text) => setLineup.mutate({ id: l.id, topics: [l.topics.trim(), text].filter(Boolean).join("\n") })}
      />

      <PreShift d={d} />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">
            Roll call · {d.entries.length} {d.entries.length === 1 ? "person" : "people"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {notOn.length > 0 && (
              <select
                aria-label="Add someone"
                className="field !h-9 !w-auto !text-[13px]"
                value=""
                onChange={(e) => e.target.value && addEntry.mutate({ lineupId: l.id, memberId: e.target.value })}
              >
                <option value="">+ Add someone…</option>
                {notOn.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {ROLE_LABEL[r.role]}
                  </option>
                ))}
              </select>
            )}
            {unmarked.length > 0 && (
              <button disabled={markRest.isPending} onClick={() => markRest.mutate({ id: l.id })} className="btn btn-line !h-9 !text-[12.5px]">
                <Check className="size-4" /> Everyone else on time & in uniform
              </button>
            )}
          </div>
        </div>
        <ErrorNote error={addEntry.error ?? markRest.error} />
        {!d.entries.length ? (
          <Empty>No one on this line up. Add the people working this shift.</Empty>
        ) : (
          <ul className="divide-y divide-paper-line border-y border-ink">
            {d.entries.map((e) => (
              <EntryRow key={e.id} e={e} standing={d.standing[e.memberId]} tz={tz} isToday={d.isToday} uniformItems={d.uniformItems as readonly string[]} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[2px] border border-ink p-5 md:p-7">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="size-4 text-gold-deep" />
          <div className="eyebrow">Sign off the line up</div>
        </div>
        {unmarked.length > 0 ? (
          <p className="text-[13.5px] text-ink-soft">
            Mark arrival and uniform for {unmarked.map((e) => e.name.split(" ")[0]).join(", ")} to sign off.
          </p>
        ) : (
          <div className="space-y-8">
            {present.length === 0 ? (
              <p className="text-[13.5px] text-ink-soft">No strikes for anyone here. Sign below.</p>
            ) : (
              <div className="space-y-6">
                <p className="text-[13.5px] text-ink-soft">Hand the device to each person. They read what's being recorded and sign with their finger.</p>
                {present.map(({ e, inf }) => (
                  <div key={e.id} className="grid gap-4 border-t rule pt-5 md:grid-cols-[1fr_1.2fr]">
                    <div>
                      <div className="font-display text-[20px]">{e.name}</div>
                      <ul className="mt-2 space-y-1.5 text-[13px]">
                        {inf.map((i) => (
                          <li key={i.type} className="flex gap-2">
                            <span className="font-semibold text-oxblood">{EVENT_LABEL[i.type]}.</span>
                            <span className="text-ink-soft">{i.detail}</span>
                          </li>
                        ))}
                      </ul>
                      <StandingNote s={d.standing[e.memberId]} adding={inf.length} />
                      <p className="mt-3 text-[12px] italic text-ink-soft">
                        “I understand this is being recorded as {inf.length === 1 ? "a strike" : `${inf.length} strikes`} on my record for the next 90 days.”
                      </p>
                    </div>
                    <div>
                      {refused[e.id] ? (
                        <div className="grid h-[140px] place-items-center rounded-[2px] border border-dashed border-oxblood/50 text-center text-[13px] text-oxblood">
                          Refused to sign, witnessed by {v.me.accessName}.
                          <br />
                          The strike is still recorded.
                        </div>
                      ) : (
                        <SigField id={e.id} onSig={onSig} caption={`Signed · ${e.name}`} />
                      )}
                      <label className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                        <input aria-label="Refused to sign"
                          type="checkbox"
                          className="accent-[#7a2a26]"
                          checked={!!refused[e.id]}
                          onChange={(ev) => {
                            setRefused((r) => ({ ...r, [e.id]: ev.target.checked }));
                            if (ev.target.checked) setSigs((s) => ({ ...s, [e.id]: "" }));
                          }}
                        />
                        {e.name.split(" ")[0]} refused to sign
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {absent.length > 0 && (
              <Warn>
                {absent.map((x) => x.e.name).join(", ")} {absent.length === 1 ? "isn't" : "aren't"} here to sign. The strike is recorded now and waits in Conduct for their signature next shift.
              </Warn>
            )}
            <div className="grid gap-4 border-t border-ink pt-6 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="font-display text-[20px]">{v.me.accessName}</div>
                <div className="text-[12.5px] text-ink-soft">{ROLE_LABEL[v.me.accessRole] ?? v.me.accessRole} · running the line up</div>
                <p className="mt-3 text-[12px] text-ink-soft">By signing you confirm the roll call above is accurate.</p>
              </div>
              <div>
                <SigField id="mgr" onSig={onMgr} caption={`Line up run by · ${v.me.accessName}`} />
                <ErrorNote error={close.error} />
                <button
                  disabled={!mgrSig || missingAck.length > 0 || close.isPending}
                  onClick={() =>
                    close.mutate({
                      id: l.id,
                      signature: mgrSig,
                      acks: present.map(({ e }) => ({ entryId: e.id, signature: sigs[e.id] || undefined, refused: !!refused[e.id] })),
                    })
                  }
                  className="btn btn-ink mt-3 w-full"
                >
                  {missingAck.length ? `Waiting on ${missingAck.map((x) => x.e.name.split(" ")[0]).join(", ")}` : "Sign off line up"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start gap-2 text-[12px] text-ink-soft">
        <Repeat className="mt-0.5 size-3.5 shrink-0 text-gold-deep" />
        <span>
          <b className="text-ink">Shift swaps:</b> {SWAP_RULE}{" "}
          <Link href="/conduct/swap" className="font-semibold text-ink underline-offset-2 hover:underline">
            Log a swap
          </Link>
        </span>
      </div>
    </div>
  );
}

/** What the team hears before doors: tonight's pinned guest quote, the latest update, 86 list and VIPs. */
function PreShift({ d }: { d: Data }) {
  const l = d.lineup!;
  const v = useViewer();
  const setLineup = useSetLineup();
  const fb = useGuestFeedback(v.storeId);
  const ups = useUpdates(v.storeId);
  const pinned = (fb.data ?? []).find((f) => f.pinnedToday) ?? null;
  const latest = (ups.data ?? [])[0] ?? null;
  const field = (key: "specials" | "eightySix" | "vips", label: string, ph: string) => (
    <div>
      <span className="label">{label}</span>
      <textarea
        aria-label={label}
        className="field min-h-[84px] !py-2 text-[13.5px]"
        defaultValue={l[key]}
        key={l.id + key}
        placeholder={ph}
        onBlur={(e) => e.target.value !== l[key] && setLineup.mutate({ id: l.id, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <div className="rounded-[2px] border rule p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="eyebrow">Pre-shift board</div>
        <div className="text-[11.5px] text-ink-soft">Read it out at line up. Saves as you type.</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {pinned ? (
            <QuoteCard f={pinned} compact />
          ) : (
            <Link href="/guests" className="block rounded-[2px] border border-dashed border-paper-line px-4 py-5 text-[13px] text-ink-soft hover:border-ink">
              No guest quote pinned for tonight. Pick one from Guest feedback.
            </Link>
          )}
          {latest && (
            <Link href={`/updates/${latest.id}`} className="block rounded-[2px] bg-paper-2 px-4 py-3 hover:bg-paper-2/70">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold-deep">
                Latest update · {UPDATE_KINDS[latest.kind as UpdateKind]}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold">{latest.title}</div>
              <div className="text-[12px] text-ink-soft">
                {latest.readCount}/{latest.audience} read
                {latest.quizCount > 0 && ` · ${latest.passedCount} passed the check`}
              </div>
            </Link>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {field("specials", "Specials", "Dover sole for two, 2019 Chablis by the glass")}
          {field("eightySix", "86 list", "Halibut, the Barolo half bottle")}
          {field("vips", "VIPs and notes", "Hendersons at 7:30, table 12, anniversary. Nut allergy on table 4.")}
        </div>
      </div>
    </div>
  );
}

function StandingNote({ s, adding }: { s: { strikes: number; step: Step | null } | undefined; adding: number }) {
  if (!s) return null;
  const after = s.strikes + adding;
  // Only a step above the one already on file opens a new write-up.
  const target = stepForStrikes(after);
  const opens = target && stepRank(target) > stepRank(s.step) ? target : null;
  return (
    <div className="mt-3 flex items-center gap-3 text-[12px]">
      <StrikeDots n={after} />
      <span className={cn(after >= 3 ? "font-semibold text-oxblood" : "text-ink-soft")}>
        {after} in 90 days{opens ? `, opens a ${STEP_LABEL[opens].toLowerCase()} write-up` : ""}
      </span>
    </div>
  );
}

function Mini({ label, n, bad }: { label: string; n: number; bad?: boolean }) {
  return (
    <div>
      <div className={cn("figure text-[28px] leading-none", bad && n > 0 && "text-oxblood")}>{n}</div>
      <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</div>
    </div>
  );
}

function EntryRow({
  e,
  standing,
  tz,
  isToday,
  uniformItems,
}: {
  e: Entry;
  standing: { strikes: number; step: Step | null } | undefined;
  tz: string;
  isToday: boolean;
  uniformItems: readonly string[];
}) {
  const set = useSetEntry();
  const remove = useRemoveEntry();
  const present = e.arrival === "on_time" || e.arrival === "late";
  const mins = e.arrival === "late" && e.arrivedAt ? minutesBetween(e.scheduledStart, e.arrivedAt) : null;
  const strikeLate = mins != null && mins > LATE_GRACE_MIN;
  const missing = useMemo(() => new Set(e.uniformMissing), [e.uniformMissing]);

  if (e.arrival === "swapped_out")
    return (
      <li className="flex items-center gap-3 py-3 text-[13.5px] text-ink-soft">
        <Repeat className="size-4 text-gold-deep" />
        <span>
          <b className="text-ink">{e.name}</b> swapped out on an approved swap, <b className="text-ink">{e.coverName}</b> is covering.
        </span>
      </li>
    );

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="w-full min-w-[180px] sm:w-52">
          <div className="flex items-center gap-2">
            <Link href={`/team/${e.memberId}`} className="text-[15px] font-semibold hover:underline">
              {e.name}
            </Link>
            {standing?.step && <StepChip step={standing.step} />}
          </div>
          <div className="text-[12px] text-ink-soft">
            {ROLE_LABEL[e.role]} · {clock12(e.scheduledStart)}
            {e.swapId && " · covering"}
          </div>
          {standing && standing.strikes > 0 && (
            <div className="mt-1">
              <StrikeDots n={standing.strikes} />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chips
              value={e.arrival}
              options={ARRIVAL_OPTS}
              onChange={(a) =>
                set.mutate({
                  entryId: e.id,
                  arrival: a,
                  ...(a === "late" && !e.arrivedAt ? { arrivedAt: lateDefault(e.scheduledStart, isToday ? nowHHMM(tz) : null) } : {}),
                })
              }
            />
            {e.arrival === "late" && (
              <span className="flex items-center gap-2 text-[12.5px]">
                arrived
                <input
                  type="time"
                  aria-label={`${e.name} arrived at`}
                  className="field !h-8 !w-32 !text-[13px]"
                  defaultValue={e.arrivedAt ?? ""}
                  key={e.arrivedAt}
                  onBlur={(ev) => ev.target.value && ev.target.value !== e.arrivedAt && set.mutate({ entryId: e.id, arrivedAt: ev.target.value })}
                />
                {mins != null && (
                  <span className={cn("font-semibold", strikeLate ? "text-oxblood" : "text-sage")}>
                    {mins <= 0 ? "before the start, not late" : `${mins} min late`}
                    {!strikeLate && mins > 0 && ` · within ${LATE_GRACE_MIN}-min grace`}
                  </span>
                )}
              </span>
            )}
            {e.arrival === "swap_unapproved" && (
              <input
                aria-label="Who covered"
                className="field !h-8 !w-48 !text-[13px]"
                placeholder="Who covered?"
                defaultValue={e.coverName ?? ""}
                onBlur={(ev) => ev.target.value !== (e.coverName ?? "") && set.mutate({ entryId: e.id, coverName: ev.target.value || null })}
              />
            )}
          </div>
          {present && (
            <div className="flex flex-wrap items-center gap-2">
              <Chips
                value={e.uniformOk == null ? "" : e.uniformOk ? "ok" : "no"}
                options={[
                  { value: "ok", label: "In uniform" },
                  { value: "no", label: "Out of dress code" },
                ]}
                onChange={(u) => set.mutate({ entryId: e.id, uniformOk: u === "ok" })}
              />
              <AnimatePresence>
                {e.uniformOk === false && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5">
                    {uniformItems.map((it) => (
                      <button
                        key={it}
                        onClick={() => {
                          const next = new Set(missing);
                          if (next.has(it)) next.delete(it);
                          else next.add(it);
                          set.mutate({ entryId: e.id, uniformMissing: [...next] });
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11.5px]",
                          missing.has(it) ? "border-oxblood bg-oxblood/10 font-semibold text-oxblood" : "border-paper-line text-ink-soft hover:border-ink-soft",
                        )}
                      >
                        {missing.has(it) ? "✕ " : ""}
                        {it}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {set.error && <div className="text-[12px] text-oxblood">{errMsg(set.error)}</div>}
        </div>
        <button aria-label={`Remove ${e.name}`} onClick={() => remove.mutate({ entryId: e.id })} className="text-ink-soft/60 hover:text-oxblood">
          <X className="size-4" />
        </button>
      </div>
    </li>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T | ""; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value === o.value;
        const bad = o.value !== "on_time" && o.value !== "ok";
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[2px] border px-3 py-1.5 text-[12px] font-bold tracking-wide transition-colors",
              on ? (bad ? "border-oxblood bg-oxblood text-paper" : "border-ink bg-ink text-paper") : "border-paper-line text-ink-soft hover:border-ink-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Signed({ d, tz }: { d: Data; tz: string }) {
  const l = d.lineup!;
  const v = useViewer();
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="eyebrow mb-1">{dayLabel(d.date)}</div>
          <h2 className="font-display text-[28px]">
            {l.shift === "lunch" ? "Lunch" : "Dinner"} line up · {clock12(l.callTime)}
          </h2>
          {l.topics && <p className="mt-3 max-w-xl whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{l.topics}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <SignedStamp name={l.runByName ?? ""} when={timeOf(l.signedAt, tz)} />
          <SignatureView value={l.signature} className="h-10" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Scheduled</th>
              <th>Arrival</th>
              <th>Uniform</th>
            </tr>
          </thead>
          <tbody>
            {d.entries.map((e) => (
              <tr key={e.id}>
                <td className="font-semibold">
                  <Link href={`/team/${e.memberId}`} className="hover:underline">
                    {e.name}
                  </Link>
                </td>
                <td className="text-ink-soft">{ROLE_LABEL[e.role]}</td>
                <td>{clock12(e.scheduledStart)}</td>
                <td className={cn(e.arrival === "late" && (e.minutesLate ?? 0) > LATE_GRACE_MIN && "font-semibold text-oxblood", (e.arrival === "no_show" || e.arrival === "swap_unapproved") && "font-semibold text-oxblood")}>
                  {e.arrival === "on_time"
                    ? "On time"
                    : e.arrival === "late"
                      ? `${clock12(e.arrivedAt)} · ${e.minutesLate} min${(e.minutesLate ?? 0) <= LATE_GRACE_MIN ? " (grace)" : ""}`
                      : e.arrival === "no_show"
                        ? "No show"
                        : e.arrival === "swapped_out"
                          ? `Swapped · ${e.coverName}`
                          : e.arrival === "swap_unapproved"
                            ? `Unapproved swap${e.coverName ? ` · ${e.coverName}` : ""}`
                            : "·"}
                </td>
                <td className={cn(e.uniformOk === false && "font-semibold text-oxblood")}>
                  {e.uniformOk == null ? "·" : e.uniformOk ? "✓" : e.uniformMissing.length ? e.uniformMissing.join(", ") : "Out of code"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.actions.length > 0 && (
        <div className="space-y-2">
          <div className="eyebrow !text-oxblood">Write ups this line up opened</div>
          {d.actions.map((a) => (
            <Link key={a.id} href={`/conduct/write-up/${a.id}`} className="flex items-center justify-between rounded-[2px] border border-oxblood/40 px-4 py-3 hover:bg-oxblood/5">
              <span className="flex items-center gap-2.5 text-[14px]">
                <FileSignature className="size-4 text-oxblood" />
                <b>{a.memberName}</b> · {STEP_LABEL[a.step]}
              </span>
              <ActionStatus status={a.status} step={a.step} />
            </Link>
          ))}
        </div>
      )}
      <div>
        <div className="eyebrow mb-2">Recorded at this line up</div>
        {!d.events.length ? (
          <Empty>No strikes. Everyone on time and in uniform.</Empty>
        ) : (
          <ul className="divide-y divide-paper-line border-y rule">
            {d.events.map((e) => (
              <EventRow key={e.id} e={e} showName canExcuse={v.isManager} />
            ))}
          </ul>
        )}
      </div>
      <Link href="/conduct" className="btn btn-line">
        Open conduct for the store
      </Link>
    </div>
  );
}
