import { useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { FcGoogle } from "react-icons/fc";
import { ArrowRight, Sparkles } from "lucide-react";
import { Monogram } from "../components/monogram";
import { authClient, captureToken } from "../lib/auth";
import { client } from "../lib/api";
import { storeSession } from "../lib/store-session";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";

export function NoirScreen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="noir-frame grain on-noir relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
        className={cn("w-full", wide ? "max-w-[560px]" : "max-w-[440px]")}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Crest({ sub }: { sub?: string }) {
  return (
    <div className="mb-9 flex flex-col items-center text-center">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative">
        <div className="absolute inset-[-18px] rounded-full border border-gold/20" />
        <div className="absolute inset-[-30px] rounded-full border border-gold/10" />
        <Monogram size={96} />
      </motion.div>
      <div className="mt-9 font-display text-[34px] leading-none text-ivory">The Platform</div>
      <div className="mt-2.5 text-[10.5px] font-bold uppercase tracking-[0.3em] text-gold">Bottom Line Multiplied</div>
      {sub && <p className="mt-5 max-w-[340px] font-display text-[15px] italic leading-relaxed text-[#b9b0a3]">{sub}</p>}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 border-b-2 pb-3 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors",
        active ? "border-gold text-gold" : "border-noir-line text-[#8b8277] hover:text-ivory",
      )}
    >
      {children}
    </button>
  );
}

export function useStartDemo() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await authClient.getSession();
      if (!session.data) {
        const id = crypto.randomUUID().slice(0, 12);
        const res = await authClient.signUp.email(
          { email: `demo-${id}@demo.theplatform.app`, password: crypto.randomUUID(), name: "Demo Owner" },
          captureToken,
        );
        if (res.error) throw new Error(res.error.message);
      }
      await client.session.startDemo();
      storeSession.clear();
      await qc.invalidateQueries();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

function EmailForm() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password }, captureToken)
        : await authClient.signUp.email({ email, password, name: name || email.split("@")[0]! }, captureToken);
    setBusy(false);
    if (res.error) return setError(res.error.message ?? "Couldn't sign you in.");
    await qc.invalidateQueries();
  };

  const google = async () => {
    setError("");
    const r = await authClient.managedAuth.signIn({ provider: "google" });
    if (r.error && r.error.code !== "POPUP_CLOSED") setError(r.error.message);
    else await qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <button onClick={google} className="btn btn-noir-line h-11 w-full !bg-ivory !text-noir hover:!bg-white">
        <FcGoogle className="size-[18px]" /> Continue with Google
      </button>
      <div className="flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#6d655b]">
        <span className="h-px flex-1 bg-noir-line" /> or email <span className="h-px flex-1 bg-noir-line" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && <input aria-label="Your name" className="field-noir" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input aria-label="Email" className="field-noir" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input aria-label="Password (8+ characters)"
          className="field-noir"
          type="password"
          placeholder="Password (8+ characters)"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-[13px] text-[#e08b84]">{error}</div>}
        <button disabled={busy} className="btn btn-gold h-11 w-full">
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"} <ArrowRight className="size-4" />
        </button>
      </form>
      <div className="text-center text-[12.5px] text-[#8b8277]">
        {mode === "in" ? "New to The Platform? " : "Already have an account? "}
        <button className="font-semibold text-gold hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Create an account" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function PinForm() {
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await client.session.pinSignIn({ number, pin });
      storeSession.set(r.token);
      await qc.invalidateQueries();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b8277]">Store number</div>
        <input aria-label="Store number" className="field-noir figure !text-[20px] tracking-[0.2em]" inputMode="numeric" placeholder="000000" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b8277]">Your 4-digit PIN</div>
        <PinBoxes value={pin} onChange={setPin} />
      </div>
      {error && <div className="text-[13px] text-[#e08b84]">{error}</div>}
      <button disabled={busy || number.length < 4 || pin.length !== 4} className="btn btn-gold h-11 w-full">
        {busy ? "Checking…" : "Clock in to the store"} <ArrowRight className="size-4" />
      </button>
      <p className="text-center text-[12px] leading-relaxed text-[#8b8277]">Your PIN only works at the store that hired you. Ask your manager if you don't have one.</p>
    </form>
  );
}

export function PinBoxes({ value, onChange, length = 4, dark = true }: { value: string; onChange: (v: string) => void; length?: number; dark?: boolean }) {
  return (
    <label className="relative block">
      <input aria-label="PIN digit"
        className="absolute inset-0 opacity-0"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        maxLength={length}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
      />
      <div className="flex gap-2.5">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "grid h-14 flex-1 place-items-center rounded-[2px] border font-display text-[26px]",
              dark ? "border-noir-line bg-noir-2 text-gold" : "border-paper-line bg-white/60 text-ink",
              value.length === i && (dark ? "border-gold/70" : "border-gold-deep"),
            )}
          >
            {value[i] ? "•" : ""}
          </div>
        ))}
      </div>
    </label>
  );
}

export default function SignIn() {
  const [tab, setTab] = useState<"account" | "pin">("account");
  const demo = useStartDemo();
  return (
    <NoirScreen>
      <Crest sub="Front of house, signed and accounted for. Every line, every night, every store." />
      <div className="rounded-[2px] border border-noir-line bg-noir/70 p-6 shadow-2xl backdrop-blur md:p-7">
        <div className="mb-6 flex gap-4">
          <Tab active={tab === "account"} onClick={() => setTab("account")}>
            Owners & managers
          </Tab>
          <Tab active={tab === "pin"} onClick={() => setTab("pin")}>
            Staff · store PIN
          </Tab>
        </div>
        {tab === "account" ? <EmailForm /> : <PinForm />}
      </div>
      <div className="mt-6 rounded-[2px] border border-gold/25 bg-gold/[0.04] p-5 text-center">
        <div className="font-display text-[19px] text-ivory">See it with a real night of service</div>
        <p className="mx-auto mt-1.5 max-w-[340px] text-[12.5px] leading-relaxed text-[#8b8277]">
          Three 1906 stores, six weeks of history, and the team from the film: D. Kerr, Camille Rhodes, Chris Ortega.
        </p>
        <button onClick={demo.run} disabled={demo.busy} className="btn btn-noir-line mx-auto mt-4 !border-gold/50 !text-gold hover:!bg-gold hover:!text-noir">
          <Sparkles className="size-4" /> {demo.busy ? "Setting the tables…" : "Try the demo"}
        </button>
        {demo.error && <div className="mt-2 text-[12.5px] text-[#e08b84]">{demo.error}</div>}
      </div>
    </NoirScreen>
  );
}
