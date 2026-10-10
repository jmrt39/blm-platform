import { DEFAULT_TICKET_TARGET } from "../../shared/metrics";
import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion } from "motion/react";
import { Check, GraduationCap, UserPlus } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Bar, Empty, Seg, Spark, Stat } from "../components/bits";
import { ConductSection, RatingFigure, StrikeDots } from "../components/conduct-bits";
import { useConductOverview } from "../queries/conduct";
import { ratingLabel } from "../../shared/conduct";
import { useAddColleague, useDepart, useMember, useSetOnboarding, useTeam, useUpdateMember } from "../queries/team";
import { MANAGEMENT_ROLES, ROLE_LABEL, STAFF_ROLES, isManagementRole, onboardingPlan, type StoreRole } from "../../shared/domain";
import { errMsg, money, money2, shortDay } from "../lib/format";
import { TrainingRecord } from "./training";
import { RecordForm } from "./certs";
import { CertChip, RampChip, SectionTitle } from "../components/program-bits";
import { useMemberCerts } from "../queries/certs";
import { useHourGoal, useSetHourGoal } from "../queries/slow";
import type { CertKind } from "../../shared/program";
import { cn } from "../lib/utils";

function tenure(days: number) {
  if (days < 0) return "Starts soon";
  if (days < 60) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  const y = days / 365;
  return `${y < 2 ? y.toFixed(1) : Math.floor(y)} years`;
}

