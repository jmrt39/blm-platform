import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useUpdates(storeId: string | null) {
  return useQuery(orpc.updates.list.queryOptions({ input: { storeId } }));
}
export function useUpdate(id: string) {
  return useQuery(orpc.updates.get.queryOptions({ input: { id } }));
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.updates.key() });
    void qc.invalidateQueries({ queryKey: orpc.quizzes.key() });
  };
}
export function useCreateUpdate() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.updates.create.mutationOptions({ onSuccess }));
}
export function useMarkUpdateRead() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.updates.markRead.mutationOptions({ onSuccess }));
}
