import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** What this store did on the same weekday last year. Null when no history is on file. */
export function useOnThisDay(storeId: string | null | undefined) {
  return useQuery({ ...orpc.history.onThisDay.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: !!storeId, staleTime: 10 * 60_000 });
}
