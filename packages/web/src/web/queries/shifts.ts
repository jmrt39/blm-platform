import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useShiftList(storeId: string | null) {
  return useQuery({ ...orpc.shifts.list.queryOptions({ input: { storeId: storeId ?? "", limit: 21 } }), enabled: !!storeId });
}
export function useShift(storeId: string | null, date: string | null) {
  return useQuery({
    ...orpc.shifts.get.queryOptions({ input: { storeId: storeId ?? "", date: date ?? "" } }),
    enabled: !!storeId && !!date,
  });
}
export function useRoster(storeId: string | null) {
  return useQuery({ ...orpc.shifts.roster.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: !!storeId });
}
export function useSubmitShift() {
  const qc = useQueryClient();
  return useMutation(
    orpc.shifts.submit.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.shifts.key() });
        void qc.invalidateQueries({ queryKey: orpc.reports.key() });
        void qc.invalidateQueries({ queryKey: orpc.team.key() });
      },
    }),
  );
}
