import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { motion } from "motion/react";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Seg, Stat } from "../components/bits";
import { ScoreChip, SectionTitle } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useQuiz, useQuizResults, useQuizzes, useSubmitQuiz } from "../queries/quizzes";
import { errMsg, pct } from "../lib/format";
import { cn } from "../lib/utils";
import { sectionId } from "../../shared/program";

function readSaved(key: string): { answers: Record<string, number>; i: number } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { answers: Record<string, number>; i: number }) : null;
  } catch {
    return null;
  }
}

const quizHref = (slug: string) => `/quizzes/${encodeURIComponent(slug)}`;

export default function QuizzesPage() {
  const v = useViewer();
  const isStaff = v.me.level === "staff";
  const q = useQuizzes(v.storeId);
  const results = useQuizResults(v.storeId, v.isManager);
  const [level, setLevel] = useState<"all" | "Update" | "Core" | "Advanced">("all");
  const list = (q.data ?? []).filter((x) => level === "all" || x.level === level);
  const mine = q.data ?? [];
  return (
    <Page eyebrow={`${v.store?.name} · Knowledge checks`} title="Quizzes">
      {!isStaff && <StoreTabs />}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          {isStaff && v.me.member ? (
            <div className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
              <Stat label="Passed" value={`${mine.filter((x) => x.passed).length}/${mine.length}`} sub="80% is a pass" />
              <Stat label="To take" value={mine.filter((x) => x.best == null).length} tone={mine.some((x) => x.best == null) ? "gold" : undefined} sub="Not tried yet" />
              <Stat label="New this season" value={mine.filter((x) => x.level === "Update" && !x.passed).length} sub="Menu and wine updates" />
              <Stat label="Advanced" value={mine.filter((x) => x.level === "Advanced" && x.passed).length ? "Passed" : "Open"} sub="The sommelier challenge" />
            </div>
          ) : (
            <div className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
              <Stat label="Checks live" value={mine.length} sub="Library plus this season's updates" />
              <Stat
                label="Store pass rate"
                value={pct(
                  mine.reduce((a, x) => a + x.storePassed, 0) / Math.max(1, mine.reduce((a, x) => a + x.storeTakers, 0)),
                )}
                sub="People who passed ÷ people who tried"
              />
              <Stat label="Attempts" value={results.data?.recent.length ? `${results.data.recent.length}+` : "0"} sub="Recent, all checks" />
              <Stat label="Hardest question" value={results.data?.hardest[0] ? pct(results.data.hardest[0].rate) : "·"} tone="bad" sub="Right first time" />
            </div>
          )}

          <div className="mb-5">
            <Seg
              value={level}
              onChange={setLevel}
              options={[
                { value: "all", label: "All" },
                { value: "Update", label: "This season" },
                { value: "Core", label: "Core" },
                { value: "Advanced", label: "Advanced" },
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((x) => (
              <Link key={x.slug} href={quizHref(x.slug)} className="group rounded-[2px] border rule p-5 hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow mb-1.5">{x.level === "Update" ? "Seasonal update" : x.level}</div>
                    <div className="font-display text-[21px] leading-tight">{x.title}</div>
                    <div className="mt-1.5 text-[12px] text-ink-soft">
                      {x.count} questions{x.moduleTitle && ` · ${x.moduleTitle}`}
                    </div>
                  </div>
                  {v.me.member && isStaff ? <ScoreChip score={x.best} /> : <span className="chip">{x.storeTakers ? `${x.storePassed}/${x.storeTakers} passed` : "No attempts"}</span>}
                </div>
                {!isStaff && x.storeAvg != null && (
                  <div className="mt-3 text-[12px] text-ink-soft">Average score {pct(x.storeAvg)}</div>
                )}
              </Link>
            ))}
          </div>

          {v.isManager && results.data && (
            <div className="mt-12 grid gap-10 lg:grid-cols-2">
              <div>
                <SectionTitle>What the team gets wrong</SectionTitle>
                {results.data.hardest.length ? (
                  <ol className="space-y-3">
                    {results.data.hardest.map((h) => (
                      <li key={h.id} className="rounded-[2px] border rule px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-[13.5px] font-semibold leading-snug">{h.q}</div>
                          <span className={cn("figure shrink-0 text-[17px]", h.rate < 0.5 ? "text-oxblood" : "text-ink")}>{pct(h.rate)}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-ink-soft">
                          Answer: {h.answer} · {h.quizTitle} · {h.n} answers
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>Not enough answers yet.</Empty>
                )}
                <div className="mt-3 text-[12px] text-ink-soft">Teach these at line up. Right first time, all attempts at this store.</div>
              </div>
              <div>
                <SectionTitle>Recent attempts</SectionTitle>
                <table className="tbl">
                  <tbody>
                    {results.data.recent.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/team/${a.memberId}#training`} className="font-semibold hover:underline">
                            {a.memberName}
                          </Link>
                          <div className="text-[11.5px] text-ink-soft">{a.title}</div>
                        </td>
                        <td className="r text-[12px] text-ink-soft">{new Date(a.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                        <td className="r">
                          <ScoreChip score={a.score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

type Result = Awaited<ReturnType<ReturnType<typeof useSubmitQuiz>["mutateAsync"]>>;

export function QuizTake() {
  const { slug: raw } = useParams<{ slug: string }>();
  const slug = decodeURIComponent(raw);
  const v = useViewer();
  const q = useQuiz(slug);
  const submit = useSubmitQuiz();
  const key = `blm.quiz.${v.me.member?.id ?? "preview"}.${slug}`;
  const saved = useMemo(() => readSaved(key), [key]);
  const [answers, setAnswersRaw] = useState<Record<string, number>>(saved?.answers ?? {});
  const [i, setIRaw] = useState(saved?.i ?? 0);
  const [result, setResult] = useState<Result | null>(null);
  const persist = (a: Record<string, number>, n: number) => {
    try {
      localStorage.setItem(key, JSON.stringify({ answers: a, i: n }));
    } catch {
      /* private mode: resume just won't survive a reload */
    }
  };
  const setAnswers = (f: (a: Record<string, number>) => Record<string, number>) =>
    setAnswersRaw((a) => {
      const next = f(a);
      persist(next, i);
      return next;
    });
  const setI = (n: number | ((x: number) => number)) =>
    setIRaw((x) => {
      const next = typeof n === "function" ? n(x) : n;
      persist(answers, next);
      return next;
    });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data!;
  const total = d.questions.length;
  const answered = d.questions.filter((x) => answers[x.id] != null).length;
  const canTake = !!v.me.member;
  const restart = () => (localStorage.removeItem(key), setAnswersRaw({}), setIRaw(0), setResult(null), submit.reset());

  return (
    <Page
      className="mx-auto max-w-[760px]"
      eyebrow={
        <Link href="/quizzes" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> {d.level === "Update" ? "Seasonal update" : d.level} · {total} questions
          {d.moduleTitle && ` · ${d.moduleTitle}`}
        </Link>
      }
      title={d.title}
    >
      {result ? (
        <div>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[2px] bg-paper-2 px-5 py-5">
            <div>
              <div className={cn("figure text-[52px] leading-none", result.passed ? "text-sage" : "text-oxblood")}>{Math.round(result.score * 100)}%</div>
              <div className="mt-1 text-[13px] text-ink-soft">
                {result.correct} of {result.total} right · {result.passed ? "Passed. It's on your training record." : `${Math.round(d.passMark * 100)}% passes. Read the why on each miss and try again.`}
              </div>
              {result.onboardingTicked > 0 && <div className="mt-1 text-[13px] font-semibold text-sage">Your onboarding step is ticked off.</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={restart} className="btn btn-line">
                <RotateCcw className="size-4" /> Retake
              </button>
              <Link href="/quizzes" className="btn btn-ink">
                All checks
              </Link>
            </div>
          </div>
          <ol className="space-y-4">
            {result.review.map((r, n) => {
              const ok = r.chose === r.answer;
              return (
                <li key={r.id} className={cn("rounded-[2px] border p-4", ok ? "rule" : "border-oxblood/40")}>
                  <div className="flex gap-3">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-sage text-paper" : "bg-oxblood text-paper")}>
                      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold leading-snug">
                        {n + 1}. {r.q}
                      </div>
                      {!ok && <div className="mt-1.5 text-[13px] text-oxblood line-through decoration-1">{r.choices[r.chose]}</div>}
                      <div className="mt-1 text-[13px] font-semibold text-sage">{r.choices[r.answer]}</div>
                      {r.why && <div className="mt-1.5 text-[12.5px] italic text-ink-soft">{r.why}</div>}
                      {r.see && d.module && (
                        <Link href={`/training/${d.module}#${sectionId(r.see)}`} className="mt-1.5 inline-block text-[12px] font-semibold text-gold-deep hover:underline">
                          In the module: {r.see}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div>
          {!canTake && (
            <div className="mb-6 rounded-[2px] border border-gold-deep/50 bg-gold/10 px-4 py-3 text-[13px]">
              You're previewing. Staff take checks on their phone after PIN sign in; use View as to try it as a server.
            </div>
          )}
          {saved && Object.keys(saved.answers).length > 0 && answered > 0 && (
            <div className="mb-4 text-[12.5px] text-ink-soft">
              Picked up where you left off: {answered} of {total} answered.{" "}
              <button type="button" className="font-semibold underline" onClick={restart}>
                Start over
              </button>
            </div>
          )}
          {d.module && d.moduleTitle && answered === 0 && (
            <div className="mb-5 text-[13px] text-ink-soft">
              Every question comes from{" "}
              <Link href={`/training/${d.module}`} className="font-semibold text-gold-deep underline">
                {d.moduleTitle}
              </Link>
              . Read it first if you have not.
            </div>
          )}
          <div className="mb-6 flex gap-1">
            {d.questions.map((qq, n) => (
              <button
                key={qq.id}
                type="button"
                aria-label={`Question ${n + 1}`}
                onClick={() => setI(n)}
                className={cn("h-1.5 flex-1 rounded-full", n === i ? "bg-ink" : answers[qq.id] != null ? "bg-gold-deep" : "bg-paper-2")}
              />
            ))}
          </div>
          {d.questions[i] && (
            <motion.div key={d.questions[i].id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
              <div className="eyebrow mb-2">
                Question {i + 1} of {total}
              </div>
              <div className="mb-6 font-display text-[24px] leading-snug md:text-[28px]">{d.questions[i].q}</div>
              <div className="grid gap-2.5">
                {d.questions[i].choices.map((c, k) => {
                  const on = answers[d.questions[i]!.id] === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setAnswers((a) => ({ ...a, [d.questions[i]!.id]: k }));
                        if (i < total - 1) setTimeout(() => setI((x) => Math.min(total - 1, x + 1)), 220);
                      }}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 rounded-[2px] border px-4 py-3 text-left text-[15px] transition-colors",
                        on ? "border-ink bg-ink text-paper" : "rule hover:border-ink",
                      )}
                    >
                      <span className={cn("figure grid size-7 shrink-0 place-items-center rounded-full border text-[13px]", on ? "border-paper" : "rule")}>
                        {String.fromCharCode(65 + k)}
                      </span>
                      {c}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button type="button" className="btn btn-line" disabled={i === 0} onClick={() => setI(i - 1)}>
                Back
              </button>
              <button type="button" className="btn btn-line" disabled={i >= total - 1} onClick={() => setI(i + 1)}>
                Next
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-ink-soft">
                {answered}/{total} answered
              </span>
              <button
                type="button"
                className="btn btn-ink"
                disabled={!canTake || answered < total || submit.isPending}
                onClick={async () => {
                  const r = await submit.mutateAsync({ slug, answers }).catch(() => null);
                  if (r) {
                    localStorage.removeItem(key);
                    setResult(r);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                Submit
              </button>
            </div>
          </div>
          {submit.error && <div className="mt-3 text-[13px] text-oxblood">{errMsg(submit.error)}</div>}
        </div>
      )}
    </Page>
  );
}
