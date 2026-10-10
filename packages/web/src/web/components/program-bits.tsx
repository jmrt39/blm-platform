import { Star } from "lucide-react";
import { MODULE_STATUS_LABEL, type ModuleStatus, type Section } from "../../shared/program";
import { STAR_LABELS } from "../../shared/library/rubrics";
import { cn } from "../lib/utils";

export function ModuleChip({ status, className }: { status: ModuleStatus; className?: string }) {
  const tone: Record<ModuleStatus, string> = {
    not_started: "",
    reading: "border-ink/30 text-ink",
    in_progress: "border-ink/30 text-ink",
    ready: "border-gold-deep/60 bg-gold/15 text-gold-deep",
    signed_off: "border-sage/50 text-sage",
  };
  return <span className={cn("chip", tone[status], className)}>{MODULE_STATUS_LABEL[status]}</span>;
}

export function RampChip({ days, className }: { days: number; className?: string }) {
  if (days >= 30) return null;
  return (
    <span className={cn("chip border-gold-deep/50 text-gold-deep", className)} title="Under 30 days. Not ranked against the team yet.">
      Ramping · day {Math.max(0, days)}
    </span>
  );
}

export function ScoreChip({ score, pass = 0.8 }: { score: number | null | undefined; pass?: number }) {
  if (score == null) return <span className="chip">Not taken</span>;
  return <span className={cn("chip", score >= pass ? "border-sage/50 text-sage" : "border-oxblood/40 text-oxblood")}>{Math.round(score * 100)}%</span>;
}

export function CertChip({ status, daysLeft }: { status: "ok" | "expiring" | "expired" | "missing"; daysLeft: number | null }) {
  if (status === "ok") return <span className="chip border-sage/50 text-sage">Current</span>;
  if (status === "missing") return <span className="chip border-oxblood/40 text-oxblood">Missing</span>;
  if (status === "expired") return <span className="chip border-oxblood/40 bg-oxblood/5 text-oxblood">Expired {Math.abs(daysLeft ?? 0)}d ago</span>;
  return <span className="chip border-gold-deep/60 text-gold-deep">Expires in {daysLeft}d</span>;
}

/** Read-only star row. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} style={{ width: size, height: size }} className={n <= Math.round(value) ? "fill-gold-deep text-gold-deep" : "text-paper-line"} />
      ))}
    </span>
  );
}

/** Tap-to-score star input (1–5), sized for a tablet. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <fieldset className="flex items-center gap-1 border-0 p-0" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}: ${STAR_LABELS[n]}`}
            onClick={() => onChange(n)}
            className="grid size-11 place-items-center rounded-[2px] hover:bg-paper-2"
          >
            <Star className={cn("size-7", n <= value ? "fill-gold-deep text-gold-deep" : "text-paper-line")} />
          </button>
        ))}
      </fieldset>
      <div className={cn("mt-1 h-4 text-[12px] font-semibold", value ? "text-ink" : "text-ink-soft/60")}>{value ? STAR_LABELS[value] : "Tap to score"}</div>
    </div>
  );
}

/** Renders a training module's sections. */
export function ModuleBody({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-9">
      {sections.map((s, i) => (
        <section key={i}>
          <h2 className="mb-3 font-display text-[24px] leading-tight">{s.h}</h2>
          {s.p && <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink">{s.p}</p>}
          {s.list && (
            <ul className="mt-3 max-w-[68ch] space-y-2">
              {s.list.map((l, j) => (
                <li key={j} className="flex gap-3 text-[14.5px] leading-relaxed">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold-deep" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
          {s.table && (
            <div className="mt-4 overflow-x-auto">
              <table className="tbl min-w-[520px]">
                <thead>
                  <tr>
                    {s.table.head.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className={k === 0 ? "font-semibold" : ""}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.say && <blockquote className="mt-4 border-l-2 border-gold-deep pl-4 font-display text-[19px] italic leading-snug">{s.say}</blockquote>}
          {s.note && <div className="mt-4 max-w-[68ch] rounded-[2px] bg-paper-2 px-4 py-3 text-[13px] text-ink-soft">{s.note}</div>}
        </section>
      ))}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b rule pb-2">
      <h2 className="font-display text-[22px] leading-none">{children}</h2>
      {aside}
    </div>
  );
}
