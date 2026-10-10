// Implementation Studio: BLM staff turn each client's audit and material into their program.
import { useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, KeyRound, LogOut, Plus, Trash2 } from "lucide-react";
import { Monogram } from "../components/monogram";
import { Page, Loading, ErrorNote } from "../components/shell";
import { Empty } from "../components/bits";
import { useSessionActions } from "../components/viewer";
import { Crest, NoirScreen } from "./sign-in";
import { useCreateClient, useStartBuild, useStudioClients, useStudioMe, useStudioUnlock } from "../queries/studio";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";
import { DEFAULT_TICKET_TARGET } from "../../shared/metrics";
import StudioClient from "./studio-client";

export function when(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StudioShell({ name, children }: { name: string | null; children: React.ReactNode }) {
  const { signOut } = useSessionActions();
  return (
    <div className="noir-frame grain on-noir min-h-screen">
      <header className="sticky top-0 z-30 border-b border-noir-line bg-noir/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 md:px-6">
          <Link href="/studio" className="flex items-center gap-3">
            <Monogram size={38} />
            <div>
              <div className="font-display text-[19px] leading-none text-ivory">Implementation Studio</div>
              <div className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.22em] text-gold">Bottom Line Multiplied · staff only</div>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-4 text-[12.5px]">
            <Link href="/" className="hidden font-semibold text-[#b9b0a3] hover:text-ivory sm:block">
              Open the platform
            </Link>
            {name && <span className="hidden text-ivory md:inline">{name}</span>}
            <button onClick={signOut} className="flex items-center gap-1.5 font-semibold text-[#b9b0a3] hover:text-ivory">
              <LogOut className="size-3.5 text-gold" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-3 py-6 md:px-6 md:py-8">{children}</main>
      <footer className="mx-auto flex max-w-[1280px] items-center gap-3 px-6 pb-16 pt-4 text-[11px] text-[#6d655b]">
        <Monogram size={18} /> Implementation Studio · nothing here is seen by a client until it is approved and published
      </footer>
    </div>
  );
}

function StudioUnlock() {
  const unlock = useStudioUnlock();
  const { signOut } = useSessionActions();
  const [, nav] = useLocation();
  const [code, setCode] = useState("");
  return (
    <NoirScreen>
      <Crest sub="The Implementation Studio is for BLM staff. Enter the studio code once and this account stays unlocked." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock.mutate({ code });
        }}
        className="space-y-4 rounded-[2px] border border-noir-line bg-noir/70 p-6"
      >
        <label className="block">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b8277]">Studio code</div>
          <input aria-label="Studio code" className="field-noir tracking-[0.2em]" type="password" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {unlock.error && <div className="text-[13px] text-[#e08b84]">{errMsg(unlock.error)}</div>}
        <button disabled={unlock.isPending || !code} className="btn btn-gold h-11 w-full">
          <KeyRound className="size-4" /> Unlock the Studio
        </button>
      </form>
      <div className="mt-5 flex justify-between text-[12.5px] text-[#8b8277]">
        <button onClick={() => nav("/")} className="hover:text-ivory">
          Back to the platform
        </button>
        <button onClick={signOut} className="hover:text-ivory">
          Sign out
        </button>
      </div>
    </NoirScreen>
  );
}

