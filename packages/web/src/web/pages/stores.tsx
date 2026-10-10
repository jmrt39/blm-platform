import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { useAddAreaManager, useCreateStore, useLeadership, useRemoveAreaManager, useStores, useUpdateAreaManager, useUpdateStore } from "../queries/stores";
import { ROLE_LABEL, type StoreRole } from "../../shared/domain";
import { errMsg } from "../lib/format";

function clock(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

type StoreRow = NonNullable<ReturnType<typeof useStores>["data"]>[number];

function StoreCard({ s, canEdit }: { s: StoreRow; canEdit: boolean }) {
  const update = useUpdateStore();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: s.name, city: s.city, pin: s.pin ?? "", ticketTarget: String(s.ticketTarget), openingDueBy: s.openingDueBy, closingDueBy: s.closingDueBy });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="border border-paper-line bg-paper-2/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Store {s.number}</div>
          <div className="font-display text-[26px] leading-tight text-ink">{s.name}</div>
          <div className="text-[13px] text-ink-soft">{s.city || "—"}</div>
        </div>
        {canEdit && !edit && (
          <button className="btn btn-line" onClick={() => setEdit(true)}>
            Edit
          </button>
        )}
      </div>
      {!edit ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-4">
          <div>
            <dt className="label">Store PIN</dt>
            <dd className="figure text-[18px] tracking-[0.2em]">{s.pin ?? "••••"}</dd>
          </div>
          <div>
            <dt className="label">Spend per ticket target</dt>
            <dd className="figure text-[18px]">${s.ticketTarget}</dd>
          </div>
          <div>
            <dt className="label">Opening due</dt>
            <dd className="figure text-[18px]">{clock(s.openingDueBy)}</dd>
          </div>
          <div>
            <dt className="label">Closing due</dt>
            <dd className="figure text-[18px]">{clock(s.closingDueBy)}</dd>
          </div>
          <div className="col-span-2 md:col-span-4">
            <dt className="label">Management · {s.headcount} on the team</dt>
            <dd className="text-ink">{s.managers.length ? s.managers.map((m) => `${m.name} (${ROLE_LABEL[m.role as StoreRole] ?? m.role})`).join(" · ") : "No managers yet"}</dd>
          </div>
        </dl>
      ) : (
        <form
          className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await update.mutateAsync({
                id: s.id,
                name: f.name,
                city: f.city,
                ticketTarget: Number(f.ticketTarget),
                openingDueBy: f.openingDueBy,
                closingDueBy: f.closingDueBy,
                ...(f.pin && f.pin !== s.pin ? { pin: f.pin } : {}),
              });
              setEdit(false);
            } catch (x) {
              setErr(errMsg(x));
            }
          }}
        >
          <label className="col-span-2 md:col-span-1">
            <span className="label">Name</span>
            <input aria-label="Name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            <span className="label">City</span>
            <input aria-label="City" className="field" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </label>
          <label>
            <span className="label">Store PIN</span>
            <input aria-label="Store PIN" className="field" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label>
            <span className="label">Spend per ticket target ($)</span>
            <input aria-label="Spend per ticket target ($)" className="field" type="number" required min={10} value={f.ticketTarget} onChange={(e) => setF({ ...f, ticketTarget: e.target.value })} />
          </label>
          <label>
            <span className="label">Opening due by</span>
            <input aria-label="Opening due by" className="field" type="time" value={f.openingDueBy} onChange={(e) => setF({ ...f, openingDueBy: e.target.value })} />
          </label>
          <label>
            <span className="label">Closing due by</span>
            <input aria-label="Closing due by" className="field" type="time" value={f.closingDueBy} onChange={(e) => setF({ ...f, closingDueBy: e.target.value })} />
          </label>
          <div className="col-span-2 flex items-center gap-2 md:col-span-3">
            <button className="btn btn-ink" disabled={update.isPending}>
              Save
            </button>
            <button type="button" className="btn btn-line" onClick={() => setEdit(false)}>
              Cancel
            </button>
            {err && <span className="text-[13px] text-oxblood">{err}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

function NewStore({ onDone }: { onDone: () => void }) {
  const create = useCreateStore();
  const [f, setF] = useState({ name: "", city: "", pin: "", ticketTarget: "" });
  const [made, setMade] = useState<{ number: string } | null>(null);
  if (made)
    return (
      <div className="border border-gold/60 bg-paper-2 p-5">
        <div className="eyebrow">Store opened</div>
        <div className="font-display text-[24px]">
          Store number <span className="figure">{made.number}</span> · PIN <span className="figure">{f.pin}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">Managers open it with these. Opening and closing checklists are ready with the house defaults.</p>
        <button className="btn btn-ink mt-4" onClick={onDone}>
          Done
        </button>
      </div>
    );
  return (
    <form
      className="grid grid-cols-2 gap-4 border border-paper-line bg-paper-2/60 p-5 md:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await create.mutateAsync({ name: f.name, city: f.city, pin: f.pin, ticketTarget: Number(f.ticketTarget) }).catch(() => null);
        if (r) setMade(r);
      }}
    >
      <label className="col-span-2">
        <span className="label">Store name</span>
        <input aria-label="Store name" className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="1906 Uptown" />
      </label>
      <label>
        <span className="label">City</span>
        <input aria-label="City" className="field" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </label>
      <label>
        <span className="label">Store PIN</span>
        <input aria-label="Store PIN" className="field" required inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} placeholder="4–6 digits" />
      </label>
      <label>
        <span className="label">Spend per ticket target ($)</span>
        <input aria-label="Spend per ticket target ($)" className="field" type="number" required min={10} value={f.ticketTarget} onChange={(e) => setF({ ...f, ticketTarget: e.target.value })} />
      </label>
      <div className="col-span-2 flex items-center gap-2 md:col-span-5">
        <button className="btn btn-ink" disabled={create.isPending}>
          Open store
        </button>
        <button type="button" className="btn btn-line" onClick={onDone}>
          Cancel
        </button>
        {create.error && <ErrorNote error={create.error} />}
      </div>
    </form>
  );
}

