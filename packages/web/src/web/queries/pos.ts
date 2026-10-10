import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePos(storeId: string, enabled = true) {
  return useQuery({ ...orpc.pos.get.queryOptions({ input: { storeId } }), enabled: enabled && !!storeId });
}

/** Figures the POS sent for a night, waiting for the manager to load and sign. */
export function useStagedPos(storeId: string, date: string, enabled = true) {
  return useQuery({ ...orpc.pos.staged.queryOptions({ input: { storeId, date } }), enabled: enabled && !!storeId && !!date, retry: false });
}

function useAfter() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.pos.key() });
  };
}

export function useSavePos() {
  const onSuccess = useAfter();
  return useMutation(orpc.pos.save.mutationOptions({ onSuccess }));
}
export function useRotatePosKey() {
  const onSuccess = useAfter();
  return useMutation(orpc.pos.rotateKey.mutationOptions({ onSuccess }));
}
export function useTestPos() {
  const onSuccess = useAfter();
  return useMutation(orpc.pos.test.mutationOptions({ onSuccess }));
}
export function usePullPos() {
  const onSuccess = useAfter();
  return useMutation(orpc.pos.pullNow.mutationOptions({ onSuccess }));
}
