// Store-level session token (staff PIN sign-in, manager store unlock, demo "view as").
const KEY = "blm.store-session";
const SCOPE = "blm.scope";

export const storeSession = {
  get: () => localStorage.getItem(KEY) ?? "",
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

/** Leadership's chosen scope: a store id, or "all" for combined. */
export const scopeStore = {
  get: () => localStorage.getItem(SCOPE) ?? "all",
  set: (v: string) => localStorage.setItem(SCOPE, v),
};
