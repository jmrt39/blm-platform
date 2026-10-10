import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useGrades(storeId: string | null, memberId?: string | null) {
  return useQuery({ ...orpc.grading.list.queryOptions({ input: { storeId: storeId ?? "", memberId: memberId ?? null } }), enabled: !!storeId });
}
export function useGrade(id: string) {
  return useQuery(orpc.grading.get.queryOptions({ input: { id } }));
}
export function useCompetencies(storeIds: string[], enabled = true) {
  return useQuery({ ...orpc.grading.competencies.queryOptions({ input: { storeIds } }), enabled: enabled && storeIds.length > 0 });
}
export function useCreateGrade() {
  const qc = useQueryClient();
  return useMutation(
    orpc.grading.create.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.grading.key() });
        void qc.invalidateQueries({ queryKey: orpc.training.key() });
        void qc.invalidateQueries({ queryKey: orpc.rewards.key() });
      },
    }),
  );
}
