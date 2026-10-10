import { Link } from "wouter";
import { BookOpen, GraduationCap, Megaphone, ShieldCheck } from "lucide-react";
import { useViewer } from "./viewer";
import { Bar } from "./bits";
import { useTrainingBoard, useTrainingMember } from "../queries/training";
import { useCerts } from "../queries/certs";
import { useQuizzes } from "../queries/quizzes";
import { useUpdates } from "../queries/updates";
import { pct } from "../lib/format";

function StoreTraining({ storeId, showName }: { storeId: string; showName: boolean }) {
  const q = useTrainingBoard(storeId);
  const d = q.data;
  if (!d) return <div className="h-12 animate-pulse bg-paper-2/60" />;
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold">{showName ? d.store.name : "Training complete"}</span>
        <span className="figure text-[15px]">{pct(d.pct)}</span>
      </div>
      <Bar value={d.pct} max={1} tone="gold" />
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-ink-soft">
        <span>{d.fullySigned} of {d.rows.length} fully signed off</span>
        {d.ready.length > 0 && (
          <Link href={`/training?store=${storeId}`} className="font-semibold text-gold-deep hover:underline">
            {d.ready.length} ready to sign off →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Manager home: where the training program stands. */
export function ProgramBlock({ storeId }: { storeId: string | null }) {
  const v = useViewer();
  const stores = storeId ? [storeId] : v.me.storeIds;
  const certs = useCerts(storeId);
  const quizzes = useQuizzes(storeId);
  const alerts = certs.data?.alerts ?? [];
  const taken = (quizzes.data ?? []).filter((x) => x.storeTakers > 0);
  const takers = taken.reduce((a, x) => a + x.storeTakers, 0);
  const passed = taken.reduce((a, x) => a + x.storePassed, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="eyebrow">Training program</div>
        <Link href="/training" className="text-[12px] font-semibold text-gold-deep hover:underline">
          Open board →
        </Link>
      </div>
      <div className="divide-y divide-paper-line border-y rule">
        {stores.map((id) => (
          <StoreTraining key={id} storeId={id} showName={stores.length > 1} />
        ))}
        <Link href="/quizzes" className="flex items-baseline justify-between py-3 text-[13px] hover:bg-paper-2/60">
          <span className="font-semibold">Knowledge checks passed</span>
          <span className="text-ink-soft">{takers ? `${passed} of ${takers} people · ${pct(passed / takers)}` : "None taken yet"}</span>
        </Link>
        <Link href="/certs" className="flex items-baseline justify-between py-3 text-[13px] hover:bg-paper-2/60">
          <span className="font-semibold">Certifications</span>
          <span className={alerts.length ? "font-semibold text-oxblood" : "text-sage"}>
            {alerts.length ? `${alerts.length} need attention` : "All current"}
          </span>
        </Link>
      </div>
    </div>
  );
}

/** Staff home: my training, quizzes and updates. */
export function StaffProgram() {
  const v = useViewer();
  const me = useTrainingMember(null, !!v.me.member);
  const quizzes = useQuizzes(null);
  const updates = useUpdates(null);
  const p = me.data?.program;
  const nextModule = p?.modules.find((m) => m.status !== "signed_off");
  const openQuizzes = (quizzes.data ?? []).filter((q) => !q.passed);
  const unread = (updates.data ?? []).filter((u) => u.read === false);
  const certAlerts = (me.data?.certs ?? []).filter((c) => c.required && c.status !== "ok");
  const tiles = [
    {
      href: nextModule ? `/training/${nextModule.slug}` : "/training",
      icon: BookOpen,
      title: "Training",
      big: p ? `${p.done}/${p.total}` : "…",
      sub: p ? (nextModule ? `Next: ${nextModule.needs[0] ?? "ask for sign off"}` : "Every module signed off") : "",
      bar: p?.pct ?? 0,
    },
    {
      href: openQuizzes[0] ? `/quizzes/${encodeURIComponent(openQuizzes[0].slug)}` : "/quizzes",
      icon: GraduationCap,
      title: "Knowledge checks",
      big: quizzes.data ? String(openQuizzes.length) : "…",
      sub: openQuizzes[0] ? `To pass · start with ${openQuizzes[0].title}` : "All passed",
      bar: quizzes.data?.length ? 1 - openQuizzes.length / quizzes.data.length : 0,
    },
    {
      href: unread[0] ? `/updates/${unread[0].id}` : "/updates",
      icon: Megaphone,
      title: "Updates",
      big: updates.data ? String(unread.length) : "…",
      sub: unread[0] ? `Unread · ${unread[0].title}` : "You're caught up",
      bar: updates.data?.length ? 1 - unread.length / updates.data.length : 0,
    },
  ];
  return (
    <div className="mt-10">
      <div className="eyebrow mb-3">My program</div>
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="group rounded-[2px] border rule p-5 hover:border-ink">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">
              <t.icon className="size-4 text-gold-deep" /> {t.title}
            </div>
            <div className="figure mt-3 text-[34px] leading-none">{t.big}</div>
            <div className="mt-2 min-h-[2.4em] text-[12.5px] text-ink-soft">{t.sub}</div>
            <Bar value={t.bar} max={1} className="mt-3" tone="gold" />
          </Link>
        ))}
      </div>
      {certAlerts.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-[2px] border border-oxblood/40 bg-oxblood/5 px-4 py-3 text-[13px] text-oxblood">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            {certAlerts.map((c) => `${c.label}: ${c.status === "missing" ? "not on file" : c.status === "expired" ? "expired" : `expires in ${c.daysLeft} days`}`).join(" · ")}. Bring your
            card to a manager.
          </span>
        </div>
      )}
    </div>
  );
}
