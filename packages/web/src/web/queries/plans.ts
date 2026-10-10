import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePlan(actionId: string | null | undefined) {
  return useQuery({ ...orpc.plans.get.queryOptions({ input: { actionId: actionId ?? "" } }), enabled: !!actionId });
}
export function usePlanPrefill(actionId: string, date: string, shift: "lunch" | "dinner", enabled: boolean) {
  return useQuery({ ...orpc.plans.prefill.queryOptions({ input: { actionId, date, shift } }), enabled: enabled && !!date });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.plans.key() });
    void qc.invalidateQueries({ queryKey: orpc.conduct.key() });
    void qc.invalidateQueries({ queryKey: orpc.team.key() });
    void qc.invalidateQueries({ queryKey: orpc.rewards.key() });
  };
}
export function usePlanSetup() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.plans.setup.mutationOptions({ onSuccess }));
}
export function useLogPlanShift() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.plans.logShift.mutationOptions({ onSuccess }));
}
export function useRemovePlanShift() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.plans.removeShift.mutationOptions({ onSuccess }));
}
export function useGraduatePlan() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.plans.graduate.mutationOptions({ onSuccess }));
}
