import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { authClient, captureToken } from "../lib/auth";
import { client } from "../lib/api";
import { storeSession } from "../lib/store-session";
import { Crest, NoirScreen } from "./sign-in";

function params() {
  const q = new URLSearchParams(window.location.search);
  return { token: q.get("token") ?? "", email: q.get("email") ?? "" };
}

/**
 * Both links land here. An invite (set password) carries the email and asks for the terms; a reset only
 * needs the new password, and the email to sign straight back in.
 */
function PasswordForm({ invite }: { invite: boolean }) {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const p = params();
  const [email, setEmail] = useState(p.email);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneNoSignIn, setDoneNoSignIn] = useState(false);

  if (!p.token)
    return (
      <div className="space-y-4 text-center text-[13.5px] leading-relaxed text-[#b9b0a3]">
        <p>This link is missing its code. Open the link from your email again, or ask for a new one.</p>
        <a href="/" className="btn btn-gold mx-auto">
          Go to sign in
        </a>
      </div>
    );

  if (doneNoSignIn)
    return (
      <div className="space-y-4 text-center text-[13.5px] leading-relaxed text-[#b9b0a3]">
        <p>Your password is set. Sign in with your email and the new password.</p>
        <a href="/" className="btn btn-gold mx-auto">
          Sign in
        </a>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== again) return setError("The two passwords don't match.");
    if (invite && !agree) return setError("Agree to the Terms and the Privacy Policy to continue.");
    setBusy(true);
    const r = await authClient.resetPassword({ newPassword: password, token: p.token });
    if (r.error) {
      setBusy(false);
      return setError(
        r.error.code === "INVALID_TOKEN" || /invalid|expired/i.test(r.error.message ?? "")
          ? "This link has expired or was already used. Ask for a new one."
          : (r.error.message ?? "Couldn't set the password."),
      );
    }
    if (!email) {
      setBusy(false);
      return setDoneNoSignIn(true);
    }
    const s = await authClient.signIn.email({ email, password }, captureToken);
    if (s.error) {
      setBusy(false);
      return setDoneNoSignIn(true);
    }
    if (invite) await client.account.acceptLegal().catch(() => null);
    storeSession.clear();
    await qc.invalidateQueries();
    nav("/", { replace: true });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        aria-label="Email"
        className="field-noir"
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        readOnly={invite && !!p.email}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        aria-label="New password (8+ characters)"
        className="field-noir"
        type="password"
        placeholder="New password, 8 characters or more"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        aria-label="Type it again"
        className="field-noir"
        type="password"
        placeholder="Type it again"
        autoComplete="new-password"
        required
        minLength={8}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
      />
      {invite && <LegalCheck checked={agree} onChange={setAgree} />}
      {error && <div className="text-[13px] text-[#e08b84]">{error}</div>}
      <button disabled={busy} className="btn btn-gold h-11 w-full">
        {busy ? "One moment…" : invite ? "Set my password" : "Save the new password"} <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

export function LegalCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#b9b0a3]">
      <input type="checkbox" aria-label="Agree to the Terms and Privacy Policy" className="mt-0.5 size-4 accent-[#c5af87]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I agree to the{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">
          Terms of Service
        </a>{" "}
        and the{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">
          Privacy Policy
        </a>
        .
      </span>
    </label>
  );
}

export function SetPasswordPage() {
  return (
    <NoirScreen>
      <Crest sub="You've been invited. Choose a password and you're in." />
      <div className="rounded-[2px] border border-noir-line bg-noir/70 p-6 shadow-2xl backdrop-blur md:p-7">
        <PasswordForm invite />
      </div>
    </NoirScreen>
  );
}

export function ResetPasswordPage() {
  return (
    <NoirScreen>
      <Crest sub="Choose a new password." />
      <div className="rounded-[2px] border border-noir-line bg-noir/70 p-6 shadow-2xl backdrop-blur md:p-7">
        <PasswordForm invite={false} />
      </div>
    </NoirScreen>
  );
}
