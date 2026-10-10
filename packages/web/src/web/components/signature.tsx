import { useEffect, useRef, useState } from "react";
import { Monogram } from "./monogram";
import { cn } from "../lib/utils";

type Sig = { w: number; h: number; d: string };

export function parseSig(raw: string | null | undefined): Sig | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Sig;
    return s.d ? s : null;
  } catch {
    return null;
  }
}

/** Renders a stored signature (JSON {w,h,d}). */
export function SignatureView({ value, className }: { value: string | null | undefined; className?: string }) {
  const s = parseSig(value);
  if (!s) return null;
  return (
    <svg viewBox={`0 0 ${s.w} ${s.h}`} className={cn("h-12 w-auto", className)} preserveAspectRatio="xMinYMid meet">
      <path d={s.d} fill="none" stroke="#1c2a4a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Draw-to-sign pad. Emits JSON {w,h,d} or "" when cleared. */
export function SignaturePad({ onChange, caption = "Verified by" }: { onChange: (v: string) => void; caption?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const drawing = useRef(false);
  const W = 520;
  const H = 140;

  useEffect(() => {
    const d = paths.join(" ");
    onChange(d.length > 20 ? JSON.stringify({ w: W, h: H, d }) : "");
  }, [paths, onChange]);

  const pt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H].map((n) => n.toFixed(1)).join(" ");
  };

  return (
    <div className="select-none">
      <div className="relative rounded-[2px] border border-paper-line bg-[#fbf7ef]">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[140px] w-full touch-none cursor-crosshair"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            drawing.current = true;
            setPaths((p) => [...p, `M${pt(e)}`]);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = pt(e);
            setPaths((ps) => {
              const copy = ps.slice();
              copy[copy.length - 1] += ` L${p}`;
              return copy;
            });
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        >
          <line x1="24" x2={W - 24} y1={H - 34} y2={H - 34} stroke="#cbbd9f" strokeDasharray="3 4" />
          <text x="24" y={H - 14} fontSize="11" fill="#9a8e7c" fontFamily="Manrope" letterSpacing="2">
            {caption.toUpperCase()}
          </text>
          <text x="24" y={H - 44} fontSize="22" fill="#cbbd9f" fontFamily="Bodoni Moda">
            ✕
          </text>
          <path d={paths.join(" ")} fill="none" stroke="#1c2a4a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!paths.length && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] italic text-ink-soft/70 font-display">
            Sign here with your finger or mouse
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-end">
        <button type="button" className="text-[12px] font-semibold text-ink-soft underline-offset-2 hover:underline" onClick={() => setPaths([])}>
          Clear signature
        </button>
      </div>
    </div>
  );
}

/** The "Signed off" seal. */
export function SignedStamp({ name, when, label = "Signed off", className }: { name: string; when: string; label?: string; className?: string }) {
  return (
    <div className={cn("inline-flex -rotate-[4deg] items-center gap-3 rounded-[3px] border-2 border-oxblood/80 p-[3px]", className)}>
      <div className="flex items-center gap-3 rounded-[2px] border border-oxblood/60 px-3 py-2">
        <div className="grid size-11 place-items-center rounded-full bg-noir">
          <Monogram size={30} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[19px] font-semibold uppercase tracking-[0.12em] text-oxblood">{label}</div>
          <div className="text-[11px] font-semibold text-oxblood/80">
            {name} · {when}
          </div>
        </div>
      </div>
    </div>
  );
}
