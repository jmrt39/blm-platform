import { useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { ArrowLeft, BookOpen, Check, ClipboardCheck, GraduationCap, PenLine } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Empty, Seg, Stat } from "../components/bits";
import { SignaturePad, SignatureView, SignedStamp } from "../components/signature";
import { ModuleBody, ModuleChip, RampChip, ScoreChip, SectionTitle, Stars } from "../components/program-bits";
import { StoreTabs } from "./checklists";
import { useMarkModuleRead, useSignOffModule, useTrainingBoard, useTrainingMember, useTrainingModule } from "../queries/training";
import { useLibrary } from "../queries/library";
import { useGradingDue } from "../queries/grading";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, pct, shortDay } from "../lib/format";
import { cn } from "../lib/utils";

export function useCanTrain() {
  const v = useViewer();
  return v.isManager || !!v.me.member?.isTrainer;
}

export default function TrainingPage() {
  const v = useViewer();
  const canTrain = useCanTrain();
  const [tab, setTab] = useState<"board" | "mine">(canTrain ? "board" : "mine");
  const hasOwn = !!v.me.member && v.me.level === "staff";
  const L = useLibrary();
  return (
    <Page
      eyebrow={`${v.store?.name} · ${L.lib.version ? L.lib.label : "The 1906 program"}`}
      title="Training"
      aside={
        canTrain && (
          <Link href="/grading/new" className="btn btn-ink">
            <PenLine className="size-4" /> Grade a table turn
          </Link>
        )
      }
    >
      {canTrain && hasOwn && (
        <div className="mb-6">
          <Seg value={tab} onChange={setTab} options={[{ value: "board", label: "Store board" }, { value: "mine", label: "My training" }]} />
        </div>
      )}
      {canTrain && tab === "board" ? <Board /> : <MyTraining />}
    </Page>
  );
}

