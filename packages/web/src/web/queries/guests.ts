import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useGuestFeedback(storeId: string | null, memberId?: string | null) {
  return useQuery(orpc.guests.list.queryOptions({ input: { storeId, memberId: memberId ?? null } }));
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.guests.key() });
    void qc.invalidateQueries({ queryKey: orpc.rewards.key() });
    void qc.invalidateQueries({ queryKey: orpc.lineups.key() });
  };
}
export function useCreateFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.create.mutationOptions({ onSuccess }));
}
export function usePinFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.pin.mutationOptions({ onSuccess }));
}
export function useRemoveFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.remove.mutationOptions({ onSuccess }));
}
