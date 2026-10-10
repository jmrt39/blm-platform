import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import { Crest, NoirScreen, useStartDemo } from "./sign-in";
import { useSessionActions } from "../components/viewer";
import { useSetup, useUnlock } from "../queries/session";
import { storeSession } from "../lib/store-session";
import { errMsg } from "../lib/format";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b8277]">{label}</div>
      {children}
    </label>
  );
}

/** A signed-in account with no group yet: create one, or try the demo. */
export function Setup({ user }: { user: { name: string; email: string } }) {
  const setup = useSetup();
  const demo = useStartDemo();
  const { signOut } = useSessionActions();
  const [f, setF] = useState({ groupName: "", ownerName: user.name, storeName: "", city: "", storePin: "", ticketTarget: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <NoirScreen wide>
      <Crest sub={`Welcome, ${user.name.split(" ")[0]}. Set up your group and first store. You can add more stores after, then import your roster.`} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setup.mutate({ ...f, ticketTarget: Number(f.ticketTarget) });
        }}
        className="space-y-4 rounded-[2px] border border-noir-line bg-noir/70 p-6 md:p-7"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <F label="Restaurant group">
            <input aria-label="Restaurant group" className="field-noir" required placeholder="1906 Hospitality Group" value={f.groupName} onChange={set("groupName")} />
          </F>
          <F label="Your name (owner)">
            <input aria-label="Your name (owner)" className="field-noir" required value={f.ownerName} onChange={set("ownerName")} />
          </F>
          <F label="First store">
            <input aria-label="First store" className="field-noir" required placeholder="1906 Bar & Grille" value={f.storeName} onChange={set("storeName")} />
          </F>
          <F label="City">
            <input aria-label="City" className="field-noir" placeholder="Charlotte, NC" value={f.city} onChange={set("city")} />
          </F>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <F label="Store PIN (4 to 6 digits, managers use it to open the store)">
            <input aria-label="Store PIN" className="field-noir figure tracking-[0.3em]" inputMode="numeric" required value={f.storePin} onChange={(e) => setF({ ...f, storePin: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
          </F>
          <F label="Spend per ticket target ($, net sales ÷ tickets)">
            <input aria-label="Spend per ticket target" className="field-noir figure" inputMode="decimal" required placeholder="190" value={f.ticketTarget} onChange={(e) => setF({ ...f, ticketTarget: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) })} />
          </F>
        </div>
        {setup.error && <div className="text-[13px] text-[#e08b84]">{errMsg(setup.error)}</div>}
        <button disabled={setup.isPending} className="btn btn-gold h-11 w-full">
          {setup.isPending ? "Opening the doors…" : "Create my group"} <ArrowRight className="size-4" />
        </button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-[#8b8277]">
        <button onClick={demo.run} disabled={demo.busy} className="inline-flex items-center gap-2 font-semibold text-gold hover:underline">
          <Sparkles className="size-4" /> {demo.busy ? "Loading the demo…" : "Or explore the demo group first"}
        </button>
        <Link href="/studio" className="hover:text-ivory">
          BLM staff: Implementation Studio
        </Link>
        <button onClick={signOut} className="hover:text-ivory">
          Sign out ({user.email})
        </button>
      </div>
      {demo.error && <div className="mt-2 text-[12.5px] text-[#e08b84]">{demo.error}</div>}
    </NoirScreen>
  );
}

/** Store managers: after signing in, open your store with the store number + store PIN. */
export function Unlock({ user, stores }: { user: { name: string; email: string }; stores: { number: string; name: string }[] }) {
  const qc = useQueryClient();
  const unlock = useUnlock();
  const { signOut } = useSessionActions();
  const [number, setNumber] = useState(stores.length === 1 ? stores[0]!.number : "");
  const [pin, setPin] = useState("");
  return (
    <NoirScreen>
      <Crest sub={`Good to see you, ${user.name.split(" ")[0]}. Enter the store number and store PIN to open the store.`} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await unlock.mutateAsync({ number, pin }).catch(() => null);
          if (r) {
            storeSession.set(r.token);
            await qc.invalidateQueries();
          }
        }}
        className="space-y-4 rounded-[2px] border border-noir-line bg-noir/70 p-6"
      >
        {stores.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <button type="button" key={s.number} onClick={() => setNumber(s.number)} className={`chip !border-noir-line ${number === s.number ? "!text-gold !border-gold/60" : "!text-[#b9b0a3]"}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <F label="Store number">
          <input aria-label="Store number" className="field-noir figure !text-[20px] tracking-[0.2em]" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} />
        </F>
        <F label="Store PIN">
          <input aria-label="Store PIN"
            className="field-noir figure !text-[20px] tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </F>
        {unlock.error && <div className="text-[13px] text-[#e08b84]">{errMsg(unlock.error)}</div>}
        <button disabled={unlock.isPending || !number || pin.length < 4} className="btn btn-gold h-11 w-full">
          Open the store <ArrowRight className="size-4" />
        </button>
      </form>
      <button onClick={signOut} className="mx-auto mt-5 block text-[12.5px] text-[#8b8277] hover:text-ivory">
        Sign out ({user.email})
      </button>
    </NoirScreen>
  );
}