export function TeamPage() {
  const v = useViewer();
  const scope = v.isLeader ? v.scope : v.storeId;
  const q = useTeam(scope);
  const conduct = useConductOverview(scope, v.isManager);
  const standing = new Map((v.isManager ? (conduct.data?.people ?? []) : []).map((p) => [p.id, p]));
  const [filter, setFilter] = useState<"all" | "mgmt" | "staff" | "new">("all");
  const target = v.store?.ticketTarget ?? DEFAULT_TICKET_TARGET;
  const rows = (q.data ?? []).filter((m) =>
    filter === "all" ? true : filter === "mgmt" ? isManagementRole(m.role) : filter === "staff" ? !isManagementRole(m.role) : m.tenureDays <= 90,
  );
  const storeName = (id: string) => v.me.stores.find((s) => s.id === id)?.name ?? "";
  return (
    <Page
      eyebrow={v.isLeader && !v.scope ? "All stores" : `${v.store?.name} · Store ${v.store?.number}`}
      title="The team"
      aside={
        v.isManager && (
          <>
            <Link href="/team/import" className="btn btn-line">
              Import roster
            </Link>
            <Link href="/team/new" className="btn btn-ink">
              <UserPlus className="size-4" /> Add a colleague
            </Link>
          </>
        )
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Everyone · ${q.data?.length ?? 0}` },
            { value: "mgmt", label: "Management" },
            { value: "staff", label: "Staff" },
            { value: "new", label: "First 90 days" },
          ]}
        />
        <div className="text-[12px] text-ink-soft">Spend per ticket = last 30 nights, sales ÷ tickets</div>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !rows.length ? (
        <Empty>
          {q.data?.length === 0 && v.isManager ? (
            <>
              No one here yet.{" "}
              <Link href="/team/import" className="font-semibold text-gold-deep hover:underline">
                Import your roster
              </Link>{" "}
              from a CSV, or add people one at a time.
            </>
          ) : (
            "No one here yet."
          )}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                {v.isLeader && !v.scope && <th>Store</th>}
                <th>With us</th>
                <th className="r">Spend per ticket</th>
                {v.isManager && <th className="r">Rating</th>}
                {v.isManager && <th>Strikes</th>}
                <th>30 / 60 / 90</th>
                {v.isManager && <th className="r">PIN</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-paper-2/50">
                  <td>
                    <Link href={`/team/${m.id}`} aria-label={m.name} className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-noir font-display text-[13px] text-gold">{m.initials}</span>
                      <span className="font-semibold hover:underline">{m.name}</span>
                    </Link>
                  </td>
                  <td>
                    <span className={cn(isManagementRole(m.role) && "font-semibold")}>{ROLE_LABEL[m.role]}</span>
                    {m.isTrainer && (
                      <span className="chip ml-2 !border-gold-deep/50 !text-gold-deep">
                        <GraduationCap className="size-3" /> Trainer
                      </span>
                    )}
                  </td>
                  {v.isLeader && !v.scope && <td className="text-ink-soft">{storeName(m.storeId)}</td>}
                  <td className="text-ink-soft">{tenure(m.tenureDays)}</td>
                  <td className={cn("r font-semibold", m.spt30 != null && (m.spt30 >= target ? "text-sage" : "text-oxblood"))}>{m.spt30 != null ? money2(m.spt30) : "—"}</td>
                  {v.isManager && (
                    <td className="r" title={ratingLabel(standing.get(m.id)?.rating?.overall)}>
                      <RatingFigure value={standing.get(m.id)?.rating?.overall} className="text-[18px]" />
                    </td>
                  )}
                  {v.isManager && <td>{standing.get(m.id)?.strikes ? <StrikeDots n={standing.get(m.id)!.strikes} /> : <span className="text-[12px] text-ink-soft">—</span>}</td>}
                  <td className="w-44">
                    {m.onboarding && m.onboarding.done < m.onboarding.total ? (
                      <div>
                        <Bar value={m.onboarding.done} max={m.onboarding.total} tone={m.onboarding.overdue ? "bad" : "gold"} />
                        <div className="mt-1 text-[11px] text-ink-soft">
                          {m.onboarding.done}/{m.onboarding.total}
                          {m.onboarding.overdue ? <span className="text-oxblood"> · {m.onboarding.overdue} overdue</span> : ` · ${m.onboarding.phase}-day`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-ink-soft">{m.onboarding ? "Complete" : "—"}</span>
                    )}
                  </td>
                  {v.isManager && <td className="r figure tracking-[0.15em] text-ink-soft">{m.pin}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

export function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const v = useViewer();
  const q = useMember(id!);
  const setOb = useSetOnboarding();
  const update = useUpdateMember();
  const depart = useDepart();
  const [, nav] = useLocation();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { member: m, store, onboarding, sales, tenureDays, today, canManage, checklistLinesInitialled } = q.data;
  const totalSales = sales.reduce((a, s) => a + s.netSales, 0);
  const covers = sales.reduce((a, s) => a + s.covers, 0);
  const tickets = sales.reduce((a, s) => a + s.checks, 0);
  const spt = tickets ? totalSales / tickets : 0;
  const phases = [30, 60, 90] as const;
  const seller = ["server", "sommelier", "bartender"].includes(m.role);

  return (
    <Page
      eyebrow={
        <>
          <Link href="/team" className="hover:underline">
            Team
          </Link>{" "}
          · {store.name}
        </>
      }
      title={m.name}
      aside={
        <div className="flex items-center gap-2">
          <span className="chip !text-[12px]">{ROLE_LABEL[m.role]}</span>
          <RampChip days={tenureDays} />
          {m.isTrainer && (
            <span className="chip !border-gold-deep/50 !text-[12px] !text-gold-deep">
              <GraduationCap className="size-3.5" /> Trainer
            </span>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-6 border-b rule pb-8 md:grid-cols-4">
        <Stat label="With us" value={tenure(tenureDays)} sub={`Hired ${shortDay(m.hireDate)}`} />
        {seller && sales.length > 0 ? (
          <>
            <Stat label="Spend per ticket · 6 wks" value={money2(spt)} tone={spt >= store.ticketTarget ? "good" : "bad"} sub={`Store target ${money(store.ticketTarget)}`} />
            <Stat label="Sales · 6 wks" value={money(totalSales)} sub={`${sales.length} shifts · ${tickets} tickets · ${covers} covers`} />
          </>
        ) : (
          <>
            <Stat label="Shifts · 6 wks" value={sales.length || "—"} />
            <Stat label="Store" value={<span className="text-[24px]">{store.number}</span>} sub={store.name} />
          </>
        )}
        <Stat label="Checklist lines initialled" value={checklistLinesInitialled} />
      </div>

      {seller && sales.length > 1 && (
        <div className="border-b rule py-8">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="eyebrow">Spend per ticket by shift</div>
            <div className="text-[11.5px] text-ink-soft">dashed = store target</div>
          </div>
          <Spark data={sales.map((s) => (s.checks ? s.netSales / s.checks : 0))} target={store.ticketTarget} height={90} />
        </div>
      )}

      <div className="grid gap-10 pt-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <div className="eyebrow">30 / 60 / 90 onboarding</div>
            {onboarding.length > 0 && (
              <div className="text-[12px] text-ink-soft">
                {onboarding.filter((o) => o.completedAt).length} of {onboarding.length} complete
              </div>
            )}
          </div>
          {!onboarding.length ? (
            <Empty>No onboarding plan. {m.name.split(" ")[0]} was here before The Platform.</Empty>
          ) : (
            <div className="space-y-7">
              {phases.map((p) => {
                const items = onboarding.filter((o) => o.phase === p);
                if (!items.length) return null;
                return (
                  <div key={p}>
                    <div className="mb-2 flex items-baseline gap-3">
                      <div className="figure text-[28px] leading-none text-gold-deep">{p}</div>
                      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">days · due {shortDay(items[0]!.dueDate)}</div>
                    </div>
                    <ul className="divide-y divide-paper-line border-y rule">
                      {items.map((o) => {
                        const overdue = !o.completedAt && o.dueDate < today;
                        return (
                          <li key={o.id} className="flex items-start gap-3 py-3">
                            <button
                              disabled={!canManage || setOb.isPending}
                              onClick={() => setOb.mutate({ itemId: o.id, done: !o.completedAt })}
                              className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-[2px] border", o.completedAt ? "border-ink bg-ink text-paper" : "border-ink-soft/50", canManage && "hover:border-ink")}
                            >
                              {o.completedAt && <Check className="size-3.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className={cn("text-[14px] font-semibold", o.completedAt && "text-ink-soft line-through decoration-ink-soft/40")}>{o.title}</div>
                              <div className="text-[12.5px] text-ink-soft">{o.detail}</div>
                            </div>
                            <div className="shrink-0 text-right text-[11.5px]">
                              {o.completedAt ? (
                                <span className="text-sage">✓ {o.completedBy}</span>
                              ) : overdue ? (
                                <span className="font-semibold text-oxblood">Overdue</span>
                              ) : (
                                <span className="text-ink-soft">Due {shortDay(o.dueDate)}</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2px] bg-paper-2 p-5">
            <div className="eyebrow mb-3">Details</div>
            <dl className="space-y-2 text-[13.5px]">
              <Row k="Store">
                {store.name} · {store.number}
              </Row>
              <Row k="Email">{m.email ?? "—"}</Row>
              <Row k="Phone">{m.phone ?? "—"}</Row>
              {m.pin && (
                <Row k="Personal PIN">
                  <span className="figure text-[17px] tracking-[0.25em]">{m.pin}</span>
                </Row>
              )}
            </dl>
          </div>
          {canManage && v.me.member?.id !== m.id && (
            <div className="space-y-2">
              <div className="eyebrow mb-2">Manage</div>
              <label className="flex items-center justify-between rounded-[2px] border rule px-4 py-3 text-[13.5px]">
                <span className="flex items-center gap-2">
                  <GraduationCap className="size-4 text-gold-deep" /> Trainer
                </span>
                <input type="checkbox" aria-label="Trainer" className="size-4 accent-[#1c1915]" checked={m.isTrainer} onChange={(e) => update.mutate({ id: m.id, isTrainer: e.target.checked })} />
              </label>
              <button onClick={() => update.mutate({ id: m.id, resetPin: true })} className="btn btn-line w-full">
                Issue a new PIN
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Mark ${m.name} as departed? They'll lose access to the store.`)) return;
                  await depart.mutateAsync({ id: m.id });
                  nav("/team");
                }}
                className="btn btn-line w-full !text-oxblood"
              >
                Mark as departed
              </button>
              <ErrorNote error={update.error ?? depart.error} />
            </div>
          )}
        </div>
      </div>
      {(v.isManager || v.me.member?.id === m.id) && (
        <>
          {!isManagementRole(m.role) && (
            <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
              <MemberCerts memberId={m.id} name={m.name} canRecord={v.isManager} />
              <HoursGoal memberId={m.id} name={m.name} self={v.me.member?.id === m.id} />
            </div>
          )}
          <section id="training" className="mt-10 scroll-mt-24">
            <SectionTitle aside={<Link href={`/training?member=${m.id}`} className="text-[12px] text-ink-soft hover:underline">Open training</Link>}>
              Training record
            </SectionTitle>
            <TrainingRecord memberId={m.id} />
          </section>
          <div className="mt-10">
            <ConductSection memberId={m.id} />
          </div>
        </>
      )}
    </Page>
  );
}