function ClientsPage() {
  const clients = useStudioClients();
  const start = useStartBuild();
  const [, nav] = useLocation();
  const [showDemo, setShowDemo] = useState(false);
  if (clients.isLoading) return <Loading />;
  const rows = (clients.data ?? []).filter((c) => showDemo || !c.isDemo);
  const building = rows.filter((c) => c.build && !c.program).length;
  const live = rows.filter((c) => c.program).length;
  return (
    <Page
      eyebrow="Clients"
      title="Every house we build for"
      aside={
        <Link href="/studio/new" className="btn btn-ink">
          <Plus className="size-4" /> New client
        </Link>
      }
    >
      <p className="mb-6 max-w-[720px] text-[14.5px] leading-relaxed text-ink-soft">
        Each client starts from a copy of the BLM standard program. Record the audit, add their menus and standards, let the AI adapt the training, then approve every piece before you publish. {building} in progress, {live} live.
      </p>
      <ErrorNote error={clients.error ?? start.error} />
      {rows.length === 0 ? (
        <Empty>No clients yet. Start with New client.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Group</th>
                <th>Owner</th>
                <th className="r">Stores</th>
                <th>Build</th>
                <th>Program</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.orgId}>
                  <td>
                    <div className="font-display text-[18px] text-ink">{c.name}</div>
                    {c.isDemo && <span className="chip mt-1">Demo group</span>}
                  </td>
                  <td>
                    {c.owner ? (
                      <>
                        <div>{c.owner.name}</div>
                        <div className="text-[12px] text-ink-soft">{c.owner.email}</div>
                      </>
                    ) : (
                      <span className="text-ink-soft">None on file</span>
                    )}
                  </td>
                  <td className="r figure">{c.stores}</td>
                  <td>
                    {c.build ? (
                      <div className="min-w-[140px]">
                        <div className="text-[12.5px]">
                          {c.build.approved} of {c.build.total} approved
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-paper-2">
                          <div className="h-full bg-gold" style={{ width: `${c.build.total ? (c.build.approved / c.build.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-ink-soft">Not started</span>
                    )}
                  </td>
                  <td>{c.program ? <span className="chip !border-sage/50 !text-sage">Version {c.program.version} · {when(c.program.publishedAt)}</span> : <span className="text-ink-soft">Standard</span>}</td>
                  <td className="r">
                    {c.build ? (
                      <Link href={`/studio/${c.orgId}`} className="btn btn-line">
                        Open <ArrowRight className="size-4" />
                      </Link>
                    ) : (
                      <button
                        className="btn btn-line"
                        disabled={start.isPending}
                        onClick={async () => {
                          await start.mutateAsync({ orgId: c.orgId });
                          nav(`/studio/${c.orgId}`);
                        }}
                      >
                        Start build
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="mt-5 flex items-center gap-2 text-[12.5px] text-ink-soft">
        <input aria-label="Show the demo group" type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} /> Show the demo group
      </label>
    </Page>
  );
}

type StoreDraft = { name: string; city: string; ticketTarget: string };

function NewClientPage() {
  const create = useCreateClient();
  const [, nav] = useLocation();
  const [f, setF] = useState({ groupName: "", ownerName: "", ownerEmail: "" });
  const [stores, setStores] = useState<StoreDraft[]>([{ name: "", city: "", ticketTarget: String(DEFAULT_TICKET_TARGET) }]);
  const [made, setMade] = useState<{ orgId: string; stores: { name: string; number: string; pin: string }[] } | null>(null);
  const setStore = (i: number, k: keyof StoreDraft, v: string) => setStores(stores.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  if (made)
    return (
      <Page eyebrow="Client created" title={f.groupName}>
        <p className="mb-5 max-w-[680px] text-[14.5px] leading-relaxed text-ink-soft">
          {f.ownerName} is invited as owner. When they sign in with {f.ownerEmail} they land in their group. Their stores are open now on the BLM standard program; nothing changes for them until you publish.
        </p>
        <table className="tbl mb-6 max-w-[620px]">
          <thead>
            <tr>
              <th>Store</th>
              <th>Store number</th>
              <th>Store PIN</th>
            </tr>
          </thead>
          <tbody>
            {made.stores.map((s) => (
              <tr key={s.number}>
                <td>{s.name}</td>
                <td className="figure tracking-[0.15em]">{s.number}</td>
                <td className="figure tracking-[0.25em]">{s.pin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mb-6 text-[12.5px] text-ink-soft">Write the PINs down for the owner. Managers can change them later on the Stores page.</p>
        <button className="btn btn-ink" onClick={() => nav(`/studio/${made.orgId}`)}>
          Open the build <ArrowRight className="size-4" />
        </button>
      </Page>
    );

  return (
    <Page
      eyebrow="New client"
      title="Set up the house"
      aside={
        <Link href="/studio" className="btn btn-line">
          <ArrowLeft className="size-4" /> Clients
        </Link>
      }
    >
      <form
        className="max-w-[860px] space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await create
            .mutateAsync({ ...f, stores: stores.map((s) => ({ name: s.name.trim(), city: s.city.trim(), ticketTarget: Number(s.ticketTarget) || DEFAULT_TICKET_TARGET })) })
            .catch(() => null);
          if (r) setMade(r);
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="label">Restaurant group</span>
            <input aria-label="Restaurant group" className="field" required minLength={2} value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value })} placeholder="Harbor House Group" />
          </label>
          <label>
            <span className="label">Owner name</span>
            <input aria-label="Owner name" className="field" required minLength={2} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
          </label>
          <label>
            <span className="label">Owner email (their sign in)</span>
            <input aria-label="Owner email" className="field" required type="email" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} />
          </label>
        </div>
        <div>
          <div className="eyebrow mb-3">Stores</div>
          <div className="space-y-2">
            {stores.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_140px_40px] items-end gap-3">
                <label>
                  {i === 0 && <span className="label">Store name</span>}
                  <input aria-label="Store name" className="field" required minLength={2} value={s.name} onChange={(e) => setStore(i, "name", e.target.value)} />
                </label>
                <label>
                  {i === 0 && <span className="label">City</span>}
                  <input aria-label="City" className="field" value={s.city} onChange={(e) => setStore(i, "city", e.target.value)} />
                </label>
                <label>
                  {i === 0 && <span className="label">Spend per ticket ($)</span>}
                  <input aria-label="Spend per ticket target" className="field figure" inputMode="decimal" value={s.ticketTarget} onChange={(e) => setStore(i, "ticketTarget", e.target.value.replace(/[^\d.]/g, ""))} />
                </label>
                <button
                  type="button"
                  aria-label="Remove store"
                  disabled={stores.length === 1}
                  onClick={() => setStores(stores.filter((_, j) => j !== i))}
                  className={cn("grid h-[2.6rem] place-items-center text-ink-soft hover:text-oxblood", stores.length === 1 && "opacity-30")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-line mt-3" onClick={() => setStores([...stores, { name: "", city: "", ticketTarget: stores[stores.length - 1]?.ticketTarget ?? String(DEFAULT_TICKET_TARGET) }])}>
            <Plus className="size-4" /> Another store
          </button>
        </div>
        <ErrorNote error={create.error} />
        <button className="btn btn-ink" disabled={create.isPending}>
          {create.isPending ? "Setting up…" : "Create client and copy the standard program"}
        </button>
      </form>
    </Page>
  );
}

/** Mounted at /studio for any signed in account. */
export default function StudioApp() {
  const me = useStudioMe();
  if (me.isLoading)
    return (
      <div className="noir-frame min-h-screen">
        <Loading />
      </div>
    );
  if (!me.data?.staff) return <StudioUnlock />;
  return (
    <StudioShell name={me.data.name}>
      <Switch>
        <Route path="/studio" component={ClientsPage} />
        <Route path="/studio/new" component={NewClientPage} />
        <Route path="/studio/:orgId">{(p) => <StudioClient orgId={p.orgId} />}</Route>
      </Switch>
    </StudioShell>
  );
}
