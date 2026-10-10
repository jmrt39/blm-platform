import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Eye, LogOut, Menu, X } from "lucide-react";
import { motion } from "motion/react";
import { Monogram, Wordmark } from "./monogram";
import { useViewer } from "./viewer";
import { useViewAs } from "../queries/session";
import { storeSession } from "../lib/store-session";
import { ROLE_LABEL } from "../../shared/domain";
import { cn } from "../lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type NavItem = { href: string; label: string };

function navFor(level: string): { main: NavItem[]; program: NavItem[] } {
  if (level === "staff")
    return {
      main: [
        { href: "/", label: "Today" },
        { href: "/checklists", label: "Checklists" },
        { href: "/training", label: "Training" },
        { href: "/quizzes", label: "Quizzes" },
        { href: "/updates", label: "Updates" },
        { href: "/team", label: "Team" },
        { href: "/conduct", label: "My record" },
      ],
      program: [],
    };
  return {
    main: [
      { href: "/", label: "Home" },
      { href: "/checklists", label: "Checklists" },
      { href: "/team", label: "Team" },
      { href: "/lineup", label: "Line-up" },
      { href: "/conduct", label: "Conduct" },
      { href: "/shift-report", label: "Shift report" },
      { href: "/reports", label: "Reports" },
      { href: "/stores", label: level === "manager" ? "Store" : "Stores" },
    ],
    program: [
      { href: "/training", label: "Training" },
      { href: "/quizzes", label: "Quizzes" },
      { href: "/updates", label: "Updates" },
      { href: "/guests", label: "Guest feedback" },
      { href: "/rewards", label: "Rewards" },
      { href: "/certs", label: "Certifications" },
      { href: "/logbook", label: "Log book" },
      { href: "/slow", label: "Slow night" },
    ],
  };
}

const PROGRAM_PATHS = ["/training", "/grading", "/quizzes", "/updates", "/guests", "/rewards", "/certs", "/logbook", "/slow"];

