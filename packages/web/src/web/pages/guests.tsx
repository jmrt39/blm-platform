import { useState } from "react";
import { Link } from "wouter";
import { Pin, PinOff, Plus, Quote, Star, Trash2 } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useCreateFeedback, useGuestFeedback, usePinFeedback, useRemoveFeedback } from "../queries/guests";
import { useTeam } from "../queries/team";
import { FEEDBACK_SOURCES } from "../../shared/program";
import { ROLE_LABEL, isManagementRole } from "../../shared/domain";
import { errMsg, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

type Feedback = NonNullable<ReturnType<typeof useGuestFeedback>["data"]>[number];

export function QuoteCard({ f, canManage, compact }: { f: Feedback; canManage?: boolean; compact?: boolean }) {
  const pin = usePinFeedback();
  const remove = useRemoveFeedback();
  return (
    <figure className={cn("relative rounded-[2px] border p-5", f.pinnedToday ? "border-gold-deep/70 bg-gold/10" : "rule")}>
      <Quote className="absolute right-4 top-4 size-6 text-gold-deep/30" />
      <blockquote className={cn("font-display italic leading-snug", compact ? "text-[17px]" : "text-[19px]")}>“{f.quote}”</blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
        {f.rating != null && (
          <span className="inline-flex items-center gap-0.5 text-gold-deep">
            {Array.from({ length: f.rating }).map((_, i) => (
              <Star key={i} className="size-3 fill-current" />
            ))}
          </span>
        )}
        <span>
          {f.guestName || "A guest"} · {f.source} · {shortDay(f.receivedOn)}
        </span>
        {f.memberIds.map((id, i) => (
          <Link key={id} href={`/team/${id}`} className="chip border-ink/30 text-ink hover:border-ink">
            {f.memberNames[i]}
          </Link>
        ))}
        {f.pinnedToday && <span className="chip border-gold-deep/60 text-gold-deep">Pinned to tonight's line-up</span>}
      </figcaption>
      {canManage && (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-line !h-8 !px-3 !text-[12px]" disabled={pin.isPending} onClick={() => pin.mutate({ id: f.id, pinned: !f.pinnedToday })}>
            {f.pinnedToday ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} {f.pinnedToday ? "Unpin" : "Pin to line-up"}
          </button>
          <button
            className="btn btn-line !h-8 !px-3 !text-[12px] !text-oxblood"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Remove this quote?")) remove.mutate({ id: f.id });
            }}
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        </div>
      )}
    </figure>
  );
}

export default function GuestsPage() {
  const v = useViewer();
  const q = useGuestFeedback(v.storeId);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "named">("all");
  const rows = (q.data ?? []).filter((f) => filter === "all" || f.memberIds.length);
  const named = new Map<string, { name: string; n: number }>();
  const month = (v.me.today ?? "").slice(0, 7);
  for (const f of q.data ?? [])
    if (f.receivedOn.startsWith(month))
      f.memberIds.forEach((id, i) => named.set(id, { name: f.memberNames[i]!, n: (named.get(id)?.n ?? 0) + 1 }));
  const leaders = [...named.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  return (
    <Page
      eyebrow={`${v.store?.name} · Guest feedback`}
      title="Setting the standard"
      aside={
        v.isManager && (
          <button className="btn btn-ink" onClick={() => setAdding((a) => !a)}>
            <Plus className="size-4" /> {adding ? "Close" : "Add a guest quote"}
          </button>
        )
      }
    >
      <p className="-mt-3 mb-8 max-w-[64ch] font-display text-[19px] italic leading-snug text-ink-soft">
        Always finding ways to go above and beyond. What guests say about us, by name, read aloud at line-up.
      </p>
      {v.isManager && <StoreTabs />}
      {adding && <NewQuote onDone={() => setAdding(false)} />}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="mb-4">
              <Seg value={filter} onChange={setFilter} options={[{ value: "all", label: `All · ${q.data?.length ?? 0}` }, { value: "named", label: "Naming a colleague" }]} />
            </div>
            {rows.length ? (
              <div className="grid gap-3">
                {rows.map((f) => (
                  <QuoteCard key={f.id} f={f} canManage={v.isManager} />
                ))}
              </div>
            ) : (
              <Empty>No guest quotes yet.</Empty>
            )}
          </div>
          <aside>
            <Stat label="Quotes this month" value={(q.data ?? []).filter((f) => f.receivedOn.startsWith(month)).length} sub="From reviews, cards and emails" />
            <div className="mt-8">
              <SectionTitle>Named by guests</SectionTitle>
              {leaders.length ? (
                leaders.map(([id, x]) => (
                  <Link key={id} href={`/team/${id}`} className="flex items-center justify-between border-b rule py-2 text-[13.5px] hover:underline">
                    {x.name}
                    <span className="figure">{x.n}</span>
                  </Link>
                ))
              ) : (
                <div className="text-[13px] text-ink-soft">Nobody named yet this month.</div>
              )}
              <div className="mt-3 text-[12px] text-ink-soft">A quote naming someone counts toward Guest quote recognition and the peer-restaurant dinner.</div>
            </div>
          </aside>
        </div>
      )}
    </Page>
  );
}