function MemberCerts({ memberId, name, canRecord }: { memberId: string; name: string; canRecord: boolean }) {
  const q = useMemberCerts(memberId);
  const [recording, setRecording] = useState<CertKind | null>(null);
  return (
    <section id="certs" className="scroll-mt-24">
      <SectionTitle>Certifications</SectionTitle>
      {recording && <RecordForm init={{ memberId, kind: recording }} onDone={() => setRecording(null)} name={name} />}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data!.length ? (
        <Empty>No certificates required for this role.</Empty>
      ) : (
        <div className="divide-y divide-paper-line border-y rule">
          {q.data!.map((c) => (
            <div key={c.kind} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="text-[14px] font-semibold">
                  {c.label}
                  {!c.required && <span className="ml-2 text-[11px] font-normal text-ink-soft">optional</span>}
                </div>
                <div className="text-[12px] text-ink-soft">
                  {c.status === "missing"
                    ? "Nothing on file"
                    : [c.issuer, c.number && `#${c.number}`, c.issuedOn && `issued ${shortDay(c.issuedOn)}`, c.expiresOn && `expires ${shortDay(c.expiresOn)}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CertChip status={c.status} daysLeft={c.daysLeft} />
                {canRecord && (
                  <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setRecording(c.kind)}>
                    {c.status === "missing" ? "Record" : "Renew"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HoursGoal({ memberId, name, self }: { memberId: string; name: string; self: boolean }) {
  const q = useHourGoal(memberId);
  const save = useSetHourGoal();
  const [draft, setDraft] = useState<{ weeklyHours: number; volunteerEarly: boolean; crossStore: boolean } | null>(null);
  const g = draft ?? q.data ?? { weeklyHours: 32, volunteerEarly: false, crossStore: false };
  const first = name.split(" ")[0];
  return (
    <section id="hours" className="scroll-mt-24">
      <SectionTitle>Hours goal</SectionTitle>
      <form
        className="rounded-[2px] bg-paper-2 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await save.mutateAsync({ memberId, ...g }).catch(() => null);
          if (r) setDraft(null);
        }}
      >
        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-soft">
          {self ? "How many hours you want a week." : `How many hours ${first} wants a week.`} On a slow night, people furthest above their goal are asked first, and people short of it are protected.
        </p>
        <label className="block">
          <span className="label">Hours a week</span>
          <input
            aria-label="Hours a week"
            type="number"
            min={0}
            max={60}
            className="field !w-28"
            value={g.weeklyHours}
            onChange={(e) => setDraft({ ...g, weeklyHours: Math.max(0, Math.min(60, Number(e.target.value))) })}
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-[13px]">
          <input type="checkbox" aria-label="Happy to go home early" className="accent-[#1c1915]" checked={g.volunteerEarly} onChange={(e) => setDraft({ ...g, volunteerEarly: e.target.checked })} />
          Happy to go home early on a slow night
        </label>
        <label className="mt-2 flex items-center gap-2 text-[13px]">
          <input type="checkbox" aria-label="Will pick up shifts at sister stores" className="accent-[#1c1915]" checked={g.crossStore} onChange={(e) => setDraft({ ...g, crossStore: e.target.checked })} />
          Will pick up shifts at sister stores
        </label>
        {save.error && <div className="mt-2 text-[12px] text-oxblood">{errMsg(save.error)}</div>}
        <button className="btn btn-ink mt-4 !h-9" disabled={!draft || save.isPending}>
          {save.isSuccess && !draft ? "Saved" : "Save"}
        </button>
      </form>
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function AddColleague() {
  const v = useViewer();
  const add = useAddColleague();
  const todayIso = v.me.today ?? new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    storeId: v.storeId,
    name: "",
    role: "server" as StoreRole,
    isTrainer: false,
    email: "",
    phone: "",
    hireDate: todayIso,
    pin: "",
  });
  const [done, setDone] = useState<{ id: string; pin: string; onboardingItems: number } | null>(null);
  const canAddMgmt = v.isLeader || v.me.member?.role === "gm";
  const plan = onboardingPlan(f.role);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  if (done)
    return (
      <Page eyebrow="Team" title={<>Welcome aboard, {f.name.split(" ")[0]}.</>}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl">
          <p className="text-[15px] leading-relaxed">
            {f.name} is on the roster at <b>{v.me.stores.find((s) => s.id === f.storeId)?.name}</b> as {ROLE_LABEL[f.role]}. Their 30/60/90 plan has started with {done.onboardingItems} steps.
          </p>
          <div className="my-7 rounded-[2px] bg-noir p-6 text-ivory">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">Sign-in for the floor</div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-[#b9b0a3]">Store number</div>
                <div className="figure text-[30px] tracking-[0.12em] text-ivory">{v.me.stores.find((s) => s.id === f.storeId)?.number}</div>
              </div>
              <div>
                <div className="text-[12px] text-[#b9b0a3]">Personal PIN</div>
                <div className="figure text-[30px] tracking-[0.3em] text-gold">{done.pin}</div>
              </div>
            </div>
            <div className="mt-3 text-[12px] text-[#8b8277]">The PIN only works at this store.</div>
          </div>
          <div className="flex gap-2">
            <Link href={`/team/${done.id}`} className="btn btn-ink">
              Open their 30/60/90
            </Link>
            <button
              onClick={() => {
                setDone(null);
                setF({ ...f, name: "", email: "", phone: "", pin: "" });
              }}
              className="btn btn-line"
            >
              Add another
            </button>
          </div>
        </motion.div>
      </Page>
    );

  return (
    <Page
      eyebrow={
        <>
          <Link href="/team" className="hover:underline">
            Team
          </Link>{" "}
          · New colleague
        </>
      }
      title="Add a colleague"
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await add.mutateAsync({ ...f, email: f.email || null, phone: f.phone || null, pin: f.pin || null }).catch(() => null);
            if (r) setDone(r);
          }}
          className="grid content-start gap-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <span className="label">Full name</span>
            <input aria-label="Full name" className="field" required minLength={2} value={f.name} onChange={set("name")} placeholder="Camille Rhodes" />
          </div>
          {v.isLeader && v.me.stores.length > 1 && (
            <div className="md:col-span-2">
              <span className="label">Store that's hiring</span>
              <select aria-label="Store that's hiring" className="field" value={f.storeId} onChange={set("storeId")}>
                {v.me.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.number}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span className="label">Role</span>
            <select aria-label="Role" className="field" value={f.role} onChange={set("role")}>
              <optgroup label="Staff">
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </optgroup>
              {canAddMgmt && (
                <optgroup label="Management">
                  {MANAGEMENT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <span className="label">Start date</span>
            <input aria-label="Start date" className="field" type="date" required value={f.hireDate} onChange={set("hireDate")} />
          </div>
          <div>
            <span className="label">Email {isManagementRole(f.role) && <span className="text-gold-deep">(managers sign in with this)</span>}</span>
            <input aria-label="Email" className="field" type="email" value={f.email} onChange={set("email")} required={isManagementRole(f.role)} />
          </div>
          <div>
            <span className="label">Phone</span>
            <input aria-label="Phone" className="field" value={f.phone} onChange={set("phone")} />
          </div>
          <div>
            <span className="label">4-digit PIN (leave blank to generate)</span>
            <input aria-label="4-digit PIN (leave blank to generate)" className="field figure tracking-[0.3em]" inputMode="numeric" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </div>
          <label className="flex items-center gap-3 self-end rounded-[2px] border rule px-4 py-2.5 text-[13.5px]">
            <input type="checkbox" aria-label="Trainer" className="size-4 accent-[#1c1915]" checked={f.isTrainer} onChange={(e) => setF({ ...f, isTrainer: e.target.checked })} />
            <GraduationCap className="size-4 text-gold-deep" /> Trainer
          </label>
          <div className="md:col-span-2">
            {add.error && <div className="mb-3 text-[13px] text-oxblood">{errMsg(add.error)}</div>}
            <button disabled={add.isPending} className="btn btn-ink">
              <UserPlus className="size-4" /> Add & start 30/60/90
            </button>
          </div>
        </form>

        <aside className="rounded-[2px] bg-paper-2 p-6">
          <div className="eyebrow mb-1">Their first 90 days</div>
          <div className="mb-4 font-display text-[20px]">{ROLE_LABEL[f.role]} plan · {plan.length} steps</div>
          {[30, 60, 90].map((p) => (
            <div key={p} className="mb-4">
              <div className="figure mb-1 text-[18px] text-gold-deep">{p} days</div>
              <ul className="space-y-1 text-[13px]">
                {plan
                  .filter((i) => i.phase === p)
                  .map((i) => (
                    <li key={i.title} className="flex gap-2">
                      <span className="text-gold-deep">—</span> {i.title}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>
    </Page>
  );
}
