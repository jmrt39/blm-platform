import { cn } from "../lib/utils";

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "bad" | "gold";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow mb-2 !text-ink-soft">{label}</div>
      <div
        className={cn(
          "figure text-[34px] leading-none md:text-[40px]",
          tone === "good" && "text-sage",
          tone === "bad" && "text-oxblood",
          tone === "gold" && "text-gold-deep",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[12.5px] text-ink-soft">{sub}</div>}
    </div>
  );
}

export function Delta({ cur, prev, invert, fmt }: { cur: number; prev: number; invert?: boolean; fmt?: (n: number) => string }) {
  if (!prev) return null;
  const d = (cur - prev) / prev;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={cn("font-semibold", Math.abs(d) < 0.005 ? "text-ink-soft" : good ? "text-sage" : "text-oxblood")}>
      {d > 0 ? "▲" : d < 0 ? "▼" : "•"} {fmt ? fmt(Math.abs(cur - prev)) : `${Math.abs(d * 100).toFixed(1)}%`}
    </span>
  );
}

export function StatusPill({ status, late }: { status: string; late?: boolean }) {
  const map: Record<string, string> = {
    submitted: late ? "border-oxblood/40 text-oxblood" : "border-sage/50 text-sage",
    verified: "border-gold-deep/50 text-gold-deep",
    open: late ? "border-oxblood/40 text-oxblood" : "border-paper-line text-ink-soft",
  };
  const label = status === "submitted" ? (late ? "Submitted late" : "Submitted") : status === "verified" ? "Signed · not submitted" : late ? "Past due" : "In progress";
  return <span className={cn("chip", map[status])}>{label}</span>;
}

export function Bar({ value, max, className, tone = "ink" }: { value: number; max: number; className?: string; tone?: "ink" | "gold" | "bad" }) {
  const w = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 w-full bg-paper-2", className)}>
      <div className={cn("h-full", tone === "gold" ? "bg-gold" : tone === "bad" ? "bg-oxblood" : "bg-ink")} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[2px] border border-dashed border-paper-line px-4 py-8 text-center text-[13.5px] text-ink-soft">{children}</div>;
}

/** Tiny sparkline / bar series. */
export function Spark({ data, height = 64, target }: { data: number[]; height?: number; target?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, target ?? 0) * 1.08;
  const min = Math.min(...data, target ?? Infinity) * 0.9;
  const W = 300;
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => height - ((v - min) / (max - min || 1)) * height;
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {target != null && <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="#8a7350" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={`${d} L${W} ${height} L0 ${height} Z`} fill="rgb(197 175 135 / 0.18)" />
      <path d={d} fill="none" stroke="#1c1915" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[2px] border border-paper-line p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn("rounded-[1px] px-3 py-1.5 text-[12px] font-bold tracking-wide", value === o.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
