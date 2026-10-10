import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useCerts(storeId: string | null, enabled = true) {
  return useQuery({ ...orpc.certs.list.queryOptions({ input: { storeId } }), enabled });
}
export function useMemberCerts(id: string) {
  return useQuery(orpc.certs.member.queryOptions({ input: { id } }));
}
export function useRecordCert() {
  const qc = useQueryClient();
  return useMutation(
    orpc.certs.record.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.certs.key() });
        void qc.invalidateQueries({ queryKey: orpc.training.key() });
        void qc.invalidateQueries({ queryKey: orpc.reports.key() });
      },
    }),
  );
}