function NewQuote({ onDone }: { onDone: () => void }) {
  const v = useViewer();
  const team = useTeam(v.storeId);
  const create = useCreateFeedback();
  const [f, setF] = useState({
    source: "OpenTable" as (typeof FEEDBACK_SOURCES)[number],
    guestName: "",
    rating: 5 as number | null,
    quote: "",
    receivedOn: v.me.today ?? new Date().toISOString().slice(0, 10),
    memberIds: [] as string[],
    pin: false,
  });
  const staff = (team.data ?? []).filter((m) => !isManagementRole(m.role));
  return (
    <form
      className="mb-10 rounded-[2px] border-2 border-ink p-5 md:p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await create.mutateAsync({ storeId: v.storeId, ...f }).catch(() => null);
        if (r) onDone();
      }}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <span className="label">Source</span>
          <select aria-label="Source" className="field" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as typeof f.source })}>
            {FEEDBACK_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Guest (optional)</span>
          <input aria-label="Guest name" className="field" value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} placeholder="Margaret T." />
        </div>
        <div>
          <span className="label">Stars</span>
          <select aria-label="Stars" className="field" value={f.rating ?? ""} onChange={(e) => setF({ ...f, rating: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Received</span>
          <input aria-label="Received on" type="date" className="field" value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} />
        </div>
      </div>
      <div className="mt-4">
        <span className="label">What they said</span>
        <textarea aria-label="Quote" className="field !h-24 py-2" required minLength={8} value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} />
      </div>
      <div className="mt-4">
        <span className="label">Who they named</span>
        <div className="flex flex-wrap gap-1.5">
          {staff.map((m) => {
            const on = f.memberIds.includes(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setF({ ...f, memberIds: on ? f.memberIds.filter((x) => x !== m.id) : [...f.memberIds, m.id] })}
                className={cn("chip !px-3 !py-1 !text-[12px]", on ? "!border-ink bg-ink !text-paper" : "hover:!border-ink")}
              >
                {m.name} · {ROLE_LABEL[m.role]}
              </button>
            );
          })}
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[13px]">
        <input type="checkbox" aria-label="Pin to tonight's line-up" className="accent-[#1c1915]" checked={f.pin} onChange={(e) => setF({ ...f, pin: e.target.checked })} />
        Pin to tonight's line-up (replaces today's pinned quote)
      </label>
      {create.error && <div className="mt-2 text-[13px] text-oxblood">{errMsg(create.error)}</div>}
      <button className="btn btn-ink mt-4" disabled={create.isPending}>
        Save quote
      </button>
    </form>
  );
}
