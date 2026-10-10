// The Build board: every piece of the client's program, its draft state, and bulk actions.
import { useMemo, useState } from "react";
import { Check, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { Empty, Seg } from "./bits";
import { ErrorNote } from "./shell";
import { StudioEditor } from "./studio-editor";
import { useCreateItem, useDraftItems, useSetItemStatus } from "../queries/studio";
import { CONTENT_TYPE_LABEL, CONTENT_TYPES, type ContentType } from "../../shared/library/schemas";
import { cn } from "../lib/utils";
import type { Build } from "../pages/studio-client";

type Item = Build["items"][number];
type Filter = "all" | "draft" | "approved" | "excluded";

const ORIGIN: Record<string, string> = { standard: "BLM standard", ai: "AI draft", edited: "Edited" };

function meta(i: Item) {
  const bits: string[] = [];
  if (i.type === "quiz") bits.push(i.kind === "pos" ? "POS check" : "Knowledge", `${i.size} questions`);
  if (i.type === "module") bits.push(`${i.size} sections`);
  if (i.type === "rubric") bits.push(i.kind === "floor" ? "Floor exercise" : "Skills check", `${i.size} criteria`, ...(i.repeat ? [`repeats ${i.repeat}`] : []));
  if (i.type === "checklist") bits.push(`${i.size} lines`);
  if (i.type === "talking_points") bits.push(`${i.size} points`);
  return bits.join(" · ");
}

export function AiChip({ state, error }: { state: string; error?: string | null }) {
  if (state === "queued") return <span className="chip !border-gold/60 !text-gold-deep">Queued</span>;
  if (state === "working")
    return (
      <span className="chip !border-gold/60 !text-gold-deep">
        <Loader2 className="size-3 animate-spin" /> Writing
      </span>
    );
  if (state === "failed")
    return (
      <span className="chip !border-oxblood/50 !text-oxblood" title={error ?? ""}>
        Draft failed
      </span>
    );
  return null;
}

export function StatusChip({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="chip !border-sage/50 !text-sage">
        <Check className="size-3" /> Approved
      </span>
    );
  if (status === "excluded") return <span className="chip !text-ink-soft/70 line-through">Excluded</span>;
  return <span className="chip">Draft</span>;
}

const PRESETS: { type: "module" | "quiz" | "rubric"; label: string; text: string }[] = [
  { type: "quiz", label: "POS knowledge check", text: "A POS knowledge check on this house's system: ringing in modifiers, splitting checks, comps and voids that need a manager, and closing out. Mark it as a POS check." },
  { type: "rubric", label: "Repeatable bottle drill", text: "A monthly floor exercise: presenting and selling a bottle of wine at a table of three or more, from the house list. Repeats monthly." },
  { type: "rubric", label: "Weekly greeting drill", text: "A weekly floor exercise on the first two minutes at the table: greeting time, water, the opening line and the first drink suggestion. Repeats weekly." },
  { type: "module", label: "Wine list module", text: "A training module that teaches this house's wine list: every by the glass pour, the bottles to recommend first, and food pairings from the menu." },
  { type: "module", label: "Cocktail module", text: "A training module on the bar and cocktail list: specs, glassware, garnish, and how to describe each drink in one sentence." },
  { type: "quiz", label: "Allergy quiz", text: "A quiz on the allergy protocol and which dishes on the menu carry each major allergen." },
];

function CreatePanel({ orgId, onMade }: { orgId: string; onMade: (id: string) => void }) {
  const create = useCreateItem();
  const [type, setType] = useState<"module" | "quiz" | "rubric">("quiz");
  const [text, setText] = useState("");
  return (
    <div className="border border-paper-line bg-paper-2/40 p-5">
      <div className="eyebrow mb-1">Write something new for this house</div>
      <p className="mb-4 text-[12.5px] text-ink-soft">The AI writes from the brief and the material. It arrives as a draft for you to edit and approve.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip hover:border-ink hover:text-ink" onClick={() => (setType(p.type), setText(p.text))}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <select aria-label="Type" className="field" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="module">Training module</option>
          <option value="quiz">Quiz or POS check</option>
          <option value="rubric">Floor exercise or skills check</option>
        </select>
        <textarea aria-label="What should it cover" className="field !h-auto py-2 text-[13px]" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should it cover?" />
      </div>
      <ErrorNote error={create.error} />
      <button
        className="btn btn-ink mt-3"
        disabled={create.isPending || text.trim().length < 5}
        onClick={async () => {
          const r = await create.mutateAsync({ orgId, type, instructions: text }).catch(() => null);
          if (r) {
            setText("");
            onMade(r.id);
          }
        }}
      >
        <Wand2 className="size-4" /> {create.isPending ? "Writing the draft…" : "Write it"}
      </button>
    </div>
  );
}

export function StudioBoard({ b }: { b: Build }) {
  const setStatus = useSetItemStatus();
  const draft = useDraftItems();
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const shown = b.items.filter((i) => filter === "all" || i.status === filter);
  const groups = useMemo(() => CONTENT_TYPES.map((t) => ({ type: t, items: shown.filter((i) => i.type === t) })).filter((g) => g.items.length), [shown]);
  const untouched = b.items.filter((i) => i.origin === "standard" && i.status === "draft" && i.aiState === "idle");
  const n = (s: string) => b.items.filter((i) => i.status === s).length;
  const toggle = (id: string) => setSel((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  const ids = [...sel];
  const done = () => (setSel(new Set()), setAsk(""), setAsking(false));
  const noMaterial = b.sources.length === 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Seg<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${b.items.length}` },
            { value: "draft", label: `Draft ${n("draft")}` },
            { value: "approved", label: `Approved ${n("approved")}` },
            { value: "excluded", label: `Excluded ${n("excluded")}` },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {untouched.length > 0 && (
            <button
              className="btn btn-line"
              disabled={draft.isPending}
              onClick={() =>
                confirm(`Adapt all ${untouched.length} untouched standard items to ${b.org.name}? The AI rewrites them from the brief and material in the background; it takes a few minutes.`) &&
                draft.mutate({ ids: untouched.map((i) => i.id), instructions: "" })
              }
            >
              <Sparkles className="size-4" /> Adapt all {untouched.length} to this house
            </button>
          )}
          <button className="btn btn-ink" onClick={() => setShowCreate((s) => !s)}>
            <Wand2 className="size-4" /> New item
          </button>
        </div>
      </div>
      {noMaterial && <div className="mb-5 border border-gold/50 bg-gold/10 px-4 py-3 text-[13px] text-ink">No material collected yet. Drafts can only use the BLM standard and the brief until you add the menu and standards.</div>}
      {showCreate && (
        <div className="mb-6">
          <CreatePanel orgId={b.org.id} onMade={(id) => (setShowCreate(false), setOpen(id))} />
        </div>
      )}
      <ErrorNote error={setStatus.error ?? draft.error} />

      {sel.size > 0 && (
        <div className="sticky top-[72px] z-20 mb-5 border border-ink bg-paper p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-[13px] font-semibold">{sel.size} selected</span>
            <button className="btn btn-line !h-9" onClick={() => setAsking((a) => !a)}>
              <Sparkles className="size-4" /> Draft with AI
            </button>
            <button className="btn btn-ink !h-9" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ ids, status: "approved" }, { onSuccess: done })}>
              <Check className="size-4" /> Approve
            </button>
            <button className="btn btn-line !h-9" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ ids, status: "excluded" }, { onSuccess: done })}>
              Exclude
            </button>
            <button className="btn btn-line !h-9" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ ids, status: "draft" }, { onSuccess: done })}>
              Back to draft
            </button>
            <button aria-label="Clear selection" className="ml-auto text-ink-soft hover:text-ink" onClick={done}>
              <X className="size-4" />
            </button>
          </div>
          {asking && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input aria-label="Instructions for the AI" className="field min-w-[260px] flex-1 !h-9" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Optional: what to change (use the fall menu, push the reserve list…)" />
              <button className="btn btn-ink !h-9" disabled={draft.isPending} onClick={() => draft.mutate({ ids, instructions: ask }, { onSuccess: done })}>
                Queue {sel.size} drafts
              </button>
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <div className="space-y-9">
          {groups.map((g) => {
            const all = g.items.every((i) => sel.has(i.id));
            return (
              <section key={g.type}>
                <div className="mb-2 flex items-center gap-3 border-b border-ink pb-2">
                  <input
                    type="checkbox"
                    aria-label={`Select all ${CONTENT_TYPE_LABEL[g.type]}`}
                    checked={all}
                    onChange={() => setSel((p) => {
                      const nx = new Set(p);
                      g.items.forEach((i) => (all ? nx.delete(i.id) : nx.add(i.id)));
                      return nx;
                    })}
                  />
                  <h2 className="font-display text-[22px] text-ink">{CONTENT_TYPE_LABEL[g.type as ContentType]}</h2>
                  <span className="text-[12px] text-ink-soft">
                    {g.items.filter((i) => i.status === "approved").length} of {g.items.length} approved
                  </span>
                </div>
                <ul className="divide-y divide-paper-line">
                  {g.items.map((i) => (
                    <li key={i.id} className={cn("flex items-start gap-3 py-2.5", i.status === "excluded" && "opacity-55")}>
                      <input type="checkbox" className="mt-1.5" aria-label={`Select ${i.title}`} checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
                      <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(i.id)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink hover:underline">{i.title}</span>
                          <StatusChip status={i.status} />
                          <AiChip state={i.aiState} error={i.aiError} />
                          {i.foreign && i.status !== "excluded" && <span className="chip !border-oxblood/40 !text-oxblood">Still names 1906</span>}
                        </div>
                        <div className="mt-0.5 text-[12px] text-ink-soft">
                          {ORIGIN[i.origin] ?? i.origin} · {meta(i)}
                          {i.approvedByName && i.status === "approved" ? ` · approved by ${i.approvedByName}` : ""}
                        </div>
                        {i.note && i.origin !== "standard" && <div className="mt-1 line-clamp-1 text-[12px] italic text-ink-soft">AI: {i.note}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {open && <StudioEditor id={open} orgName={b.org.name} onClose={() => setOpen(null)} />}
    </div>
  );
}