function ProgramMenu({ items, active }: { items: NavItem[]; active: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const on = PROGRAM_PATHS.some((p) => loc.startsWith(p));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Program menu"
        aria-expanded={open}
        className={cn(
          "relative flex items-center gap-1 whitespace-nowrap px-2.5 py-2 text-[13px] font-semibold tracking-wide transition-colors",
          on ? "text-gold" : "text-[#b9b0a3] hover:text-ivory",
        )}
      >
        Program <ChevronDown className="size-3.5" />
        {on && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-gold" />}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-3 w-56 rounded-[2px] border border-noir-line bg-noir-2 p-1.5 shadow-2xl">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cn("block rounded-[1px] px-3 py-2 text-[13px] font-semibold", active(i.href) ? "bg-gold/10 text-gold" : "text-ivory hover:bg-white/5")}
              >
                {i.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DemoLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-gold" /> Demo data · illustrative
    </span>
  );
}

function ScopePicker() {
  const v = useViewer();
  const [open, setOpen] = useState(false);
  if (!v.isLeader) {
    return (
      <div className="hidden text-left md:block">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Store {v.store?.number}</div>
        <div className="text-[13px] text-ivory">{v.store?.name}</div>
      </div>
    );
  }
  const label = v.scope ? (v.store?.name ?? "Store") : "All stores — combined";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[2px] border border-noir-line px-3 py-1.5 text-left hover:border-gold/60"
      >
        <div>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-gold">Viewing</div>
          <div className="max-w-[190px] truncate text-[13px] text-ivory">{label}</div>
        </div>
        <ChevronDown className="size-4 text-gold" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-[2px] border border-noir-line bg-noir-2 p-1.5 shadow-2xl">
            <ScopeItem active={!v.scope} onClick={() => (v.setScope(null), setOpen(false))} title="All stores — combined" sub={`${v.me.stores.length} stores`} />
            <div className="my-1 h-px bg-noir-line" />
            {v.me.stores.map((s) => (
              <ScopeItem
                key={s.id}
                active={v.scope === s.id}
                onClick={() => (v.setScope(s.id), setOpen(false))}
                title={s.name}
                sub={`Store ${s.number}${s.city ? ` · ${s.city}` : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScopeItem({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={cn("block w-full rounded-[2px] px-3 py-2 text-left hover:bg-noir", active && "bg-noir")}>
      <div className={cn("text-[13.5px]", active ? "text-gold" : "text-ivory")}>{title}</div>
      <div className="text-[11px] text-[#8b8277]">{sub}</div>
    </button>
  );
}

function ViewAsSwitcher() {
  const v = useViewer();
  const viewAs = useViewAs();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [, nav] = useLocation();
  if (!v.me.isDemo || !v.me.demo || !v.me.user) return null;
  const cast = v.me.demo.cast;
  const storeName = (id: string) => v.me.demo!.stores.find((s) => s.id === id)?.name ?? "";
  const go = async (memberId: string | null) => {
    setOpen(false);
    if (!memberId) return v.leaveStore();
    const r = await viewAs.mutateAsync({ memberId });
    storeSession.set(r.token);
    await qc.resetQueries();
    nav("/");
  };
  const current = v.me.viewingAs ? v.me.accessName : "Owner (you)";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 whitespace-nowrap rounded-[2px] bg-gold/10 px-3 py-1.5 text-[12px] font-semibold text-gold hover:bg-gold/20"
      >
        <Eye className="size-3.5" /> <span className="hidden 2xl:inline">View as:</span> <span className="max-w-[120px] truncate">{current}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-[2px] border border-noir-line bg-noir-2 p-1.5 shadow-2xl">
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Preview the demo as</div>
            <ScopeItem active={!v.me.viewingAs} onClick={() => go(null)} title="Owner (you)" sub="All stores · combined reports" />
            {["D. Kerr", "Camille Rhodes", "Chris Ortega", "Andre Wallace", "Rebecca Stone"].map((n) => {
              const c = cast.find((x) => x.name === n);
              if (!c) return null;
              return (
                <ScopeItem
                  key={c.id}
                  active={v.me.viewingAs && v.me.member?.id === c.id}
                  onClick={() => go(c.id)}
                  title={`${c.name} — ${ROLE_LABEL[c.role]}`}
                  sub={`${storeName(c.storeId)} · PIN ${c.pin}`}
                />
              );
            })}
            <div className="mt-1 border-t border-noir-line px-3 py-2 text-[11px] leading-relaxed text-[#8b8277]">
              Store numbers for PIN sign-in:{" "}
              {v.me.demo.stores.map((s) => `${s.name.replace("1906 ", "")} ${s.number}`).join(" · ")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserChip() {
  const v = useViewer();
  const [open, setOpen] = useState(false);
  const roleLabel = ROLE_LABEL[v.me.accessRole] ?? v.me.accessRole;
  const hasStoreSession = !!v.me.member && !!v.me.user && !v.me.viewingAs;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 text-left">
        <div className="hidden whitespace-nowrap text-right sm:block">
          <div className="text-[13px] text-ivory">{v.me.accessName}</div>
          <div className="text-[10.5px] text-[#8b8277]">{roleLabel}</div>
        </div>
        <div className="grid size-9 place-items-center rounded-full border border-gold/50 font-display text-[13px] text-gold">
          {v.me.member?.initials ?? v.me.accessName.slice(0, 1)}
        </div>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-[2px] border border-noir-line bg-noir-2 p-1.5 shadow-2xl">
            <div className="px-3 py-2">
              <div className="text-[13px] text-ivory">{v.me.accessName}</div>
              <div className="text-[11px] text-[#8b8277]">
                {roleLabel} · {v.me.orgName}
              </div>
            </div>
            {v.me.member && (
              <Link href={`/team/${v.me.member.id}`} onClick={() => setOpen(false)} className="block rounded-[2px] px-3 py-2 text-[13px] text-ivory hover:bg-noir">
                My profile
              </Link>
            )}
            {hasStoreSession && (
              <button onClick={() => v.leaveStore()} className="block w-full rounded-[2px] px-3 py-2 text-left text-[13px] text-ivory hover:bg-noir">
                Lock store
              </button>
            )}
            <button onClick={() => v.signOut()} className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-left text-[13px] text-ivory hover:bg-noir">
              <LogOut className="size-3.5 text-gold" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const v = useViewer();
  const [loc] = useLocation();
  const [mobile, setMobile] = useState(false);
  const { main: items, program } = navFor(v.me.level);
  const active = (href: string) => (href === "/" ? loc === "/" : loc.startsWith(href));
  return (
    <div className="noir-frame grain on-noir min-h-screen">
      <header className="sticky top-0 z-30 border-b border-noir-line bg-noir/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Monogram size={38} />
            <Wordmark className="hidden 2xl:block" />
          </Link>
          <div className="hidden h-8 w-px bg-noir-line md:block" />
          <ScopePicker />
          <nav className="ml-1 hidden items-center xl:flex">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "relative whitespace-nowrap px-2.5 py-2 text-[13px] font-semibold tracking-wide transition-colors",
                  active(i.href) ? "text-gold" : "text-[#b9b0a3] hover:text-ivory",
                )}
              >
                {i.label}
                {active(i.href) && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-gold" />}
              </Link>
            ))}
            {program.length > 0 && <ProgramMenu items={program} active={active} />}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {v.me.isDemo && <DemoLabel className="hidden whitespace-nowrap 2xl:inline-flex" />}
            <ViewAsSwitcher />
            <UserChip />
            <button className="text-ivory xl:hidden" onClick={() => setMobile((m) => !m)} aria-label="Menu">
              {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {mobile && (
          <nav className="border-t border-noir-line px-4 py-2 xl:hidden">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setMobile(false)}
                className={cn("block py-2.5 text-[14px] font-semibold", active(i.href) ? "text-gold" : "text-ivory")}
              >
                {i.label}
              </Link>
            ))}
            {program.length > 0 && (
              <>
                <div className="eyebrow mt-3 border-t border-noir-line pb-1 pt-3 !text-gold">Program</div>
                {program.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setMobile(false)}
                    className={cn("block py-2.5 text-[14px] font-semibold", active(i.href) ? "text-gold" : "text-ivory")}
                  >
                    {i.label}
                  </Link>
                ))}
              </>
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-[1280px] px-3 py-6 md:px-6 md:py-8">
        {v.me.isDemo && <DemoLabel className="mb-4 2xl:hidden" />}
        {children}
      </main>
      <footer className="mx-auto flex max-w-[1280px] items-center gap-3 px-6 pb-16 pt-4 text-[11px] text-[#6d655b]">
        <Monogram size={18} /> The Platform — Bottom Line Multiplied · Front of house
      </footer>
    </div>
  );
}

/** Paper sheet with a page header. */
export function Page({
  eyebrow,
  title,
  aside,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn("sheet px-5 py-7 md:px-10 md:py-10", className)}
    >
      <div className="relative mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-5">
        <div>
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="font-display text-[32px] leading-[1.05] text-ink md:text-[44px]">{title}</h1>
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      <div className="relative">{children}</div>
    </motion.section>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Monogram size={44} className="animate-pulse" />
        <div className="eyebrow">{label}</div>
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const m = error && typeof error === "object" && "message" in error ? String((error as { message: string }).message) : "Something went wrong.";
  return <div className="rounded-[2px] border border-oxblood/40 bg-oxblood/5 px-3 py-2 text-[13px] text-oxblood">{m}</div>;
}
