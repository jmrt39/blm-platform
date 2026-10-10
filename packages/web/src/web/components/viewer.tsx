import { createContext, useContext, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useMe } from "../queries/session";
import { authClient } from "../lib/auth";
import { client } from "../lib/api";
import { scopeStore, storeSession } from "../lib/store-session";

type Me = NonNullable<ReturnType<typeof useMe>["data"]>;
export type ReadyMe = Extract<Me, { kind: "ready" }>;

type Ctx = {
  me: ReadyMe;
  /** Selected store, or null for combined (leadership only). */
  scope: string | null;
  setScope: (id: string | null) => void;
  /** A concrete store for store-level pages. */
  storeId: string;
  store: ReadyMe["stores"][number] | undefined;
  isLeader: boolean;
  isManager: boolean;
  signOut: () => Promise<void>;
  /** Leave a store session (PIN, store unlock or demo preview) without signing out of the account. */
  leaveStore: () => Promise<void>;
  refresh: () => Promise<void>;
};

const ViewerCtx = createContext<Ctx | null>(null);

export function useViewer() {
  const v = useContext(ViewerCtx);
  if (!v) throw new Error("useViewer outside provider");
  return v;
}

export function useSessionActions() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  return {
    async signOut() {
      const t = storeSession.get();
      if (t) await client.session.leaveStore().catch(() => null);
      storeSession.clear();
      await authClient.signOut().catch(() => null);
      authClient.managedAuth.clearToken();
      await qc.resetQueries();
      nav("/");
    },
    async leaveStore() {
      await client.session.leaveStore().catch(() => null);
      storeSession.clear();
      await qc.invalidateQueries();
      qc.removeQueries({ predicate: (q) => !JSON.stringify(q.queryKey).includes("session") });
      nav("/");
    },
    async refresh() {
      await qc.invalidateQueries();
    },
  };
}

export function ViewerProvider({ me, children }: { me: ReadyMe; children: React.ReactNode }) {
  const actions = useSessionActions();
  const isLeader = me.level === "owner" || me.level === "area";
  const [raw, setRaw] = useState(() => scopeStore.get());
  const scope = isLeader ? (raw === "all" || !me.storeIds.includes(raw) ? null : raw) : (me.storeIds[0] ?? null);
  const value = useMemo<Ctx>(() => {
    const storeId = scope ?? me.stores[0]?.id ?? "";
    return {
      me,
      scope,
      setScope: (id) => {
        scopeStore.set(id ?? "all");
        setRaw(id ?? "all");
      },
      storeId,
      store: me.stores.find((s) => s.id === storeId),
      isLeader,
      isManager: me.level !== "staff",
      ...actions,
    };
  }, [me, scope, isLeader, actions]);
  return <ViewerCtx.Provider value={value}>{children}</ViewerCtx.Provider>;
}
