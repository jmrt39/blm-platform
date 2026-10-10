import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useBackupStatus(enabled = true) {
  return useQuery({ ...orpc.backups.status.queryOptions(), enabled });
}
export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation(
    orpc.backups.runNow.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.backups.key() });
      },
    }),
  );
}
/** Fetch one backup and save it as a file. */
export function useDownloadBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await client.backups.download({ id });
      const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      void qc.invalidateQueries({ queryKey: orpc.privacy.key() });
      return r.filename;
    },
  });
}
