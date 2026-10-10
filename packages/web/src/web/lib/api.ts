import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "../../api";
import { authClient } from "./auth";
import { storeSession } from "./store-session";

const link = new RPCLink({
  url: `${window.location.origin}/api/rpc`,
  headers: () => {
    const h: Record<string, string> = {};
    const token = authClient.managedAuth.getToken();
    if (token) h.Authorization = `Bearer ${token}`;
    const store = storeSession.get();
    if (store) h["x-blm-store"] = store;
    return h;
  },
});

/** Direct typed client: await client.ping() */
export const client: AppRouterClient = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.ping.queryOptions()) */
export const orpc = createTanstackQueryUtils(client);
