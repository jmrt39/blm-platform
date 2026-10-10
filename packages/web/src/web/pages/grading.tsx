import { useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { ArrowLeft, Check } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty } from "../components/bits";
import { SignaturePad, SignatureView, SignedStamp } from "../components/signature";
import { RampChip, StarInput, Stars } from "../components/program-bits";
import { useTrainingBoard } from "../queries/training";
import { useCreateGrade, useGrade } from "../queries/grading";
import { STAR_LABELS, gradeAverage } from "../../shared/library/rubrics";
import { useLibrary } from "../queries/library";
import { GRADE_PASS } from "../../shared/program";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

export function GradeNewPage() {
  const v = useViewer();
  const [, nav] = useLocation();
  const search = new URLSearchParams(useSearch());
  const board = useTrainingBoard(v.storeId);
  const [memberId, setMemberId] = useState(search.get("member") ?? "");
  const [rubricSlug, setRubricSlug] = useState(search.get("rubric") ?? "floor-service");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [graderSig, setGraderSig] = useState("");
  const [traineeSig, setTraineeSig] = useState("");
  const create = useCreateGrade();
  const L = useLibrary();
  const { rubricsFor } = L;

  if (board.isLoading) return <Loading />;
  if (board.error) return <ErrorNote error={board.error} />;
  const rows = (board.data?.rows ?? []).filter((r) => r.id !== v.me.member?.id);
  const member = rows.find((r) => r.id === memberId);
  const options = member ? rubricsFor(member.role) : [];
  const rubric = L.rubricBySlug[rubricSlug] && (!member || options.some((o) => o.slug === rubricSlug)) ? L.rubricBySlug[rubricSlug] : options[0];
  const scored = rubric ? rubric.criteria.filter((c) => scores[c.key]).length : 0;
  const avg = gradeAverage(scores);
  const needsTrainee = rubric?.kind === "skill";
  const ready = !!member && !!rubric && scored === rubric.criteria.length && !!graderSig && (!needsTrainee || !!traineeSig);

  return (
    <Page
      eyebrow={
        <Link href="/training" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> Training · {v.store?.name}
        </Link>
      }
      title="Grade a turn"
    >
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <span className="label">Who you're grading</span>
          <select aria-label="Colleague" className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Choose a colleague</option>
            {rows
              .filter((r) => rubricsFor(r.role).length)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {ROLE_LABEL[r.role]}
                  {r.tenureDays < 30 ? ` · day ${r.tenureDays}` : ""}
                </option>
              ))}
          </select>
        </div>
        <div>
          <span className="label">Exercise</span>
          <select aria-label="Rubric" className="field" value={rubric?.slug ?? ""} onChange={(e) => (setRubricSlug(e.target.value), setScores({}), setNotes({}))} disabled={!member}>
            {options.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.title}
                {r.repeat ? ` · repeats ${r.repeat}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Table (optional)</span>
          <input aria-label="Table number" className="field" value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="22" />
        </div>
      </div>

      {!member ? (
        <div className="mt-8">
          <Empty>Pick a colleague to start. Grade one full table turn, every competency 1 to 5 stars.</Empty>
        </div>
      ) : rubric ? (
        <form
          className="mt-8"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await create
              .mutateAsync({ memberId, rubric: rubric.slug, scores, notes, summary, tableNo, graderSignature: graderSig, traineeSignature: needsTrainee ? traineeSig : traineeSig || null })
              .catch(() => null);
            if (r) nav(`/grading/${r.id}`);
          }}
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[2px] bg-paper-2 px-5 py-4">
            <div>
              <div className="font-display text-[22px] leading-tight">{member.name}</div>
              <div className="text-[12.5px] text-ink-soft">
                {rubric.summary} Module: {L.moduleBySlug[rubric.module]?.title}.{rubric.repeat && ` Repeats ${rubric.repeat}.`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <RampChip days={member.tenureDays} />
              <div className="text-right">
                <div className="eyebrow !text-ink-soft">Average</div>
                <div className={cn("figure text-[30px] leading-none", scored && avg >= GRADE_PASS ? "text-sage" : scored ? "text-oxblood" : "text-ink-soft")}>
                  {scored ? avg.toFixed(2) : "·"}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[var(--paper-line)] border-y rule">
            {rubric.criteria.map((c, i) => (
              <div key={c.key} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div className="text-[15px] font-semibold">
                    <span className="figure mr-2 text-gold-deep">{i + 1}</span>
                    {c.label}
                  </div>
                  <div className="mt-1 text-[13px] text-ink-soft">Look for: {c.look}</div>
                  <input
                    aria-label={`Note on ${c.label}`}
                    className="field mt-3 !h-10 text-[13.5px]"
                    value={notes[c.key] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [c.key]: e.target.value }))}
                    placeholder="What you saw (optional)"
                  />
                </div>
                <StarInput label={c.label} value={scores[c.key] ?? 0} onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))} />
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11.5px] text-ink-soft">
            {STAR_LABELS.slice(1).map((l, i) => `${i + 1} ${l}`).join(" · ")}. A module needs {GRADE_PASS}+ to be signed off.
          </div>

          <div className="mt-8">
            <span className="label">Summary for {member.name.split(" ")[0]}</span>
            <textarea
              aria-label="Summary"
              className="field !h-24 py-2"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One thing to keep doing, one thing to work on before the next grade."
            />
          </div>

          <div className={cn("mt-8 grid gap-6", "md:grid-cols-2")}>
            <div>
              <span className="label">Grader · {v.me.accessName}</span>
              <SignaturePad onChange={setGraderSig} caption="Graded by" />
            </div>
            <div>
              <span className="label">
                {member.name} {needsTrainee ? "(required for skills checks)" : "(optional)"}
              </span>
              <SignaturePad onChange={setTraineeSig} caption="Trainee" />
            </div>
          </div>
          {create.error && <div className="mt-3 text-[13px] text-oxblood">{errMsg(create.error)}</div>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="btn btn-ink" disabled={!ready || create.isPending}>
              <Check className="size-4" /> Approve grade
            </button>
            <span className="text-[12px] text-ink-soft">
              {scored}/{rubric.criteria.length} scored{!graderSig && " · grader signature needed"}
              {needsTrainee && !traineeSig && " · trainee signature needed"}
            </span>
          </div>
        </form>
      ) : (
        <div className="mt-8">
          <Empty>No exercises apply to this role.</Empty>
        </div>
      )}
    </Page>
  );
}

export function GradeView() {
  const { id } = useParams<{ id: string }>();
  const q = useGrade(id);
  const L = useLibrary();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const g = q.data!;
  const r = L.rubricBySlug[g.rubric];
  return (
    <Page
      eyebrow={
        <Link href={`/team/${g.memberId}#training`} className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> {g.memberName} · {ROLE_LABEL[g.memberRole]}
        </Link>
      }
      title={r?.title ?? g.rubric}
      aside={<SignedStamp label="Approved" name={g.graderName} when={shortDay(g.businessDate)} />}
    >
      <div className="mb-8 flex flex-wrap items-end gap-8">
        <div>
          <div className="eyebrow !text-ink-soft mb-1">Average</div>
          <div className={cn("figure text-[48px] leading-none", g.average >= GRADE_PASS ? "text-sage" : "text-oxblood")}>{g.average.toFixed(2)}</div>
        </div>
        <Stars value={g.average} size={22} />
        <div className="text-[13px] text-ink-soft">
          {shortDay(g.businessDate)}
          {g.tableNo && ` · table ${g.tableNo}`} · graded by {g.graderName}
        </div>
      </div>
      <div className="divide-y divide-[var(--paper-line)] border-y rule">
        {(r?.criteria ?? []).map((c) => (
          <div key={c.key} className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="text-[14.5px] font-semibold">{c.label}</div>
              {g.notes[c.key] ? <div className="mt-1 text-[13.5px] italic">“{g.notes[c.key]}”</div> : <div className="mt-1 text-[12.5px] text-ink-soft">{c.look}</div>}
            </div>
            <div className="md:text-right">
              <Stars value={g.scores[c.key] ?? 0} size={16} />
              <div className="text-[12px] font-semibold text-ink-soft">{STAR_LABELS[g.scores[c.key] ?? 0]}</div>
            </div>
          </div>
        ))}
      </div>
      {g.summary && (
        <blockquote className="mt-8 max-w-[70ch] border-l-2 border-gold-deep pl-4 font-display text-[19px] italic leading-snug">{g.summary}</blockquote>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <div className="label">Grader · {g.graderName}</div>
          <SignatureView value={g.graderSignature} />
        </div>
        {g.traineeSignature && (
          <div>
            <div className="label">Trainee · {g.memberName}</div>
            <SignatureView value={g.traineeSignature} />
          </div>
        )}
      </div>
    </Page>
  );
}
