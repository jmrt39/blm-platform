import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

type Shift = "lunch" | "dinner";

export function useLineup(storeId: string | null, shift: Shift, date?: string) {
  return useQuery({ ...orpc.lineups.get.queryOptions({ input: { storeId: storeId ?? "", shift, date } }), enabled: !!storeId });
}

/** Line-up edits are tapped in quick succession; run them one at a time so a later write never reads stale state. */
const scope = { id: "lineup-write" };

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.lineups.key() });
    void qc.invalidateQueries({ queryKey: orpc.conduct.key() });
  };
}
export function useStartLineup() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.start.mutationOptions({ onSuccess }), scope });
}
export function useSetLineup() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.setLineup.mutationOptions({ onSuccess }), scope });
}
export function useSetEntry() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.setEntry.mutationOptions({ onSuccess }), scope });
}
export function useMarkRest() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.markRest.mutationOptions({ onSuccess }), scope });
}
export function useAddEntry() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.addEntry.mutationOptions({ onSuccess }), scope });
}
export function useRemoveEntry() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.removeEntry.mutationOptions({ onSuccess }), scope });
}
export function useCloseLineup() {
  const onSuccess = useInvalidate();
  return useMutation({ ...orpc.lineups.close.mutationOptions({ onSuccess }), scope });
}
