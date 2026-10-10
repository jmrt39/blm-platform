// Edit one item of a client's program: structured fields, a preview beside the BLM standard, and AI redrafts.
import { useEffect, useState } from "react";
import type { z } from "zod";
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Seg } from "./bits";
import { ErrorNote, Loading } from "./shell";
import { AiChip, StatusChip } from "./studio-board";
import { useCancelDraft, useDraftItems, useRemoveItem, useResetItem, useSaveItem, useSetItemStatus, useStudioItem } from "../queries/studio";
import {
  MODULE_CATEGORIES,
  ROLE_KEYS,
  type checklistSchema,
  type moduleSchema,
  type quizSchema,
  type rewardSchema,
  type rubricSchema,
  type talkingPointsSchema,
  type ContentType,
} from "../../shared/library/schemas";
import { ROLE_LABEL } from "../../shared/domain";
import { cn } from "../lib/utils";

type ModuleD = z.infer<typeof moduleSchema>;
type QuizD = z.infer<typeof quizSchema>;
type RubricD = z.infer<typeof rubricSchema>;
type RewardD = z.infer<typeof rewardSchema>;
type ChecklistD = z.infer<typeof checklistSchema>;
type PointsD = z.infer<typeof talkingPointsSchema>;
type Section = ModuleD["sections"][number];

/* ───────────────────────── small inputs ───────────────────────── */

