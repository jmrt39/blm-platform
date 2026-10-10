import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";

const config = {
  applicationId: import.meta.env.VITE_APPLICATION_ID,
  issuer: import.meta.env.VITE_RUNABLE_AUTH_ISSUER,
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  plugins: [managedAuthClient(config)],
});

// Same key the managed-auth plugin reads, so email/password sessions ride the same bearer.
const TOKEN_KEY = "runable.managed-auth.token";

/** Store the bearer returned by email/password sign-in or sign-up. */
export const captureToken = {
  onSuccess(ctx: { response: Response }) {
    const t = ctx.response.headers.get("set-auth-token");
    if (t) localStorage.setItem(TOKEN_KEY, t);
  },
};

/** Finishes a returning managed (Google) sign-in. Started once at boot; the app waits on it before asking who you are. */
export const redirectReady: Promise<unknown> = authClient.managedAuth.handleRedirect().catch(() => null);
