import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useMe() {
  return useQuery(orpc.session.me.queryOptions({ staleTime: 30_000 }));
}

/** Any write that changes who the viewer is: refetch everything. */
function useResetAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useSetup() {
  const reset = useResetAll();
  return useMutation(orpc.session.setup.mutationOptions({ onSuccess: reset }));
}
export function useUnlock() {
  return useMutation(orpc.session.unlock.mutationOptions());
}
export function usePinSignIn() {
  return useMutation(orpc.session.pinSignIn.mutationOptions());
}
export function useLeaveStore() {
  return useMutation(orpc.session.leaveStore.mutationOptions());
}
export function useStartDemo() {
  return useMutation(orpc.session.startDemo.mutationOptions());
}
export function useViewAs() {
  return useMutation(orpc.session.viewAs.mutationOptions());
}
