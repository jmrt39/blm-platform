import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useSetupStatus(enabled = true) {
  return useQuery({ ...orpc.setup.status.queryOptions(), enabled });
}
export function useImportRoster() {
  const qc = useQueryClient();
  return useMutation(
    orpc.setup.importRoster.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.team.key() });
        void qc.invalidateQueries({ queryKey: orpc.setup.key() });
      },
    }),
  );
}
