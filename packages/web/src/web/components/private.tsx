import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { usePrivacyState, useLockPrivacy, useStartUnlock, useVerifyUnlock } from "../queries/privacy";
import { PinBoxes } from "../pages/sign-in";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";

/** The server's "open private records first" refusal. */
export function isPrivate(e: unknown) {
  return !!e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "PRIVATE";
}

/** Minutes left on an open wall, ticking. */
export function useMinutesLeft(until: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 60_000)) : 0;
}

/**
 * Password, then a six digit code, then thirty minutes of private records. Shown wherever a page
 * hits a private record, and on the Private records page.
 */
export function UnlockPanel({ what, className, compact }: { what?: string; className?: string; compact?: boolean }) {
  const st = usePrivacyState();
  const start = useStartUnlock();
  const verify = useVerifyUnlock();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; last4: string | null; demoCode: string | null } | null>(null);
  const s = st.data;

  const shell = (children: React.ReactNode) => (
    <div className={cn("rounded-[2px] border border-gold-deep/40 bg-paper-2 p-5 md:p-6", className)}>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-noir text-gold">
          <Lock className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">Private record</div>
          <div className="font-display text-[20px] leading-tight text-ink">{what ? `${what} is private` : "This is private"}</div>
          {children}
        </div>
      </div>
    </div>
  );

  if (st.isLoading || !s) return shell(<p className="mt-2 text-[13px] text-ink-soft">Checking…</p>);
  if (s.open) return null;
  if (!s.eligible)
    return shell(<p className="mt-2 text-[13px] leading-relaxed text-ink-soft">Only the owner and the GM can open conduct records, contact details, pay and guest reviews that name staff.</p>);
  if (s.needsAccount)
    return shell(<p className="mt-2 text-[13px] leading-relaxed text-ink-soft">Sign in with your own account, not a store PIN, to open private records.</p>);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await start.mutateAsync({ password });
    setPassword("");
    if (r.step === "code" && r.challengeId) {
      setCode("");
      setChallenge({ id: r.challengeId, last4: r.phoneLast4, demoCode: r.demoCode });
    }
  };
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    await verify.mutateAsync({ challengeId: challenge.id, code });
    setChallenge(null);
  };

  const intro = s.demo
    ? `Opens for ${s.minutes} minutes and every opening is logged for the owner. In the demo the code shows on screen instead of by text.`
    : s.smsReady
      ? `Your password, then a code texted to your phone. Opens for ${s.minutes} minutes and every opening is logged for the owner.`
      : `Confirm your password. Opens for ${s.minutes} minutes and every opening is logged for the owner. Texted codes switch on once SMS is connected.`;

  return shell(
    <>
      {!compact && <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{intro}</p>}
      {!challenge ? (
        <form onSubmit={submitPassword} className="mt-4 flex flex-wrap items-center gap-2">
          {s.password && (
            <input
              aria-label="Your password"
              type="password"
              autoComplete="current-password"
              className="field !w-full sm:!w-64"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
          {s.smsReady && !s.demo && !s.phoneLast4 ? (
            <Link href="/security" className="btn btn-ink">
              Add your phone for codes
            </Link>
          ) : (
            <button disabled={start.isPending} className="btn btn-ink">
              <ShieldCheck className="size-4" /> {start.isPending ? "One moment…" : s.demo || s.smsReady ? "Send my code" : "Open private records"}
            </button>
          )}
          {start.error && <div className="w-full text-[13px] text-oxblood">{errMsg(start.error)}</div>}
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-4 space-y-3">
          <div className="text-[13px] text-ink-soft">
            {challenge.demoCode ? (
              <>
                Demo code: <span className="figure text-[18px] tracking-[0.2em] text-ink">{challenge.demoCode}</span>
              </>
            ) : (
              <>We texted a six digit code to the phone ending {challenge.last4}. It works for ten minutes.</>
            )}
          </div>
          <div className="max-w-[360px]">
            <PinBoxes value={code} onChange={setCode} length={6} dark={false} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={verify.isPending || code.length !== 6} className="btn btn-ink">
              {verify.isPending ? "Checking…" : "Open private records"}
            </button>
            <button type="button" onClick={() => setChallenge(null)} className="btn btn-line">
              Start again
            </button>
          </div>
          {verify.error && <div className="text-[13px] text-oxblood">{errMsg(verify.error)}</div>}
        </form>
      )}
    </>,
  );
}

/** A quiet line where a private figure would be, with a way to open it. */
export function LockedLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-[12.5px] text-ink-soft", className)}>
      <Lock className="size-3.5 shrink-0 text-gold-deep" /> <span>{children}</span>
    </div>
  );
}

/** A locked note with an inline way to open private records, for key holders. */
export function LockedNotice({ children, what, className }: { children: React.ReactNode; what?: string; className?: string }) {
  const st = usePrivacyState();
  const [show, setShow] = useState(false);
  const can = !!st.data?.eligible && !st.data.needsAccount;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LockedLine>{children}</LockedLine>
        {can && !show && (
          <button type="button" onClick={() => setShow(true)} className="text-[12.5px] font-semibold text-gold-deep underline-offset-2 hover:underline">
            Open private records
          </button>
        )}
      </div>
      {can && show && <UnlockPanel what={what} compact className="mt-3" />}
    </div>
  );
}

/** Header badge for key holders: shows when private records are open and closes them. */
export function PrivacyBadge() {
  const st = usePrivacyState();
  const lock = useLockPrivacy();
  const left = useMinutesLeft(st.data?.open ? st.data.until : null);
  const s = st.data;
  if (!s?.eligible) return null;
  if (!s.open || left <= 0)
    return (
      <Link href="/security" aria-label="Private records closed" title="Private records closed" className="grid size-8 place-items-center rounded-full border border-noir-line text-[#8b8277] hover:border-gold/60 hover:text-gold">
        <Lock className="size-3.5" />
      </Link>
    );
  return (
    <button
      onClick={() => lock.mutate({})}
      title="Private records are open. Click to close them now."
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 text-[11.5px] font-bold text-gold hover:bg-gold/20"
    >
      <LockOpen className="size-3.5" /> <span className="hidden sm:inline">Private open ·</span> {left}m
    </button>
  );
}
