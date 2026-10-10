import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { useInviteMember, useMemberInvite, useResetLink } from "../queries/account";
import { errMsg, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

export type InviteOutcome = { url: string; emailed: boolean; email: string; emailError?: string | null };

export function CopyLink({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <input aria-label="Link" readOnly value={url} className="field !h-9 min-w-0 flex-1 !text-[12px]" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-line !h-9 !px-3"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => null);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** What happened to an invite or reset: emailed, or a link to pass on by hand. */
export function InviteSent({ r, who, kind = "invite" }: { r: InviteOutcome; who: string; kind?: "invite" | "reset" }) {
  return (
    <div className="mt-3 space-y-2 text-[13px] leading-relaxed">
      {r.emailed ? (
        <div className="flex items-center gap-2 text-sage">
          <Mail className="size-4" /> {kind === "invite" ? "Invite" : "Reset link"} emailed to {who}.
        </div>
      ) : (
        <div className="text-ink-soft">
          Email is not switched on yet, so send {who} this link yourself, by text or message.{" "}
          {kind === "invite" ? "It works for seven days." : "It works for one hour."}
        </div>
      )}
      {!r.emailed && <CopyLink url={r.url} />}
    </div>
  );
}

/** On a colleague's profile: invite them to make an account, or send a password reset. */
export function MemberAccess({ memberId, name, hasAccount, hasEmail }: { memberId: string; name: string; hasAccount: boolean; hasEmail: boolean }) {
  const first = name.split(" ")[0] ?? name;
  const st = useMemberInvite(memberId);
  const invite = useInviteMember();
  const reset = useResetLink();
  const [email, setEmail] = useState("");
  const [out, setOut] = useState<{ r: InviteOutcome; kind: "invite" | "reset" } | null>(null);
  const inv = st.data?.invite;
  const account = st.data?.hasAccount ?? hasAccount;
  return (
    <div className="rounded-[2px] border rule p-5">
      <div className="eyebrow mb-2">Account</div>
      {account ? (
        <>
          <p className="text-[13px] leading-relaxed text-ink-soft">{first} signs in with their own account.</p>
          <button
            type="button"
            disabled={reset.isPending}
            onClick={async () => setOut({ r: await reset.mutateAsync({ memberId }), kind: "reset" })}
            className="btn btn-line mt-3 w-full"
          >
            {reset.isPending ? "One moment…" : "Send a password reset link"}
          </button>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {inv
              ? inv.acceptedAt
                ? `Invite accepted ${shortDay(new Date(inv.acceptedAt).toISOString().slice(0, 10))}.`
                : `Invited ${shortDay(new Date(inv.sentAt).toISOString().slice(0, 10))} by ${inv.by}${inv.expired ? ", now expired" : ", not accepted yet"}.`
              : `Manager tools need an account. Invite ${first} to choose a password.`}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setOut({ r: await invite.mutateAsync({ memberId, email: email.trim() || undefined }), kind: "invite" });
            }}
            className="mt-3 space-y-2"
          >
            {!hasEmail && (
              <input aria-label="Their email" type="email" required className="field" placeholder="Their email" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
            <button disabled={invite.isPending} className="btn btn-ink w-full">
              <Mail className="size-4" /> {invite.isPending ? "One moment…" : inv ? "Send a new invite" : "Send an invite"}
            </button>
          </form>
        </>
      )}
      {(invite.error || reset.error) && <div className="mt-2 text-[12.5px] text-oxblood">{errMsg(invite.error ?? reset.error)}</div>}
      {out && <InviteSent r={out.r} who={first} kind={out.kind} />}
    </div>
  );
}

/** Right after adding a manager: send the invite in one tap. */
export function InviteNow({ memberId, name }: { memberId: string; name: string }) {
  const first = name.split(" ")[0] ?? name;
  const invite = useInviteMember();
  const [r, setR] = useState<InviteOutcome | null>(null);
  return (
    <div className="mb-7 rounded-[2px] border border-gold-deep/50 p-5 text-[14px] leading-relaxed">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold-deep">Manager tools</div>
      {first} needs an account for manager tools. Send an invite and they choose their own password.
      {!r && (
        <div>
          <button type="button" disabled={invite.isPending} onClick={async () => setR(await invite.mutateAsync({ memberId }))} className="btn btn-ink mt-3">
            <Mail className="size-4" /> {invite.isPending ? "One moment…" : `Invite ${first}`}
          </button>
        </div>
      )}
      {invite.error && <div className="mt-2 text-[12.5px] text-oxblood">{errMsg(invite.error)}</div>}
      {r && <InviteSent r={r} who={first} />}
    </div>
  );
}

/** One tap invite for someone already on file, with the copy link fallback. */
export function InviteButton({ who, run, label, className }: { who: string; run: () => Promise<InviteOutcome>; label?: string; className?: string }) {
  const first = who.split(" ")[0] ?? who;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [r, setR] = useState<InviteOutcome | null>(null);
  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        disabled={busy}
        className="btn btn-line !h-9 !px-3 !text-[12px]"
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            setR(await run());
          } catch (e) {
            setErr(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Mail className="size-4" /> {busy ? "One moment…" : (label ?? (r ? "Send again" : `Invite ${first}`))}
      </button>
      {!!err && <div className="mt-2 text-[12.5px] text-oxblood">{errMsg(err)}</div>}
      {r && <InviteSent r={r} who={first} />}
    </div>
  );
}
