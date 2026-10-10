import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Check, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Empty } from "../components/bits";
import { ScoreChip, SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useCreateUpdate, useMarkUpdateRead, useUpdate, useUpdates } from "../queries/updates";
import { UPDATE_KINDS, type UpdateKind } from "../../shared/program";
import { ROLE_LABEL, STAFF_ROLES } from "../../shared/domain";
import { errMsg } from "../lib/format";
import { cn } from "../lib/utils";

const when = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function UpdatesPage() {
  const v = useViewer();
  const q = useUpdates(v.storeId);
  const [creating, setCreating] = useState(false);
  return (
    <Page
      eyebrow={`${v.store?.name} · Continuing education`}
      title="Seasonal updates"
      aside={
        v.isManager && (
          <button className="btn btn-ink" onClick={() => setCreating((c) => !c)}>
            <Plus className="size-4" /> {creating ? "Close" : "Post an update"}
          </button>
        )
      }
    >
      {v.isManager && <StoreTabs />}
      {creating && <NewUpdate onDone={() => setCreating(false)} />}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : q.data?.length ? (
        <div className="grid gap-4">
          {q.data.map((u) => (
            <Link key={u.id} href={`/updates/${u.id}`} className="grid gap-4 rounded-[2px] border rule p-5 hover:border-ink md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="min-w-0">
                <div className="eyebrow mb-1.5">
                  {u.season} · {UPDATE_KINDS[u.kind as UpdateKind]}
                  {u.roles.length > 0 && ` · ${u.roles.map((r) => ROLE_LABEL[r]).join(", ")}`}
                </div>
                <div className="font-display text-[24px] leading-tight">{u.title}</div>
                <div className="mt-2 line-clamp-2 max-w-[70ch] text-[13.5px] text-ink-soft">{u.body}</div>
                <div className="mt-2 text-[12px] text-ink-soft">
                  {u.items.length} items · {u.quizCount ? `${u.quizCount}-question check` : "no check"} · {u.authorName} · {when(u.publishedAt)}
                </div>
              </div>
              <div className="self-center">
                {u.read != null ? (
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span className={cn("chip", u.read ? "border-sage/50 text-sage" : "border-gold-deep/60 bg-gold/15 text-gold-deep")}>{u.read ? "Read" : "New"}</span>
                    {u.quizCount > 0 && <ScoreChip score={u.quizBest} />}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-ink-soft">Read</span>
                      <span className="figure">
                        {u.readCount}/{u.audience}
                      </span>
                    </div>
                    <Bar value={u.readCount} max={u.audience} tone="gold" />
                    {u.quizCount > 0 && (
                      <>
                        <div className="flex justify-between text-[12px]">
                          <span className="text-ink-soft">Passed the check</span>
                          <span className="figure">
                            {u.passedCount}/{u.audience}
                          </span>
                        </div>
                        <Bar value={u.passedCount} max={u.audience} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>No updates yet. Post the new menu, wines by the glass or a service change and the team gets a read receipt and a quick check.</Empty>
      )}
    </Page>
  );
}

export function UpdateDetail() {
  const { id } = useParams<{ id: string }>();
  const v = useViewer();
  const q = useUpdate(id);
  const read = useMarkUpdateRead();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const u = q.data!;
  return (
    <Page
      eyebrow={
        <Link href="/updates" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> {u.season} · {UPDATE_KINDS[u.kind as UpdateKind]}
        </Link>
      }
      title={u.title}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed">{u.body}</p>
          {u.items.length > 0 && (
            <div className="mt-8 divide-y divide-[var(--paper-line)] border-y rule">
              {u.items.map((it, i) => (
                <div key={i} className="py-3.5">
                  <div className="font-display text-[18px]">{it.name}</div>
                  <div className="mt-0.5 text-[13.5px] text-ink-soft">{it.detail}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 text-[12px] text-ink-soft">
            Posted by {u.authorName} · {when(u.publishedAt)}
          </div>
        </div>
        <aside className="space-y-4">
          {u.read != null && (
            <div className="rounded-[2px] border rule p-5">
              <div className="eyebrow mb-3">Your read receipt</div>
              {u.read ? (
                <div className="flex items-center gap-2 text-[13.5px] text-sage">
                  <Check className="size-4" /> Read
                </div>
              ) : (
                <button className="btn btn-ink w-full" disabled={read.isPending} onClick={() => read.mutate({ id: u.id })}>
                  <Check className="size-4" /> I've read this
                </button>
              )}
              {u.quizCount > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3 border-t rule pt-4">
                  <ScoreChip score={u.quizBest} pass={u.passMark} />
                  <Link href={`/quizzes/${encodeURIComponent(`u:${u.id}`)}`} className="btn btn-line">
                    <ClipboardCheck className="size-4" /> {u.quizBest == null ? "Take the check" : "Retake"}
                  </Link>
                </div>
              )}
            </div>
          )}
          {v.isManager && (
            <div className="rounded-[2px] border rule p-5">
              <SectionTitle aside={<span className="figure text-[14px]">{u.receipts.filter((r) => r.readAt).length}/{u.receipts.length}</span>}>Read receipts</SectionTitle>
              <div className="max-h-[480px] overflow-y-auto">
                {u.receipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b rule py-2 last:border-0">
                    <div>
                      <div className="text-[13px] font-semibold">{r.name}</div>
                      <div className="text-[11px] text-ink-soft">
                        {ROLE_LABEL[r.role]}
                        {r.readAt ? ` · read ${when(r.readAt)}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!r.readAt && <span className="chip border-oxblood/40 text-oxblood">Not read</span>}
                      {u.quizCount > 0 && r.readAt && <ScoreChip score={r.quizBest} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}

type QDraft = { q: string; choices: string[]; answer: number; why: string };

function NewUpdate({ onDone }: { onDone: () => void }) {
  const v = useViewer();
  const [, nav] = useLocation();
  const create = useCreateUpdate();
  const [kind, setKind] = useState<UpdateKind>("menu");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [items, setItems] = useState<{ name: string; detail: string }[]>([{ name: "", detail: "" }]);
  const [roles, setRoles] = useState<string[]>([]);
  const [allStores, setAllStores] = useState(v.isLeader);
  const [quiz, setQuiz] = useState<QDraft[]>([]);
  const storeIds = allStores ? v.me.stores.map((s) => s.id) : [v.storeId];
  return (
    <form
      className="mb-10 rounded-[2px] border-2 border-ink p-5 md:p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await create
          .mutateAsync({
            storeIds,
            kind,
            title,
            body,
            roles,
            items: items.filter((i) => i.name.trim()),
            quiz: quiz.filter((x) => x.q.trim() && x.choices.filter((c) => c.trim()).length >= 2).map((x) => ({ ...x, choices: x.choices.filter((c) => c.trim()) })),
          })
          .catch(() => null);
        if (r) {
          onDone();
          nav(`/updates/${r.id}`);
        }
      }}
    >
      <div className="eyebrow mb-4">New update · read receipts go to everyone it applies to</div>
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <span className="label">Kind</span>
          <select aria-label="Kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as UpdateKind)}>
            {Object.entries(UPDATE_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Title</span>
          <input aria-label="Title" className="field" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Autumn menu: what's new" />
        </div>
      </div>
      <div className="mt-4">
        <span className="label">What the team needs to know</span>
        <textarea aria-label="Body" className="field !h-24 py-2" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="mt-5">
        <span className="label">Items (dishes, wines, changes)</span>
        {items.map((it, i) => (
          <div key={i} className="mb-2 grid gap-2 md:grid-cols-[240px_minmax(0,1fr)_40px]">
            <input aria-label={`Item ${i + 1} name`} className="field" value={it.name} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Name" />
            <input aria-label={`Item ${i + 1} detail`} className="field" value={it.detail} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, detail: e.target.value } : y)))} placeholder="How to describe it, price, pairing" />
            <button type="button" aria-label="Remove item" className="btn btn-line !px-0" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="text-[12.5px] font-semibold underline" onClick={() => setItems((x) => [...x, { name: "", detail: "" }])}>
          Add an item
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="label !mb-0">Who it's for</span>
        {STAFF_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" aria-label={ROLE_LABEL[r]} className="accent-[#1c1915]" checked={roles.includes(r)} onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
            {ROLE_LABEL[r]}
          </label>
        ))}
        <span className="text-[12px] text-ink-soft">{roles.length ? "" : "Everyone if none ticked"}</span>
      </div>
      {v.isLeader && v.me.stores.length > 1 && (
        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" aria-label="Post to all stores" className="accent-[#1c1915]" checked={allStores} onChange={(e) => setAllStores(e.target.checked)} />
          Post to all {v.me.stores.length} stores (otherwise {v.store?.name} only)
        </label>
      )}

      <div className="mt-6 border-t rule pt-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="label !mb-0">Knowledge check (optional)</span>
          <button type="button" className="text-[12.5px] font-semibold underline" onClick={() => setQuiz((x) => [...x, { q: "", choices: ["", "", "", ""], answer: 0, why: "" }])}>
            Add a question
          </button>
        </div>
        {quiz.map((x, i) => (
          <div key={i} className="mb-4 rounded-[2px] bg-paper-2 p-4">
            <input aria-label={`Question ${i + 1}`} className="field" value={x.q} onChange={(e) => setQuiz((qs) => qs.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} placeholder={`Question ${i + 1}`} />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {x.choices.map((c, k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    aria-label={`Correct answer ${k + 1}`}
                    name={`ans-${i}`}
                    className="accent-[#1c1915]"
                    checked={x.answer === k}
                    onChange={() => setQuiz((qs) => qs.map((y, j) => (j === i ? { ...y, answer: k } : y)))}
                  />
                  <input
                    aria-label={`Choice ${k + 1}`}
                    className="field !h-9"
                    value={c}
                    onChange={(e) => setQuiz((qs) => qs.map((y, j) => (j === i ? { ...y, choices: y.choices.map((z, m) => (m === k ? e.target.value : z)) } : y)))}
                    placeholder={`Choice ${String.fromCharCode(65 + k)}`}
                  />
                </label>
              ))}
            </div>
            <input aria-label="Why" className="field mt-2 !h-9" value={x.why} onChange={(e) => setQuiz((qs) => qs.map((y, j) => (j === i ? { ...y, why: e.target.value } : y)))} placeholder="Why it's right (shown after they answer)" />
          </div>
        ))}
      </div>
      {create.error && <div className="mt-2 text-[13px] text-oxblood">{errMsg(create.error)}</div>}
      <button className="btn btn-ink mt-4" disabled={create.isPending || title.length < 3}>
        Publish update
      </button>
    </form>
  );
}
