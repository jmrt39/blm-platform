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
export function useFeedbackInbox(storeId: string | null, enabled = true) {
  return useQuery({ ...orpc.guests.inbox.queryOptions({ input: { storeId } }), enabled });
}
export function useMySurveys(memberId: string | null, enabled = true) {
  return useQuery({ ...orpc.guests.mine.queryOptions({ input: { memberId } }), enabled });
}
export function useTagFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.tag.mutationOptions({ onSuccess }));
}
export function useReadFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.read.mutationOptions({ onSuccess }));
}
export function useAboveBeyond() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.aboveBeyond.mutationOptions({ onSuccess }));
}
export function useAckSurveys() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.ack.mutationOptions({ onSuccess }));
}
export function useRespondFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.respond.mutationOptions({ onSuccess }));
}
export function useImportFeedback() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.guests.import.mutationOptions({ onSuccess }));
}
