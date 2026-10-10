import { useCallback, useState } from "react";
import { Check, GraduationCap, Minus, Trash2, X } from "lucide-react";
import { ErrorNote } from "./shell";
import { SigField } from "./conduct-bits";
import { usePlan, usePlanPrefill, usePlanSetup, useLogPlanShift, useRemovePlanShift, useGraduatePlan } from "../queries/plans";
import { PLAN_AVERAGE, PLAN_CHECKS, PLAN_CHECK_LABEL, PLAN_MODES, PLAN_MODE_HELP, PLAN_MODE_LABEL, PLAN_SHIFTS, SHIFT_LABEL, planScore, planShiftMet } from "../../shared/conduct";
import type { PlanCheck, PlanChecks, PlanMode, Shift } from "../../shared/conduct";
import { dayLabel, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

/** The two checks only a manager can judge. Everything else the platform tries to fill in. */
const JUDGED: readonly PlanCheck[] = ["standards", "improvement"];

/** The performance plan on a write up: how it's judged, the shifts logged against it, and graduation. */
export function PlanPanel({ actionId, firstName }: { actionId: string; firstName: string }) {
  const q = usePlan(actionId);
  if (q.isLoading) return <div className="text-[13px] text-ink-soft">Loading the plan…</div>;
  if (q.error || !q.data) return <ErrorNote error={q.error} what="The plan" />;
  const p = q.data;
  const pct = Math.round((p.progress.count / PLAN_SHIFTS) * 100);

  return (
    <section className="space-y-6 border-t border-ink pt-6" aria-label="Performance plan">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Performance plan · road back</div>
          <div className="font-display text-[26px] leading-tight">{p.progress.summary}</div>
          <div className="mt-1 text-[12.5px] text-ink-soft">
            {PLAN_MODE_LABEL[p.mode]}
            {!p.modeChosen && " (until a manager picks)"}
          </div>
        </div>
        {p.graduatedOn ? (
          <span className="chip border-sage/60 text-sage">
            <GraduationCap className="size-3.5" /> Graduated
          </span>
        ) : p.progress.ready ? (
          <span className="chip border-gold-deep/60 text-gold-deep">Ready to graduate</span>
        ) : null}
      </div>

      <div className="grid grid-cols-10 gap-1" aria-label={`${pct}% of the way`}>
        {Array.from({ length: PLAN_SHIFTS }, (_, i) => (
          <div key={i} className={cn("h-2 rounded-[1px]", i < p.progress.count ? (p.graduatedOn ? "bg-sage" : "bg-gold-deep") : "bg-paper-line")} />
        ))}
      </div>

      {p.graduatedOn && (
        <div className="rounded-[2px] bg-paper-2 p-4 text-[13.5px]">
          Signed off by <b>{p.graduatedByName}</b> on {dayLabel(p.graduatedOn, { month: "long", day: "numeric", year: "numeric" })}. {firstName} is back to zero from that day: earlier strikes and write
          ups stop counting, and rewards open again from the next full month.
        </div>
      )}

      {p.can.manage ? <PlanSetup actionId={actionId} mode={p.mode} focus={p.focus ?? ""} /> : p.focus ? <FocusView focus={p.focus} /> : null}

      {!p.graduatedOn && p.status !== "final" && <div className="text-[13px] text-ink-soft">Shifts are logged against the plan once it has been signed.</div>}

      {p.can.log && <LogShift key={p.shifts.length} actionId={actionId} since={p.since} today={p.today} firstName={firstName} />}

      <ShiftList shifts={p.shifts} canRemove={p.can.manage} />

      {p.can.graduate ? (
        <Graduate actionId={actionId} firstName={firstName} />
      ) : p.can.manage && !p.graduatedOn ? (
        <p className="text-[12.5px] text-ink-soft">
          Graduation unlocks at {PLAN_SHIFTS} {p.mode === "in_a_row" ? "excellent shifts in a row" : p.mode === "total" ? "excellent shifts" : `shifts averaging ${PLAN_AVERAGE}% or better`}. Now: {p.progress.summary}.
        </p>
      ) : null}
    </section>
  );
}

function FocusView({ focus }: { focus: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">What the plan is for</div>
      <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{focus}</p>
    </div>
  );
}

function PlanSetup({ actionId, mode, focus }: { actionId: string; mode: PlanMode; focus: string }) {
  const setup = usePlanSetup();
  const [m, setM] = useState<PlanMode>(mode);
  const [f, setF] = useState(focus);
  const dirty = m !== mode || f.trim() !== focus.trim();
  return (
    <div className="space-y-3 rounded-[2px] bg-paper-2 p-5">
      <div className="eyebrow">How {PLAN_SHIFTS} shifts are judged</div>
      <div className="grid gap-2 md:grid-cols-3">
        {PLAN_MODES.map((k) => (
          <label key={k} className={cn("cursor-pointer rounded-[2px] border p-3 text-[13px]", m === k ? "border-ink bg-paper" : "border-paper-line")}>
            <span className="flex items-center gap-2 font-semibold">
              <input type="radio" name={`mode-${actionId}`} className="accent-[#7a2a26]" checked={m === k} onChange={() => setM(k)} aria-label={PLAN_MODE_LABEL[k]} />
              {PLAN_MODE_LABEL[k]}
            </span>
            <span className="mt-1 block text-[12px] text-ink-soft">{PLAN_MODE_HELP[k]}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="eyebrow mb-1 block">What the plan is for</span>
        <textarea
          aria-label="What the plan is for"
          className="field min-h-[80px] !py-2 text-[13.5px]"
          placeholder="On the floor by 4:00 in full uniform. Two wine suggestions at every table. Check backs within two minutes of the entree."
          value={f}
          onChange={(e) => setF(e.target.value)}
        />
      </label>
      <ErrorNote error={setup.error} />
      <button type="button" className="btn btn-ink" disabled={!dirty || setup.isPending} onClick={() => setup.mutate({ actionId, mode: m, focus: f })}>
        {setup.isPending ? "Saving…" : "Save plan setup"}
      </button>
    </div>
  );
}

type Tri = boolean | null;

function LogShift({ actionId, since, today, firstName }: { actionId: string; since: string; today: string; firstName: string }) {
  const log = useLogPlanShift();
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<Shift>("dinner");
  const [edits, setEdits] = useState<{ key: string; checks: Partial<PlanChecks> }>({ key: "", checks: {} });
  const [note, setNote] = useState("");
  const [sig, setSig] = useState("");
  const onSig = useCallback((_: string, v: string) => setSig(v), []);
  const key = `${date}|${shift}`;
  const pre = usePlanPrefill(actionId, date, shift, date >= since && date <= today);
  const base = pre.data?.checks ?? (Object.fromEntries(PLAN_CHECKS.map((k) => [k, null])) as PlanChecks);
  const checks: PlanChecks = { ...base, ...(edits.key === key ? edits.checks : {}) };
  const set = (k: PlanCheck, v: Tri) => setEdits({ key, checks: { ...(edits.key === key ? edits.checks : {}), [k]: v } });
  const src = pre.data?.sources;
  const hint: Partial<Record<PlanCheck, string>> = src
    ? {
        onTime: src.lineup ? (src.arrival === "late" ? `Line up: ${src.minutesLate ?? "?"} minutes late` : `Line up: ${src.arrival?.replace("_", " ") ?? "not marked"}`) : "Not on that line up",
        dress: src.lineup ? (src.uniformMissing.length ? `Missing: ${src.uniformMissing.join(", ")}` : "Uniform check from the line up") : "No uniform check that shift",
        noStrike: src.strikes.length ? src.strikes.join("; ") : "No strike on the record that day",
        duties: src.linesInitialled ? `${src.linesInitialled} checklist lines initialled` : "No checklist lines initialled",
        grade: src.grade == null ? "Not graded that shift, so it's skipped" : `Floor grade ${src.grade.toFixed(1)}`,
      }
    : {};
  const ready = checks.standards != null && checks.improvement != null && sig.length > 0;
  const met = planShiftMet(checks);

  return (
    <div className="space-y-4 rounded-[2px] border border-ink p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="eyebrow">Log a shift for {firstName}</div>
        <div className="flex gap-2">
          <input type="date" aria-label="Shift date" className="field !w-auto" min={since} max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <select aria-label="Shift" className="field !w-auto" value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
            <option value="dinner">{SHIFT_LABEL.dinner}</option>
            <option value="lunch">{SHIFT_LABEL.lunch}</option>
          </select>
        </div>
      </div>
      <p className="text-[12px] text-ink-soft">{pre.isFetching ? "Reading the line up, checklists and grades…" : "Filled in from the line up, conduct record, checklists and floor grades. Change anything that's wrong."}</p>
      <ul className="divide-y divide-paper-line border-y rule">
        {PLAN_CHECKS.map((k) => (
          <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 text-[13px]">
              <div className="font-semibold">
                {PLAN_CHECK_LABEL[k]}
                {JUDGED.includes(k) && <span className="ml-1 text-oxblood">*</span>}
              </div>
              {hint[k] && <div className="text-[11.5px] text-ink-soft">{hint[k]}</div>}
              {JUDGED.includes(k) && <div className="text-[11.5px] text-ink-soft">Your call as the manager.</div>}
            </div>
            <TriPick label={PLAN_CHECK_LABEL[k]} value={checks[k]} onChange={(v) => set(k, v)} allowSkip={k === "grade" || !JUDGED.includes(k)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="figure text-[22px]">{planScore(checks)}%</span>
        <span className={cn("chip", met ? "border-sage/60 text-sage" : "border-oxblood/50 text-oxblood")}>{met ? "Excellent shift" : "Falls short"}</span>
      </div>
      <input aria-label="Note" className="field" placeholder="Note (optional): what you saw" value={note} onChange={(e) => setNote(e.target.value)} />
      <SigField id="plan-shift" onSig={onSig} caption="Manager signature" />
      <ErrorNote error={log.error} />
      <button
        type="button"
        className="btn btn-ink w-full"
        disabled={!ready || log.isPending}
        onClick={() => log.mutate({ actionId, date, shift, checks, note, signature: sig })}
      >
        {log.isPending ? "Saving…" : "Sign and log shift"}
      </button>
      {!ready && <p className="text-[11.5px] text-ink-soft">Answer the two starred checks and sign to log it.</p>}
    </div>
  );
}

function TriPick({ label, value, onChange, allowSkip }: { label: string; value: Tri; onChange: (v: Tri) => void; allowSkip: boolean }) {
  const opts: { v: Tri; t: string; Icon: typeof Check; on: string }[] = [
    { v: true, t: "Yes", Icon: Check, on: "border-sage bg-sage/10 text-sage" },
    { v: false, t: "No", Icon: X, on: "border-oxblood bg-oxblood/10 text-oxblood" },
  ];
  if (allowSkip) opts.push({ v: null, t: "Skip", Icon: Minus, on: "border-ink-soft bg-paper-2 text-ink-soft" });
  return (
    <fieldset className="flex gap-1 border-0 p-0" aria-label={label}>
      {opts.map((o) => (
        <button
          key={o.t}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn("flex items-center gap-1 rounded-[2px] border px-2.5 py-1 text-[12px] font-semibold", value === o.v ? o.on : "border-paper-line text-ink-soft")}
        >
          <o.Icon className="size-3.5" /> {o.t}
        </button>
      ))}
    </fieldset>
  );
}

type ShiftRow = { id: string; businessDate: string; shift: Shift; score: number; met: boolean; note: string; managerName: string; checks: PlanChecks };

function ShiftList({ shifts, canRemove }: { shifts: ShiftRow[]; canRemove: boolean }) {
  const rm = useRemovePlanShift();
  if (!shifts.length) return <div className="text-[13px] text-ink-soft">No shifts logged against the plan yet.</div>;
  return (
    <div>
      <div className="eyebrow mb-2">Shifts logged · {shifts.length}</div>
      <ul className="divide-y divide-paper-line border-y rule">
        {[...shifts].reverse().map((x) => {
          const missed = PLAN_CHECKS.filter((k) => x.checks[k] === false);
          return (
            <li key={x.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
              <div className="min-w-0">
                <div>
                  <b>{shortDay(x.businessDate)}</b> <span className="text-ink-soft">· {SHIFT_LABEL[x.shift]} · {x.managerName}</span>
                </div>
                {missed.length > 0 && <div className="text-[12px] text-oxblood">Missed: {missed.map((k) => PLAN_CHECK_LABEL[k].toLowerCase()).join(", ")}</div>}
                {x.note && <div className="text-[12px] italic text-ink-soft">“{x.note}”</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="figure">{x.score}%</span>
                <span className={cn("chip", x.met ? "border-sage/60 text-sage" : "border-oxblood/50 text-oxblood")}>{x.met ? "Excellent" : "Short"}</span>
                {canRemove && (
                  <button type="button" aria-label="Remove shift" className="text-ink-soft hover:text-oxblood" disabled={rm.isPending} onClick={() => confirm("Remove this shift from the plan?") && rm.mutate({ id: x.id })}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={rm.error} />
    </div>
  );
}

function Graduate({ actionId, firstName }: { actionId: string; firstName: string }) {
  const g = useGraduatePlan();
  const [sig, setSig] = useState("");
  const onSig = useCallback((_: string, v: string) => setSig(v), []);
  return (
    <div className="rounded-[2px] bg-noir p-5 text-ivory">
      <div className="eyebrow mb-2 flex items-center gap-2 !text-gold">
        <GraduationCap className="size-4" /> Graduate {firstName}
      </div>
      <p className="mb-3 text-[13.5px] text-[#cfc6b8]">
        Signing puts {firstName} back to zero today. Strikes and write ups before today stop counting, and rewards open again from the next full month.
      </p>
      <div className="rounded-[2px] bg-paper p-2 text-ink">
        <SigField id="graduate" onSig={onSig} caption="Manager signature" />
      </div>
      <ErrorNote error={g.error} />
      <button type="button" className="btn btn-gold mt-3 w-full" disabled={!sig || g.isPending} onClick={() => g.mutate({ actionId, signature: sig })}>
        {g.isPending ? "Signing…" : "Sign off graduation"}
      </button>
    </div>
  );
}
