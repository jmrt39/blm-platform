import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Camera, CheckCircle2, Plus, Wrench, AlertTriangle, StickyNote } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { SectionTitle } from "../components/program-bits";
import { SignaturePad, SignatureView } from "../components/signature";
import { StoreTabs } from "./checklists";
import { useCreateLogWithPhoto, useLog, useLogEntry, useResolveLog } from "../queries/logbook";
import { dayLabel, errMsg, shortDay, timeOf } from "../lib/format";
import { cn } from "../lib/utils";

type Kind = "note" | "maintenance" | "incident";
type Shift = "lunch" | "dinner";

const KIND: Record<Kind, { label: string; icon: typeof StickyNote; tone: string; hint: string }> = {
  note: { label: "Shift note", icon: StickyNote, tone: "border-paper-line text-ink-soft", hint: "Anything the next manager should know." },
  maintenance: { label: "Maintenance", icon: Wrench, tone: "border-gold-deep/50 text-gold-deep", hint: "Stays open until someone marks it fixed." },
  incident: { label: "Incident", icon: AlertTriangle, tone: "border-oxblood/40 text-oxblood", hint: "Guest or staff incidents. Signed by the manager on duty." },
};

function KindChip({ kind }: { kind: Kind }) {
  const k = KIND[kind];
  const Icon = k.icon;
  return (
    <span className={cn("chip inline-flex items-center gap-1", k.tone)}>
      <Icon className="size-3" /> {k.label}
    </span>
  );
}