function Leadership({ stores }: { stores: StoreRow[] }) {
  const q = useLeadership(true);
  const add = useAddAreaManager();
  const upd = useUpdateAreaManager();
  const del = useRemoveAreaManager();
  const [f, setF] = useState({ name: "", email: "", storeIds: [] as string[] });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between border-b border-ink pb-3">
        <div>
          <div className="eyebrow">Leadership</div>
          <h2 className="font-display text-[28px] text-ink">Area managers</h2>
        </div>
        <p className="max-w-sm text-right text-[12px] text-ink-soft">They sign in with this email (password or Google) and see only the stores ticked here.</p>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 border-b border-paper-line py-3">
              <div className="min-w-[200px]">
                <div className="font-semibold text-ink">{a.name}</div>
                <div className="text-[12px] text-ink-soft">
                  {a.email} · {a.role === "owner" ? "Owner" : "Area manager"} {a.linked ? "" : "· not signed in yet"}
                </div>
              </div>
              {a.role === "owner" ? (
                <span className="chip">All stores</span>
              ) : (
                <>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {stores.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => upd.mutate({ id: a.id, storeIds: toggle(a.storeIds, s.id) })}
                        className={`chip ${a.storeIds.includes(s.id) ? "!border-ink !bg-ink !text-paper" : ""}`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-line !px-2" title="Remove" onClick={() => del.mutate({ id: a.id })}>
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          ))}
          {!q.data?.length && <Empty>No leadership yet.</Empty>}
        </div>
      )}
      <form
        className="mt-6 grid grid-cols-2 gap-4 border border-paper-line bg-paper-2/40 p-5 md:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await add.mutateAsync(f).catch(() => null);
          if (r) setF({ name: "", email: "", storeIds: [] });
        }}
      >
        <label>
          <span className="label">Name</span>
          <input aria-label="Name" className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label>
          <span className="label">Email</span>
          <input aria-label="Email" className="field" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <div className="col-span-2">
          <span className="label">Stores</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {stores.map((s) => (
              <button type="button" key={s.id} onClick={() => setF({ ...f, storeIds: toggle(f.storeIds, s.id) })} className={`chip ${f.storeIds.includes(s.id) ? "!border-ink !bg-ink !text-paper" : ""}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-3 md:col-span-4">
          <button className="btn btn-ink" disabled={add.isPending || !f.storeIds.length}>
            <Plus className="size-4" /> Add area manager
          </button>
          {add.error && <ErrorNote error={add.error} />}
        </div>
      </form>
    </section>
  );
}

export default function StoresPage() {
  const v = useViewer();
  const q = useStores();
  const [adding, setAdding] = useState(false);
  const owner = v.me.level === "owner";
  const canEdit = owner || v.me.level === "area" || v.me.member?.role === "gm";
  return (
    <Page
      eyebrow={v.me.orgName}
      title="Stores"
      aside={
        owner &&
        !adding && (
          <button className="btn btn-ink" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Open a store
          </button>
        )
      }
    >
      {adding && (
        <div className="mb-6">
          <NewStore onDone={() => setAdding(false)} />
        </div>
      )}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(q.data ?? []).map((s) => (
            <StoreCard key={s.id} s={s} canEdit={canEdit} />
          ))}
        </div>
      )}
      {owner && q.data && <Leadership stores={q.data} />}
    </Page>
  );
}
