import { cn } from "../lib/utils";

/** The BLM monogram — the client's logo, the app's emblem everywhere.
 *  The asset is square-padded, so `size` is the box; "light" = ivory + gold for noir, "ink" = black + gold for paper. */
export function Monogram({ className, size = 40, tone = "light" }: { className?: string; size?: number; tone?: "light" | "ink" }) {
  return (
    <img
      src={tone === "ink" ? "/images/blm-monogram-ink.png" : "/images/blm-monogram.png"}
      alt="Bottom Line Multiplied"
      width={size}
      height={size}
      className={cn("select-none", className)}
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ className, light = true }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("leading-none", className)}>
      <div className={cn("font-display text-[17px] tracking-wide", light ? "text-ivory" : "text-ink")}>The Platform</div>
      <div className={cn("mt-1 text-[9.5px] font-bold uppercase tracking-[0.24em]", light ? "text-gold" : "text-gold-deep")}>
        Bottom Line Multiplied
      </div>
    </div>
  );
}
