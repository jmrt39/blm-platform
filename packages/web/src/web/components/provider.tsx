import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Refusals (private, forbidden, not found) will not change on a retry; network blips might. */
function retry(count: number, error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 0;
  if (status >= 400 && status < 500) return false;
  return count < 3;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry } } });

interface ProviderProps {
  children: React.ReactNode;
}

// App-level providers — add theme/context providers here, wrapping children.
// QueryClientProvider must stay (all API calls run through TanStack Query).
export function Provider({ children }: ProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
