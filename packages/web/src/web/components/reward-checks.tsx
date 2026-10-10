import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";

export type RewardCheckView = { short: string; label: string; met: boolean; value: string };
export type RewardStatusView = "eligible" | "can_earn" | "ineligible";

/** "this month", "this quarter": the period an ineligible reward is out for. */
export const PERIOD_WORD: Record<string, string> = { Monthly: "this month", "Each shift": "this month", Quarterly: "this quarter", Annual: "this year", "Every 10": "for now" };

export const STATUS_LABEL: Record<RewardStatusView, string> = { eligible: "Eligible now", can_earn: "Can still earn", ineligible: "Ineligible" };
export const STATUS_CHIP: Record<RewardStatusView, string> = {
  eligible: "border-gold-deep bg-gold/25 text-ink",
  can_earn: "border-ink/25 text-ink",
  ineligible: "border-oxblood/50 bg-oxblood/5 text-oxblood",
};

export function Tick({ met, className }: { met: boolean; className?: string }) {
  return met ? <Check className={cn("size-3.5 shrink-0 text-sage", className)} strokeWidth={3} /> : <X className={cn("size-3.5 shrink-0 text-oxblood", className)} strokeWidth={3} />;
}

/** The criteria, ticked or not, with the person's own figure against each. */
export function CheckList({ checks, title }: { checks: RewardCheckView[]; title: string }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{title}</div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-[12.5px]">
            <Tick met={c.met} className="mt-0.5" />
            <span className={cn("min-w-0 flex-1", c.met ? "text-ink" : "text-ink-soft")}>{c.label}</span>
            <span className={cn("figure shrink-0 text-[13px]", c.met ? "text-sage" : "text-ink")}>{c.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
