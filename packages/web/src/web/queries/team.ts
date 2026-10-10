import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useTeam(storeId: string | null) {
  return useQuery(orpc.team.list.queryOptions({ input: { storeId } }));
}
export function useMember(id: string) {
  return useQuery(orpc.team.get.queryOptions({ input: { id } }));
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.team.key() });
    void qc.invalidateQueries({ queryKey: orpc.reports.key() });
  };
}
export function useAddColleague() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.team.create.mutationOptions({ onSuccess }));
}
export function useUpdateMember() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.team.update.mutationOptions({ onSuccess }));
}
export function useSetOnboarding() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.team.setOnboarding.mutationOptions({ onSuccess }));
}
export function useDepart() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.team.depart.mutationOptions({ onSuccess }));
}