export default function LogbookPage() {
  const v = useViewer();
  const q = useLog(v.storeId, 21);
  const [filter, setFilter] = useState<"all" | Kind | "open">("all");
  const [adding, setAdding] = useState(false);
  const rows = q.data ?? [];
  const shown = rows.filter((e) => (filter === "all" ? true : filter === "open" ? e.status === "open" : e.kind === filter));
  const byDay = new Map<string, typeof rows>();
  for (const e of shown) byDay.set(e.businessDate, [...(byDay.get(e.businessDate) ?? []), e]);
  return (
    <Page
      eyebrow={v.store?.name}
      title="Manager log book"
      aside={
        !adding && (
          <button className="btn btn-ink" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> New entry
          </button>
        )
      }
    >
      <StoreTabs />
      {adding && <NewEntry onDone={() => setAdding(false)} />}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <div className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat label="Open maintenance" value={rows.filter((e) => e.kind === "maintenance" && e.status === "open").length} tone="gold" sub="Until someone marks it fixed" />
            <Stat label="Open incidents" value={rows.filter((e) => e.kind === "incident" && e.status === "open").length} tone="bad" sub="Need a follow-up note" />
            <Stat label="Entries" value={rows.length} sub="Last 21 days" />
            <Stat label="Photos" value={rows.filter((e) => e.photoUrl).length} sub="Attached to entries" />
          </div>
          <div className="mb-6">
            <Seg
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "note", label: "Notes" },
                { value: "maintenance", label: "Maintenance" },
                { value: "incident", label: "Incidents" },
              ]}
            />
          </div>
          {!shown.length ? (
            <Empty>Nothing here yet. Notes, repairs and incidents from every shift land in one place.</Empty>
          ) : (
            [...byDay.entries()].map(([day, list]) => (
              <div key={day} className="mb-8">
                <SectionTitle>{dayLabel(day)}</SectionTitle>
                <div className="divide-y divide-paper-line border-y rule">
                  {list.map((e) => (
                    <Link key={e.id} href={`/logbook/${e.id}`} className="flex items-start gap-4 px-1 py-4 hover:bg-ink/[0.03]">
                      {e.photoUrl ? (
                        <img src={e.photoUrl} alt="" className="size-14 shrink-0 rounded-[2px] border rule object-cover" />
                      ) : (
                        <div className="grid size-14 shrink-0 place-items-center rounded-[2px] border border-dashed border-paper-line text-ink-soft/50">
                          <Camera className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14.5px] font-semibold">{e.title}</span>
                          <KindChip kind={e.kind} />
                          {e.kind !== "note" &&
                            (e.status === "open" ? (
                              <span className="chip border-oxblood/40 text-oxblood">Open</span>
                            ) : (
                              <span className="chip border-sage/50 text-sage">Resolved</span>
                            ))}
                        </div>
                        {e.body && <div className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{e.body}</div>}
                        <div className="mt-1 text-[11.5px] text-ink-soft">
                          {e.authorName} · {e.shift} · {timeOf(e.createdAt)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </Page>
  );
}

function NewEntry({ onDone }: { onDone: () => void }) {
  const v = useViewer();
  const create = useCreateLogWithPhoto();
  const [kind, setKind] = useState<Kind>("note");
  const [shift, setShift] = useState<Shift>(new Date().getHours() < 16 ? "lunch" : "dinner");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sig, setSig] = useState("");
  const needsSig = kind === "incident";
  return (
    <form
      className="mb-10 rounded-[2px] border-2 border-ink p-5 md:p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await create.mutateAsync({ storeId: v.storeId, shift, kind, title, body, file, signature: needsSig ? sig : null }).catch(() => null);
        if (r) onDone();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Seg value={kind} onChange={setKind} options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k].label }))} />
        <Seg
          value={shift}
          onChange={setShift}
          options={[
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
          ]}
        />
        <span className="text-[12px] text-ink-soft">{KIND[kind].hint}</span>
      </div>
      <div className="mt-5">
        <span className="label">Headline</span>
        <input
          aria-label="Headline"
          className="field"
          required
          minLength={3}
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "maintenance" ? "Walk-in door not sealing" : kind === "incident" ? "Guest slipped by the host stand" : "Table 12 celebrating 40th, comped dessert"}
        />
      </div>
      <div className="mt-4">
        <span className="label">Details</span>
        <textarea aria-label="Details" className="field !h-28 py-2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, who was involved, what you did, what's needed next." />
      </div>
      <div className="mt-4">
        <span className="label">Photo (optional)</span>
        <label className="flex cursor-pointer items-center gap-3 rounded-[2px] border border-dashed border-paper-line px-4 py-3 text-[13px] hover:border-ink">
          <Camera className="size-4" />
          {file ? file.name : "Take or attach a photo"}
          <input aria-label="Photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <img src={URL.createObjectURL(file)} alt="Preview" className="mt-3 max-h-48 rounded-[2px] border rule" />}
      </div>
      {needsSig && (
        <div className="mt-5 max-w-md">
          <SignaturePad onChange={setSig} caption={`Manager on duty · ${v.me.member?.name ?? v.me.user?.name ?? ""}`} />
        </div>
      )}
      {create.error && <div className="mt-3 text-[13px] text-oxblood">{errMsg(create.error)}</div>}
      <div className="mt-5 flex gap-2">
        <button className="btn btn-ink" disabled={create.isPending || (needsSig && sig.length < 10)}>
          {create.isPending ? "Saving" : "Save entry"}
        </button>
        <button type="button" className="btn btn-line" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function LogEntryPage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const q = useLogEntry(id);
  const resolve = useResolveLog();
  const [note, setNote] = useState("");
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const e = q.data!;
  return (
    <Page
      eyebrow={
        <Link href="/logbook" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> Log book · {shortDay(e.businessDate)} {e.shift}
        </Link>
      }
      title={e.title}
      aside={<KindChip kind={e.kind} />}
    >
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{e.body || <span className="text-ink-soft">No details added.</span>}</div>
          {e.photoUrl && <img src={e.photoUrl} alt={e.title} className="mt-6 max-h-[480px] rounded-[2px] border rule" />}
          {e.signature && (
            <div className="mt-6 max-w-xs">
              <div className="label">Signed by the manager on duty</div>
              <SignatureView value={e.signature} className="h-14" />
            </div>
          )}
        </div>
        <aside className="space-y-5 text-[13px]">
          <div>
            <div className="label">Logged by</div>
            {e.authorName} · {e.authorRole}
            <div className="text-ink-soft">
              {dayLabel(e.businessDate)} · {timeOf(e.createdAt)}
            </div>
          </div>
          {e.kind !== "note" &&
            (e.status === "resolved" ? (
              <div className="rounded-[2px] border border-sage/50 bg-sage/5 p-4">
                <div className="flex items-center gap-2 font-semibold text-sage">
                  <CheckCircle2 className="size-4" /> Resolved
                </div>
                <div className="mt-1">
                  {e.resolvedByName}
                  {e.resolvedAt && ` · ${new Date(e.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
                {e.resolvedNote && <div className="mt-2 text-ink-soft">{e.resolvedNote}</div>}
              </div>
            ) : (
              <form
                className="rounded-[2px] border-2 border-ink p-4"
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  const r = await resolve.mutateAsync({ id: e.id, note }).catch(() => null);
                  if (r) nav("/logbook");
                }}
              >
                <div className="label">{e.kind === "maintenance" ? "Mark fixed" : "Close the incident"}</div>
                <textarea
                  aria-label="Resolution note"
                  className="field !h-20 py-2"
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder={e.kind === "maintenance" ? "Who fixed it, cost, invoice number" : "Follow-up taken, who was told"}
                />
                {resolve.error && <div className="mt-2 text-oxblood">{errMsg(resolve.error)}</div>}
                <button className="btn btn-ink mt-3 w-full" disabled={resolve.isPending}>
                  Resolve
                </button>
              </form>
            ))}
        </aside>
      </div>
    </Page>
  );
}
