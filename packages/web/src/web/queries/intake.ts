import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useIntakeMissing(orgId: string) {
  return useQuery(orpc.intake.missing.queryOptions({ input: { orgId } }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: orpc.intake.key() }), qc.invalidateQueries({ queryKey: orpc.studio.key() })]);
}

export function useImportIntake() {
  const inv = useInvalidate();
  return useMutation(orpc.intake.import.mutationOptions({ onSuccess: inv }));
}

export function useRefreshStandard() {
  const inv = useInvalidate();
  return useMutation(orpc.intake.refreshStandard.mutationOptions({ onSuccess: inv }));
}