function Board() {
  const v = useViewer();
  const L = useLibrary();
  const q = useTrainingBoard(v.storeId);
  const due = useGradingDue(v.storeId);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data!;
  return (
    <>
      <StoreTabs />
      <div className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Program complete" value={pct(d.pct)} sub="Modules signed off across the floor" />
        <Stat label="Fully signed off" value={`${d.fullySigned}/${d.rows.length}`} sub="Everyone on their role's library" />
        <Stat label="Ready to sign" value={d.ready.length} tone={d.ready.length ? "gold" : undefined} sub="Requirements met, waiting on a trainer" />
        <Stat label="Recent grades" value={d.recentGrades.length} sub="Approved floor and skills grades" />
      </div>

      {d.ready.length > 0 && (
        <div className="mb-10">
          <SectionTitle>Ready to sign off</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {d.ready.map((r) => (
              <Link
                key={r.memberId + r.slug}
                href={`/training/${r.slug}?member=${r.memberId}`}
                className="flex items-center justify-between gap-3 rounded-[2px] border rule px-4 py-3 hover:border-ink"
              >
                <div>
                  <div className="text-[14px] font-semibold">{r.name}</div>
                  <div className="text-[12px] text-ink-soft">
                    {L.moduleBySlug[r.slug]?.n}. {L.moduleBySlug[r.slug]?.title} · {ROLE_LABEL[r.role]}
                  </div>
                </div>
                <span className="chip border-gold-deep/60 bg-gold/15 text-gold-deep">Sign off →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!!due.data?.length && (
        <div className="mb-10">
          <SectionTitle aside={<span className="text-[12px] text-ink-soft">Repeatable drills, graded again on their cadence</span>}>
            Due for a repeat
          </SectionTitle>
          <div className="grid gap-2 md:grid-cols-3">
            {due.data.slice(0, 9).map((r) => (
              <Link
                key={r.memberId + r.rubric}
                href={`/grading/new?member=${r.memberId}&rubric=${r.rubric}`}
                className="rounded-[2px] border rule px-4 py-3 hover:border-ink"
              >
                <div className="text-[14px] font-semibold">{r.name}</div>
                <div className="text-[12px] text-ink-soft">
                  {r.title} · {r.repeat === "weekly" ? "weekly" : "monthly"} · {r.lastOn ? `last ${shortDay(r.lastOn)}` : "never graded"}
                </div>
              </Link>
            ))}
          </div>
          {due.data.length > 9 && <div className="mt-2 text-[12px] text-ink-soft">and {due.data.length - 9} more</div>}
        </div>
      )}

      <SectionTitle aside={<span className="text-[12px] text-ink-soft">Done = read · knowledge check 80%+ · floor grade 3.5+ · both signatures</span>}>
        Where everyone stands
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead>
            <tr>
              <th>Colleague</th>
              <th>Role</th>
              <th className="w-[34%]">Library</th>
              <th className="r">Floor grade</th>
              <th className="r">Certs</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/team/${r.id}#training`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <RampChip days={r.tenureDays} />
                    {r.isTrainer && <span className="chip">Trainer</span>}
                  </div>
                </td>
                <td className="text-ink-soft">{ROLE_LABEL[r.role]}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <Bar value={r.program.done} max={r.program.total} tone={r.program.done === r.program.total ? "gold" : "ink"} />
                    <span className="figure shrink-0 text-[14px]">
                      {r.program.done}/{r.program.total}
                    </span>
                    {r.program.ready > 0 && <span className="chip shrink-0 border-gold-deep/60 text-gold-deep">{r.program.ready} ready</span>}
                  </div>
                </td>
                <td className="r">
                  {r.program.floorAvg != null ? (
                    <span className="inline-flex items-center gap-2">
                      <Stars value={r.program.floorAvg} size={12} />
                      <span className="figure">{r.program.floorAvg.toFixed(1)}</span>
                    </span>
                  ) : (
                    <span className="text-ink-soft">·</span>
                  )}
                </td>
                <td className="r">
                  {r.certAlerts ? (
                    <Link href={`/team/${r.id}#certs`} className="chip border-oxblood/40 text-oxblood">
                      {r.certAlerts} alert{r.certAlerts > 1 ? "s" : ""}
                    </Link>
                  ) : (
                    <span className="chip border-sage/50 text-sage">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <SectionTitle>Recent grades</SectionTitle>
        {d.recentGrades.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {d.recentGrades.map((g) => (
              <Link key={g.id} href={`/grading/${g.id}`} className="flex items-center justify-between gap-3 rounded-[2px] border rule px-4 py-3 hover:border-ink">
                <div>
                  <div className="text-[14px] font-semibold">{g.memberName}</div>
                  <div className="text-[12px] text-ink-soft">
                    {L.rubricBySlug[g.rubric]?.title} · {shortDay(g.businessDate)} · by {g.graderName}
                  </div>
                </div>
                <div className="text-right">
                  <Stars value={g.average} size={12} />
                  <div className="figure text-[15px]">{g.average.toFixed(2)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>No grades yet. Follow a table turn and grade it.</Empty>
        )}
      </div>
    </>
  );
}

/** A colleague's own module list. Also used on the profile. */
export function TrainingRecord({ memberId }: { memberId: string | null }) {
  const L = useLibrary();
  const q = useTrainingMember(memberId);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data!;
  const p = d.program;
  const byCat = new Map<string, typeof p.modules>();
  for (const m of p.modules) {
    const cat = L.moduleBySlug[m.slug]?.category ?? "House";
    byCat.set(cat, [...(byCat.get(cat) ?? []), m]);
  }
  const memberQ = memberId ? `?member=${memberId}` : "";
  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Signed off" value={`${p.done}/${p.total}`} sub={pct(p.pct) + " of the library for " + ROLE_LABEL[d.member.role]} />
        <Stat label="Ready to sign" value={p.ready} tone={p.ready ? "gold" : undefined} sub="Ask a trainer to sign" />
        <Stat label="Floor grade" value={p.floorAvg != null ? p.floorAvg.toFixed(1) : "·"} sub="Average of the last 3" />
        <Stat label="Checks passed" value={d.attempts.filter((a) => a.passed).length} sub={`${d.attempts.length} attempts`} />
      </div>
      {[...byCat.entries()].map(([cat, mods]) => (
        <div key={cat} className="mb-8">
          <div className="eyebrow mb-3">{cat}</div>
          <div className="grid gap-2 md:grid-cols-2">
            {mods.map((m) => {
              const mod = L.moduleBySlug[m.slug];
              if (!mod) return null;
              return (
                <Link key={m.slug} href={`/training/${m.slug}${memberQ}`} className="group rounded-[2px] border rule px-4 py-3.5 hover:border-ink">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold">
                        <span className="figure mr-2 text-gold-deep">{mod.n}</span>
                        {mod.title}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-soft">
                        {mod.minutes} min
                        {mod.quiz && " · knowledge check"}
                        {mod.rubric && " · floor exercise"}
                      </div>
                    </div>
                    <ModuleChip status={m.status} className="shrink-0" />
                  </div>
                  {m.status !== "signed_off" && m.needs.length > 0 && (
                    <div className="mt-2 text-[11.5px] text-ink-soft">Still needs: {m.needs.join(" · ")}</div>
                  )}
                  {m.status === "signed_off" && m.signedOffByName && m.signedOffAt && (
                    <div className="mt-2 text-[11.5px] text-sage">
                      Signed by {m.signedOffByName} · {new Date(m.signedOffAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MyTraining() {
  const v = useViewer();
  const L = useLibrary();
  if (!v.me.member)
    return (
      <Empty>
        Your own training record shows once you sign in with your PIN. Use View as to preview a server.
        <div className="mt-4 grid gap-2 text-left md:grid-cols-2">
          {L.lib.modules.map((m) => (
            <Link key={m.slug} href={`/training/${m.slug}`} className="rounded-[2px] border rule px-3 py-2 text-[13px] hover:border-ink">
              <span className="figure mr-2 text-gold-deep">{m.n}</span>
              {m.title}
            </Link>
          ))}
        </div>
      </Empty>
    );
  return <TrainingRecord memberId={null} />;
}

export function ModulePage() {
  const { slug } = useParams<{ slug: string }>();
  const search = new URLSearchParams(useSearch());
  const memberId = search.get("member");
  const L = useLibrary();
  const mod = L.moduleBySlug[slug];
  const q = useTrainingModule(slug, memberId);
  const read = useMarkModuleRead();
  const sign = useSignOffModule();
  const [trainerSig, setTrainerSig] = useState("");
  const [traineeSig, setTraineeSig] = useState("");
  const [note, setNote] = useState("");
  if (!mod) return <Page title="Module not found">{null}</Page>;
  const d = q.data;
  const state = d?.state;
  const rubric = mod.rubric ? L.rubricBySlug[mod.rubric] : null;
  const quiz = mod.quiz ? L.quizBySlug[mod.quiz] : null;
  return (
    <Page
      eyebrow={
        <Link href="/training" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> Module {mod.n} · {mod.category} · {mod.manual}
        </Link>
      }
      title={mod.title}
      aside={state && <ModuleChip status={state.status} />}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="mb-8 max-w-[64ch] font-display text-[20px] italic leading-snug text-ink-soft">{mod.summary}</p>
          <ModuleBody sections={mod.sections} />
          {d?.isSelf && !state?.read && (
            <button className="btn btn-ink mt-10" disabled={read.isPending} onClick={() => read.mutate({ slug })}>
              <BookOpen className="size-4" /> I've read this module
            </button>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {q.isLoading && <Loading />}
          <ErrorNote error={q.error} />
          {d?.member && state && (
            <div className="rounded-[2px] border rule p-5">
              <div className="eyebrow mb-1">{d.isSelf ? "Your progress" : d.member.name}</div>
              <div className="mb-4 text-[12px] text-ink-soft">{ROLE_LABEL[d.member.role]}</div>
              <Req done={state.read} label="Read the module" />
              {quiz && (
                <Req done={(state.quizBest ?? 0) >= 0.8} label={`Knowledge check · 80%`} right={<ScoreChip score={state.quizBest} />} />
              )}
              {rubric && (
                <Req
                  done={(state.gradeBest ?? 0) >= 3.5}
                  label={`${rubric.title} · 3.5 stars`}
                  right={state.gradeBest != null ? <span className="figure text-[14px]">{state.gradeBest.toFixed(2)}</span> : <span className="chip">Not graded</span>}
                />
              )}
              <Req done={state.status === "signed_off"} label="Signed by trainer and trainee" />
              <div className="mt-4 flex flex-wrap gap-2">
                {quiz && d.isSelf && (
                  <Link href={`/quizzes/${quiz.slug}`} className="btn btn-line">
                    <ClipboardCheck className="size-4" /> Take the check
                  </Link>
                )}
                {rubric && d.canTrain && (
                  <Link href={`/grading/new?member=${d.member.id}&rubric=${rubric.slug}`} className="btn btn-line">
                    <PenLine className="size-4" /> Grade
                  </Link>
                )}
              </div>
            </div>
          )}
          {d && (!d.member || !state) && (
            <div className="rounded-[2px] border rule p-5 text-[13px] text-ink-soft">
              You're reading as a manager. Open a colleague from the training board to see their progress and sign off.
            </div>
          )}

          {state?.status === "signed_off" && d?.progress && (
            <div className="rounded-[2px] border rule p-5">
              <SignedStamp name={d.progress.signedOffByName ?? ""} when={d.progress.signedOffAt ? shortDay(new Date(d.progress.signedOffAt).toISOString().slice(0, 10)) : ""} />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <div className="label">Trainer</div>
                  <SignatureView value={d.progress.trainerSignature} className="h-10" />
                </div>
                <div>
                  <div className="label">Trainee</div>
                  <SignatureView value={d.progress.traineeSignature} className="h-10" />
                </div>
              </div>
              {d.progress.note && <div className="mt-3 text-[12.5px] italic text-ink-soft">“{d.progress.note}”</div>}
            </div>
          )}

          {d?.canTrain && state?.status === "ready" && d.member && (
            <form
              className="rounded-[2px] border-2 border-gold-deep/50 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                sign.mutate({ memberId: d.member!.id, slug, trainerSignature: trainerSig, traineeSignature: traineeSig, note });
              }}
            >
              <div className="eyebrow mb-3">Sign off · {d.member.name}</div>
              <span className="label">Trainer or manager</span>
              <SignaturePad onChange={setTrainerSig} caption="Trainer" />
              <span className="label mt-3">{d.member.name}</span>
              <SignaturePad onChange={setTraineeSig} caption="Trainee" />
              <span className="label mt-3">Note (optional)</span>
              <input aria-label="Sign-off note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Strong on the wine pour" />
              {sign.error && <div className="mt-2 text-[12.5px] text-oxblood">{errMsg(sign.error)}</div>}
              <button className="btn btn-ink mt-4 w-full" disabled={!trainerSig || !traineeSig || sign.isPending}>
                <GraduationCap className="size-4" /> Sign off module
              </button>
            </form>
          )}

          {d?.grades && d.grades.length > 0 && (
            <div className="rounded-[2px] border rule p-5">
              <div className="eyebrow mb-3">Grades</div>
              {d.grades.map((g) => (
                <Link key={g.id} href={`/grading/${g.id}`} className="flex items-center justify-between border-b rule py-2 text-[13px] last:border-0 hover:underline">
                  <span>
                    {shortDay(g.businessDate)} · {g.graderName}
                  </span>
                  <span className="figure">{g.average.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}

function Req({ done, label, right }: { done: boolean; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b rule py-2.5 last:border-0">
      <div className="flex items-center gap-2.5 text-[13px]">
        <span className={cn("grid size-5 place-items-center rounded-full border", done ? "border-sage bg-sage text-paper" : "border-paper-line")}>
          {done && <Check className="size-3" />}
        </span>
        {label}
      </div>
      {right}
    </div>
  );
}
