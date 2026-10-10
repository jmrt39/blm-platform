import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useConductOverview(storeId: string | null, enabled = true) {
  return useQuery({ ...orpc.conduct.overview.queryOptions({ input: { storeId } }), enabled });
}
export function useConductMember(id: string | null | undefined) {
  return useQuery({ ...orpc.conduct.member.queryOptions({ input: { id: id ?? "" } }), enabled: !!id });
}
export function useAction(id: string) {
  return useQuery(orpc.conduct.getAction.queryOptions({ input: { id } }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.conduct.key() });
    void qc.invalidateQueries({ queryKey: orpc.lineups.key() });
    void qc.invalidateQueries({ queryKey: orpc.team.key() });
  };
}
export function useExcuse() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.conduct.excuse.mutationOptions({ onSuccess }));
}
export function useAcknowledge() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.conduct.acknowledge.mutationOptions({ onSuccess }));
}
export function useReviewSwap() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.conduct.reviewSwap.mutationOptions({ onSuccess }));
}
export function useSignAction() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.conduct.signAction.mutationOptions({ onSuccess }));
}
export function useOwnerDecide() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.conduct.ownerDecide.mutationOptions({ onSuccess }));
}

type SwapInput = Omit<Parameters<typeof client.conduct.createSwap>[0], "screenshotKey"> & { file: File };

/** Upload the screenshot straight to storage, then file the swap. */
export function useSubmitSwap() {
  const onSuccess = useInvalidate();
  return useMutation({
    mutationFn: async ({ file, ...rest }: SwapInput) => {
      const type = file.type || "image/png";
      const { key, url } = await client.conduct.swapPresign({ storeId: rest.storeId, contentType: type });
      const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": type } });
      if (!put.ok) throw new Error("The screenshot didn't upload. Try again.");
      return client.conduct.createSwap({ ...rest, screenshotKey: key });
    },
    onSuccess,
  });
}
