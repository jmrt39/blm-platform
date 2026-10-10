import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePrivacyState(enabled = true) {
  return useQuery({ ...orpc.privacy.state.queryOptions(), enabled, refetchInterval: 60_000 });
}
export function usePrivacyLog(enabled = true) {
  return useQuery({ ...orpc.privacy.log.queryOptions({ input: { limit: 200 } }), enabled });
}

/** Opening or closing the wall changes what nearly every page may show, so everything refetches. */
function useRefreshAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}
export function useStartUnlock() {
  const refresh = useRefreshAll();
  return useMutation(
    orpc.privacy.start.mutationOptions({
      onSuccess: (r) => {
        if (r.step === "open") refresh();
      },
    }),
  );
}
export function useVerifyUnlock() {
  const onSuccess = useRefreshAll();
  return useMutation(orpc.privacy.verify.mutationOptions({ onSuccess }));
}
export function useLockPrivacy() {
  const onSuccess = useRefreshAll();
  return useMutation(orpc.privacy.lock.mutationOptions({ onSuccess }));
}
export function useSetSecurityPhone() {
  const qc = useQueryClient();
  return useMutation(
    orpc.privacy.setPhone.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.privacy.key() });
      },
    }),
  );
}