function L({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
const T = ({ value, onChange, rows = 3, mono, label = "Text" }: { value: string; onChange: (v: string) => void; rows?: number; mono?: boolean; label?: string }) => (
  <textarea aria-label={label} className={cn("field !h-auto py-2 text-[13px] leading-relaxed", mono && "font-mono text-[12px]")} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
);
const I = ({ value, onChange, className, label = "Text" }: { value: string; onChange: (v: string) => void; className?: string; label?: string }) => (
  <input aria-label={label} className={cn("field !h-9 text-[13.5px]", className)} value={value} onChange={(e) => onChange(e.target.value)} />
);

function Roles({ value, onChange }: { value: string[]; onChange: (v: (typeof ROLE_KEYS)[number][]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLE_KEYS.map((r) => {
        const on = value.includes(r);
        return (
          <button
            type="button"
            key={r}
            onClick={() => onChange((on ? value.filter((x) => x !== r) : [...value, r]) as (typeof ROLE_KEYS)[number][])}
            className={cn("chip", on ? "!border-ink !bg-ink !text-paper" : "hover:border-ink")}
          >
            {ROLE_LABEL[r] ?? r}
          </button>
        );
      })}
    </div>
  );
}

/** Up, down and remove for a row in a list. */
function RowTools({ i, n, move, remove }: { i: number; n: number; move: (from: number, to: number) => void; remove: () => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 text-ink-soft">
      <button type="button" aria-label="Move up" disabled={i === 0} className="p-1 hover:text-ink disabled:opacity-25" onClick={() => move(i, i - 1)}>
        <ArrowUp className="size-3.5" />
      </button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} className="p-1 hover:text-ink disabled:opacity-25" onClick={() => move(i, i + 1)}>
        <ArrowDown className="size-3.5" />
      </button>
      <button type="button" aria-label="Remove" className="p-1 hover:text-oxblood" onClick={remove}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function listOps<T>(arr: T[], set: (a: T[]) => void) {
  return {
    patch: (i: number, p: Partial<T>) => set(arr.map((x, j) => (j === i ? { ...x, ...p } : x))),
    remove: (i: number) => set(arr.filter((_, j) => j !== i)),
    move: (a: number, b: number) => {
      const nx = [...arr];
      const [x] = nx.splice(a, 1);
      nx.splice(b, 0, x!);
      set(nx);
    },
    add: (x: T) => set([...arr, x]),
  };
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "criterion";

/* ───────────────────────── editors ───────────────────────── */

function tableText(t: Section["table"]) {
  return t ? [t.head, ...t.rows].map((r) => r.join(" | ")).join("\n") : "";
}
function parseTable(v: string): Section["table"] {
  const rows = lines(v).map((l) => l.split("|").map((c) => c.trim()));
  if (!rows.length) return undefined;
  const head = rows[0]!.slice(0, 6);
  return { head, rows: rows.slice(1).map((r) => head.map((_, k) => r[k] ?? "")) };
}

function SectionEditor({ s, onChange }: { s: Section; onChange: (s: Section) => void }) {
  const [tbl, setTbl] = useState(() => tableText(s.table));
  const opt = (v: string) => (v.trim() ? v : undefined);
  return (
    <div className="space-y-2.5">
      <I value={s.h} onChange={(h) => onChange({ ...s, h })} className="font-semibold" />
      <L label="Paragraph">
        <T value={s.p ?? ""} onChange={(p) => onChange({ ...s, p: opt(p) })} />
      </L>
      <L label="Bullet points, one per line">
        <T value={(s.list ?? []).join("\n")} onChange={(v) => onChange({ ...s, list: lines(v).length ? lines(v) : undefined })} rows={Math.min(8, Math.max(2, (s.list?.length ?? 0) + 1))} />
      </L>
      <L label="Table: first line is the header, cells split with |">
        <T
          mono
          value={tbl}
          rows={Math.min(10, Math.max(2, tbl.split("\n").length + 1))}
          onChange={(v) => {
            setTbl(v);
            onChange({ ...s, table: parseTable(v) });
          }}
        />
      </L>
      <div className="grid gap-2.5 md:grid-cols-2">
        <L label="Say it like this">
          <T value={s.say ?? ""} onChange={(v) => onChange({ ...s, say: opt(v) })} rows={2} />
        </L>
        <L label="Standard or warning">
          <T value={s.note ?? ""} onChange={(v) => onChange({ ...s, note: opt(v) })} rows={2} />
        </L>
      </div>
    </div>
  );
}

function ModuleEditor({ d, set }: { d: ModuleD; set: (d: ModuleD) => void }) {
  const ops = listOps(d.sections, (sections) => set({ ...d, sections }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_170px_90px]">
        <L label="Title">
          <I value={d.title} onChange={(title) => set({ ...d, title })} />
        </L>
        <L label="Category">
          <select className="field !h-9" value={d.category} onChange={(e) => set({ ...d, category: e.target.value as ModuleD["category"] })}>
            {MODULE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </L>
        <L label="Minutes">
          <I value={String(d.minutes)} onChange={(v) => set({ ...d, minutes: Number(v.replace(/\D/g, "")) || 1 })} />
        </L>
      </div>
      <L label="Summary">
        <T value={d.summary} onChange={(summary) => set({ ...d, summary })} rows={2} />
      </L>
      <L label="Who takes it">
        <Roles value={d.roles} onChange={(roles) => set({ ...d, roles })} />
      </L>
      <div className="text-[12px] text-ink-soft">
        Module {d.n} · {d.manual ? d.manual.replace(/(\d)\s*[-–]\s*(\d)/g, "$1 to $2") : "no manual pages"}
        {d.quiz ? ` · quiz ${d.quiz}` : ""}
        {d.rubric ? ` · checked with ${d.rubric}` : ""}
      </div>
      <div className="eyebrow pt-2">Sections</div>
      {d.sections.map((s, i) => (
        <div key={i} className="border border-paper-line bg-paper-2/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="figure text-[13px] text-gold-deep">{i + 1}</span>
            <RowTools i={i} n={d.sections.length} move={ops.move} remove={() => ops.remove(i)} />
          </div>
          <SectionEditor s={s} onChange={(x) => ops.patch(i, x)} />
        </div>
      ))}
      <button type="button" className="btn btn-line !h-9" onClick={() => ops.add({ h: "New section" })}>
        <Plus className="size-4" /> Add a section
      </button>
    </div>
  );
}

function QuizEditor({ d, set }: { d: QuizD; set: (d: QuizD) => void }) {
  const ops = listOps(d.questions, (questions) => set({ ...d, questions }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_130px_150px]">
        <L label="Title">
          <I value={d.title} onChange={(title) => set({ ...d, title })} />
        </L>
        <L label="Level">
          <select className="field !h-9" value={d.level} onChange={(e) => set({ ...d, level: e.target.value as QuizD["level"] })}>
            <option>Core</option>
            <option>Advanced</option>
          </select>
        </L>
        <L label="Kind">
          <select className="field !h-9" value={d.kind ?? "knowledge"} onChange={(e) => set({ ...d, kind: e.target.value as "knowledge" | "pos" })}>
            <option value="knowledge">Knowledge</option>
            <option value="pos">POS check</option>
          </select>
        </L>
      </div>
      {d.questions.map((q, i) => (
        <div key={q.id} className="border border-paper-line bg-paper-2/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="figure text-[13px] text-gold-deep">Question {i + 1}</span>
            <RowTools i={i} n={d.questions.length} move={ops.move} remove={() => ops.remove(i)} />
          </div>
          <T value={q.q} onChange={(v) => ops.patch(i, { q: v })} rows={2} />
          <div className="mt-2 space-y-1.5">
            {q.choices.map((c, k) => (
              <div key={k} className="flex items-center gap-2">
                <input type="radio" name={`ans-${q.id}`} aria-label="Correct answer" checked={q.answer === k} onChange={() => ops.patch(i, { answer: k })} />
                <I value={c} onChange={(v) => ops.patch(i, { choices: q.choices.map((x, j) => (j === k ? v : x)) })} className={cn("flex-1", q.answer === k && "!border-sage")} />
                <button
                  type="button"
                  aria-label="Remove choice"
                  disabled={q.choices.length <= 2}
                  className="p-1 text-ink-soft hover:text-oxblood disabled:opacity-25"
                  onClick={() => ops.patch(i, { choices: q.choices.filter((_, j) => j !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {q.choices.length < 6 && (
              <button type="button" className="text-[12px] font-semibold text-ink-soft hover:text-ink" onClick={() => ops.patch(i, { choices: [...q.choices, ""] })}>
                + Add a choice
              </button>
            )}
          </div>
          <L label="Why (shown after answering)" className="mt-2">
            <T value={q.why} onChange={(v) => ops.patch(i, { why: v })} rows={2} />
          </L>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-line !h-9"
        onClick={() => ops.add({ id: `${d.slug}-${Date.now().toString(36)}`, q: "", choices: ["", "", "", ""], answer: 0, why: "" })}
      >
        <Plus className="size-4" /> Add a question
      </button>
    </div>
  );
}

function RubricEditor({ d, set }: { d: RubricD; set: (d: RubricD) => void }) {
  const ops = listOps(d.criteria, (criteria) => set({ ...d, criteria }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_150px_150px]">
        <L label="Title">
          <I value={d.title} onChange={(title) => set({ ...d, title })} />
        </L>
        <L label="Kind">
          <select className="field !h-9" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as RubricD["kind"] })}>
            <option value="floor">Floor exercise</option>
            <option value="skill">Skills check</option>
          </select>
        </L>
        <L label="Repeats">
          <select className="field !h-9" value={d.repeat ?? ""} onChange={(e) => set({ ...d, repeat: (e.target.value || undefined) as RubricD["repeat"] })}>
            <option value="">Once</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </L>
      </div>
      <L label="Summary">
        <T value={d.summary} onChange={(summary) => set({ ...d, summary })} rows={2} />
      </L>
      <L label="Who is checked">
        <Roles value={d.roles} onChange={(roles) => set({ ...d, roles })} />
      </L>
      <div className="eyebrow pt-2">Criteria, scored 1 to 4</div>
      {d.criteria.map((c, i) => (
        <div key={c.key} className="grid grid-cols-[1fr_auto] gap-2 border border-paper-line bg-paper-2/30 p-3">
          <div className="space-y-1.5">
            <I value={c.label} onChange={(label) => ops.patch(i, { label })} className="font-semibold" />
            <T value={c.look} onChange={(look) => ops.patch(i, { look })} rows={2} />
          </div>
          <RowTools i={i} n={d.criteria.length} move={ops.move} remove={() => ops.remove(i)} />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-line !h-9"
        onClick={() => {
          let k = keyOf("new criterion");
          while (d.criteria.some((c) => c.key === k)) k = `${k}_2`;
          ops.add({ key: k, label: "New criterion", look: "" });
        }}
      >
        <Plus className="size-4" /> Add a criterion
      </button>
    </div>
  );
}

function RewardEditor({ d, set }: { d: RewardD; set: (d: RewardD) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_150px]">
        <L label="Title">
          <I value={d.title} onChange={(title) => set({ ...d, title })} />
        </L>
        <L label="How often">
          <select className="field !h-9" value={d.cadence} onChange={(e) => set({ ...d, cadence: e.target.value as RewardD["cadence"] })}>
            {["Each shift", "Monthly", "Quarterly", "Annual"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </L>
      </div>
      <L label="What they get">
        <I value={d.value} onChange={(value) => set({ ...d, value })} />
      </L>
      <L label="How it is earned">
        <T value={d.rule} onChange={(rule) => set({ ...d, rule })} rows={4} />
      </L>
    </div>
  );
}

function ChecklistEditor({ d, set }: { d: ChecklistD; set: (d: ChecklistD) => void }) {
  const ops = listOps(d.lines, (ls) => set({ ...d, lines: ls }));
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[150px_1fr_auto] gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        <span>Area</span>
        <span>Task</span>
        <span />
      </div>
      {d.lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[150px_1fr_auto] items-center gap-2">
          <I value={l.area} onChange={(area) => ops.patch(i, { area })} />
          <I value={l.title} onChange={(title) => ops.patch(i, { title })} />
          <RowTools i={i} n={d.lines.length} move={ops.move} remove={() => ops.remove(i)} />
        </div>
      ))}
      <button type="button" className="btn btn-line mt-2 !h-9" onClick={() => ops.add({ area: d.lines[d.lines.length - 1]?.area ?? "Floor", title: "" })}>
        <Plus className="size-4" /> Add a line
      </button>
    </div>
  );
}

function PointsEditor({ d, set }: { d: PointsD; set: (d: PointsD) => void }) {
  const ops = listOps(d.points, (points) => set({ ...d, points }));
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[130px_1fr_auto] gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        <span>Topic</span>
        <span>Talking point</span>
        <span />
      </div>
      {d.points.map((p, i) => (
        <div key={i} className="grid grid-cols-[130px_1fr_auto] items-start gap-2">
          <I value={p.tag} onChange={(tag) => ops.patch(i, { tag })} />
          <T value={p.text} onChange={(text) => ops.patch(i, { text })} rows={2} />
          <RowTools i={i} n={d.points.length} move={ops.move} remove={() => ops.remove(i)} />
        </div>
      ))}
      <button type="button" className="btn btn-line mt-2 !h-9" onClick={() => ops.add({ tag: d.points[d.points.length - 1]?.tag ?? "Service", text: "" })}>
        <Plus className="size-4" /> Add a point
      </button>
    </div>
  );
}

/* ───────────────────────── preview ───────────────────────── */

export function ItemPreview({ type, data }: { type: ContentType; data: unknown }) {
  if (!data) return <div className="text-[13px] italic text-ink-soft">No BLM standard version. This item was written for this house.</div>;
  if (type === "module") {
    const m = data as ModuleD;
    return (
      <div className="space-y-4 text-[13px] leading-relaxed">
        <div>
          <div className="font-display text-[20px] text-ink">{m.title}</div>
          <div className="text-ink-soft">{m.summary}</div>
        </div>
        {m.sections.map((s, i) => (
          <div key={i}>
            <div className="font-semibold text-ink">{s.h}</div>
            {s.p && <p className="mt-1 text-ink">{s.p}</p>}
            {s.list && (
              <ul className="mt-1 list-disc pl-5">
                {s.list.map((x, k) => (
                  <li key={k}>{x}</li>
                ))}
              </ul>
            )}
            {s.table && (
              <table className="tbl mt-1.5 !text-[12px]">
                <thead>
                  <tr>
                    {s.table.head.map((h, k) => (
                      <th key={k}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, k) => (
                    <tr key={k}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.say && <p className="mt-1 border-l-2 border-gold pl-3 font-display italic">“{s.say}”</p>}
            {s.note && <p className="mt-1 text-[12px] font-semibold text-oxblood">{s.note}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (type === "quiz") {
    const q = data as QuizD;
    return (
      <ol className="list-decimal space-y-3 pl-5 text-[13px]">
        {q.questions.map((x) => (
          <li key={x.id}>
            <div className="font-semibold">{x.q}</div>
            <ul className="mt-0.5">
              {x.choices.map((c, k) => (
                <li key={k} className={k === x.answer ? "font-semibold text-sage" : "text-ink-soft"}>
                  {k === x.answer ? "✓ " : "· "}
                  {c}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );
  }
  if (type === "rubric") {
    const r = data as RubricD;
    return (
      <div className="space-y-2 text-[13px]">
        <div className="text-ink-soft">{r.summary}</div>
        {r.criteria.map((c) => (
          <div key={c.key}>
            <span className="font-semibold">{c.label}.</span> {c.look}
          </div>
        ))}
      </div>
    );
  }
  if (type === "reward") {
    const r = data as RewardD;
    return (
      <div className="space-y-1 text-[13px]">
        <div className="font-semibold">
          {r.title} · {r.cadence}
        </div>
        <div>{r.value}</div>
        <div className="text-ink-soft">{r.rule}</div>
      </div>
    );
  }
  if (type === "checklist")
    return (
      <ul className="space-y-1 text-[13px]">
        {(data as ChecklistD).lines.map((l, i) => (
          <li key={i}>
            <span className="text-ink-soft">{l.area}:</span> {l.title}
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="space-y-1.5 text-[13px]">
      {(data as PointsD).points.map((p, i) => (
        <li key={i}>
          <span className="chip mr-1.5">{p.tag}</span>
          {p.text}
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── drawer ───────────────────────── */

type View = "edit" | "compare" | "json";

function Form({ item, orgName, onClose }: { item: NonNullable<ReturnType<typeof useStudioItem>["data"]>; orgName: string; onClose: () => void }) {
  const save = useSaveItem();
  const status = useSetItemStatus();
  const draft = useDraftItems();
  const cancel = useCancelDraft();
  const reset = useResetItem();
  const remove = useRemoveItem();
  const [d, setD] = useState<unknown>(() => structuredClone(item.data));
  const [view, setView] = useState<View>("edit");
  const [json, setJson] = useState(() => JSON.stringify(item.data, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(item.ask ?? "");
  const type = item.type as ContentType;
  const dirty = JSON.stringify(d) !== JSON.stringify(item.data);
  const busy = item.aiState === "queued" || item.aiState === "working";
  const set = (x: unknown) => (setD(x), setJson(JSON.stringify(x, null, 2)));
  const err = save.error ?? status.error ?? draft.error ?? reset.error ?? remove.error;

  const editor = (() => {
    if (type === "module") return <ModuleEditor d={d as ModuleD} set={set} />;
    if (type === "quiz") return <QuizEditor d={d as QuizD} set={set} />;
    if (type === "rubric") return <RubricEditor d={d as RubricD} set={set} />;
    if (type === "reward") return <RewardEditor d={d as RewardD} set={set} />;
    if (type === "checklist") return <ChecklistEditor d={d as ChecklistD} set={set} />;
    return <PointsEditor d={d as PointsD} set={set} />;
  })();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-paper-line px-7 pb-4">
        <StatusChip status={item.status} />
        <AiChip state={item.aiState} error={item.aiError} />
        <span className="chip">{item.origin === "standard" ? "BLM standard" : item.origin === "ai" ? "AI draft" : "Edited"}</span>
        <div className="ml-auto">
          <Seg<View>
            value={view}
            onChange={setView}
            options={[
              { value: "edit", label: "Edit" },
              { value: "compare", label: "Compare" },
              { value: "json", label: "JSON" },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 py-5">
        {item.aiState === "failed" && (
          <div className="mb-4 border border-oxblood/40 bg-oxblood/5 px-3 py-2 text-[13px] text-oxblood">
            The last draft failed: {item.aiError ?? "unknown error"}.{" "}
            <button className="font-semibold underline" onClick={() => cancel.mutate({ id: item.id })}>
              Dismiss
            </button>
          </div>
        )}
        {item.note && item.origin !== "standard" && (
          <div className="mb-4 border-l-2 border-gold bg-gold/10 px-3 py-2 text-[13px] text-ink">
            <span className="font-semibold">AI note:</span> {item.note}
          </div>
        )}
        {busy ? (
          <div className="py-10 text-center text-[13.5px] text-ink-soft">The AI is rewriting this for {orgName}. It opens here when it is done.</div>
        ) : view === "edit" ? (
          editor
        ) : view === "compare" ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="eyebrow mb-3">{orgName}</div>
              <ItemPreview type={type} data={d} />
            </div>
            <div className="border-l border-paper-line pl-6">
              <div className="eyebrow mb-3 !text-ink-soft">BLM standard</div>
              <ItemPreview type={type} data={item.standard} />
            </div>
          </div>
        ) : (
          <div>
            <textarea
              aria-label="JSON"
              className="field !h-[60vh] py-2 font-mono text-[11.5px]"
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                try {
                  setD(JSON.parse(e.target.value));
                  setJsonErr(null);
                } catch (x) {
                  setJsonErr(x instanceof Error ? x.message : "Invalid JSON");
                }
              }}
            />
            {jsonErr && <div className="mt-1 text-[12px] text-oxblood">{jsonErr}</div>}
          </div>
        )}
      </div>
      <div className="space-y-3 border-t border-paper-line bg-paper-2/50 px-7 py-4">
        <ErrorNote error={err} />
        <div className="flex gap-2">
          <input
            aria-label="Instructions for the AI"
            className="field flex-1 !h-9 text-[13px]"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            disabled={busy}
            placeholder={`Ask the AI: adapt to ${orgName}, use the new wine list, make it a POS check…`}
          />
          <button className="btn btn-line !h-9" disabled={busy || draft.isPending || dirty} title={dirty ? "Save or discard your edits first" : ""} onClick={() => draft.mutate({ ids: [item.id], instructions: ask })}>
            <Sparkles className="size-4" /> {item.origin === "standard" ? "Adapt" : "Redraft"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <>
              <button className="btn btn-ink" disabled={save.isPending || !!jsonErr} onClick={() => save.mutate({ id: item.id, data: d })}>
                Save
              </button>
              <button
                className="btn btn-gold"
                disabled={save.isPending || !!jsonErr}
                onClick={async () => {
                  const ok = await save.mutateAsync({ id: item.id, data: d }).catch(() => null);
                  if (ok) status.mutate({ ids: [item.id], status: "approved" }, { onSuccess: onClose });
                }}
              >
                <Check className="size-4" /> Save and approve
              </button>
              <button className="btn btn-line" onClick={() => set(structuredClone(item.data))}>
                Discard
              </button>
            </>
          ) : item.status === "approved" ? (
            <button className="btn btn-line" disabled={busy || status.isPending} onClick={() => status.mutate({ ids: [item.id], status: "draft" })}>
              Back to draft
            </button>
          ) : (
            <button className="btn btn-gold" disabled={busy || status.isPending} onClick={() => status.mutate({ ids: [item.id], status: "approved" }, { onSuccess: onClose })}>
              <Check className="size-4" /> Approve
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {item.standard && item.origin !== "standard" && (
              <button className="btn btn-line" disabled={busy || reset.isPending} onClick={() => confirm("Put the BLM standard version back? Your edits and the AI draft are replaced.") && reset.mutate({ id: item.id })}>
                <RotateCcw className="size-4" /> Standard
              </button>
            )}
            {item.status !== "excluded" ? (
              <button className="btn btn-line" disabled={busy || status.isPending} onClick={() => status.mutate({ ids: [item.id], status: "excluded" }, { onSuccess: onClose })}>
                Exclude
              </button>
            ) : (
              <button className="btn btn-line" disabled={status.isPending} onClick={() => status.mutate({ ids: [item.id], status: "draft" })}>
                Include again
              </button>
            )}
            {!item.standard && (
              <button
                aria-label="Delete"
                className="btn btn-line !px-3 hover:!border-oxblood hover:!text-oxblood"
                disabled={busy || remove.isPending}
                onClick={() => confirm(`Delete ${item.title}?`) && remove.mutate({ id: item.id }, { onSuccess: onClose })}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function StudioEditor({ id, orgName, onClose }: { id: string; orgName: string; onClose: () => void }) {
  const q = useStudioItem(id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button type="button" tabIndex={-1} aria-label="Close the editor" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="sheet relative flex h-full w-full max-w-[880px] flex-col !rounded-none">
        <div className="flex items-start justify-between gap-4 px-7 pb-3 pt-7">
          <div className="min-w-0">
            <div className="eyebrow">{q.data ? { module: "Training module", quiz: "Quiz", rubric: "Floor exercise or skills check", reward: "Reward", checklist: "Checklist", talking_points: "Line up" }[q.data.type] : "Loading"}</div>
            <div className="truncate font-display text-[28px] leading-tight text-ink">{q.data?.title ?? ""}</div>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1 text-ink-soft hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        {q.isLoading ? <Loading /> : q.data ? <Form key={JSON.stringify(q.data.data) + q.data.aiState} item={q.data} orgName={orgName} onClose={onClose} /> : <ErrorNote error={q.error} />}
      </div>
    </div>
  );
}
