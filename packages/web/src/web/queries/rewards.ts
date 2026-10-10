import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useRewards(storeId: string | null) {
  return useQuery({ ...orpc.rewards.board.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: !!storeId });
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: orpc.rewards.key() });
}
export function useAwardReward() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.rewards.award.mutationOptions({ onSuccess }));
}
export function useRevokeReward() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.rewards.revoke.mutationOptions({ onSuccess }));
}
