import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useHome(storeId: string | null, enabled = true) {
  return useQuery({ ...orpc.reports.home.queryOptions({ input: { storeId } }), enabled });
}
export function useRange(storeId: string | null, days: number) {
  return useQuery(orpc.reports.range.queryOptions({ input: { storeId, days } }));
}
