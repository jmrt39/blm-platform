import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useStores() {
  return useQuery(orpc.stores.list.queryOptions());
}
export function useLeadership(enabled: boolean) {
  return useQuery({ ...orpc.stores.leadership.queryOptions(), enabled });
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.stores.key() });
    void qc.invalidateQueries({ queryKey: orpc.session.key() });
  };
}
export function useCreateStore() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.stores.create.mutationOptions({ onSuccess }));
}
export function useUpdateStore() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.stores.update.mutationOptions({ onSuccess }));
}
export function useAddAreaManager() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.stores.addAreaManager.mutationOptions({ onSuccess }));
}
export function useUpdateAreaManager() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.stores.updateAreaManager.mutationOptions({ onSuccess }));
}
export function useRemoveAreaManager() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.stores.removeAreaManager.mutationOptions({ onSuccess }));
}
