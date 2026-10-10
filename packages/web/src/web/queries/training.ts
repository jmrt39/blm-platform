import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useTrainingBoard(storeId: string | null) {
  return useQuery({ ...orpc.training.board.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: !!storeId });
}
export function useTrainingMember(id: string | null, enabled = true) {
  return useQuery({ ...orpc.training.member.queryOptions({ input: { id } }), enabled });
}
export function useTrainingModule(slug: string, memberId: string | null) {
  return useQuery(orpc.training.module.queryOptions({ input: { slug, memberId } }));
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.training.key() });
    void qc.invalidateQueries({ queryKey: orpc.rewards.key() });
  };
}
export function useMarkModuleRead() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.training.markRead.mutationOptions({ onSuccess }));
}
export function useSignOffModule() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.training.signOff.mutationOptions({ onSuccess }));
}
