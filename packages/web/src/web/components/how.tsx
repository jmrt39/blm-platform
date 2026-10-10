import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { METRICS, NET_SALES_RULE, type MetricKey } from "../../shared/metrics";
import { cn } from "../lib/utils";

/** "How calculated" — source, period, formula and exclusions for a figure. */
export function HowCalculated({ metric, period, extra, dark, className }: { metric: MetricKey; period?: string; extra?: React.ReactNode; dark?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const m = METRICS[metric];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn("relative inline-flex align-middle normal-case tracking-normal", className)}>
      <button
        type="button"
        aria-label={`How ${m.label.toLowerCase()} is calculated`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("ml-1 inline-flex items-center rounded-full p-0.5 opacity-70 hover:opacity-100", dark ? "text-gold" : "text-ink-soft")}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-0 top-6 z-40 block w-[300px] max-w-[80vw] rounded-[2px] border border-paper-line bg-paper p-4 text-left text-[12.5px] font-normal leading-relaxed text-ink shadow-xl"
        >
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-gold-deep">How calculated</span>
          <span className="block font-semibold">{m.label}</span>
          <span className="mb-2 block text-ink-soft">{m.what}</span>
          <Row k="Formula" v={m.formula} />
          <Row k="Source" v={m.source} />
          {period && <Row k="Period" v={period} />}
          <Row k="Excludes" v={m.exclusions} />
          {(metric === "netSales" || metric === "spendPerTicket" || metric === "serverSpend") && <Row k="Net sales" v={NET_SALES_RULE} />}
          {extra}
        </span>
      )}
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <span className="mt-1.5 block">
      <span className="font-semibold">{k}: </span>
      {v}
    </span>
  );
}
