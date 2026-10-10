import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useTodayChecklists(storeId: string | null) {
  return useQuery({ ...orpc.checklists.today.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: !!storeId });
}
export function useChecklist(id: string) {
  return useQuery(orpc.checklists.get.queryOptions({ input: { id } }));
}
export function useChecklistHistory(storeId: string | null, days = 21) {
  return useQuery({ ...orpc.checklists.history.queryOptions({ input: { storeId: storeId ?? "", days } }), enabled: !!storeId });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.checklists.key() });
    void qc.invalidateQueries({ queryKey: orpc.reports.key() });
  };
}
export function useInitialLine() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.initial.mutationOptions({ onSuccess }));
}
export function useClearLine() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.clear.mutationOptions({ onSuccess }));
}
export function useVerifyChecklist() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.verify.mutationOptions({ onSuccess }));
}
export function useSubmitChecklist() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.submit.mutationOptions({ onSuccess }));
}
export function useUnverifyChecklist() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.unverify.mutationOptions({ onSuccess }));
}
export function useMarkNa() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.checklists.markNa.mutationOptions({ onSuccess }));
}
