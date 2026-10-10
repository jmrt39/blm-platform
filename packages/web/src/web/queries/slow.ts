import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useSlowBoard(storeId: string | null, shift: "lunch" | "dinner", expectedCovers: number | null) {
  return useQuery({
    ...orpc.slow.board.queryOptions({ input: { storeId: storeId ?? "", shift, expectedCovers } }),
    enabled: !!storeId,
    placeholderData: (p) => p,
  });
}
export function useHourGoal(memberId: string | null, enabled = true) {
  return useQuery({ ...orpc.slow.myGoal.queryOptions({ input: { memberId } }), enabled });
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: orpc.slow.key() });
}
export function useSlowDecide() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.slow.decide.mutationOptions({ onSuccess }));
}
export function useSlowUndo() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.slow.undo.mutationOptions({ onSuccess }));
}
export function usePostCall() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.slow.postCall.mutationOptions({ onSuccess }));
}
export function useCloseCall() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.slow.closeCall.mutationOptions({ onSuccess }));
}
export function useSetHourGoal() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.slow.setGoal.mutationOptions({ onSuccess }));
}
