import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useStudioMe() {
  return useQuery(orpc.studio.me.queryOptions({ staleTime: 60_000 }));
}

function useInvalidateStudio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.studio.key() });
}

export function useStudioUnlock() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.unlock.mutationOptions({ onSuccess: inv }));
}

export function useStudioClients(enabled = true) {
  return useQuery({ ...orpc.studio.clients.queryOptions(), enabled });
}

export function useStudioBuild(orgId: string) {
  return useQuery({
    ...orpc.studio.get.queryOptions({ input: { orgId } }),
    // Drafts are written in the background; keep the board fresh while they run.
    refetchInterval: (q) => (q.state.data?.busy ? 2500 : false),
  });
}

export function useStudioItem(id: string | null) {
  return useQuery({
    ...orpc.studio.item.queryOptions({ input: { id: id ?? "" } }),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && (q.state.data.aiState === "queued" || q.state.data.aiState === "working") ? 2500 : false),
  });
}

export function useStudioSource(id: string | null) {
  return useQuery({ ...orpc.studio.source.queryOptions({ input: { id: id ?? "" } }), enabled: !!id });
}

export function useCreateClient() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.createClient.mutationOptions({ onSuccess: inv }));
}
export function useStartBuild() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.start.mutationOptions({ onSuccess: inv }));
}
export function useSaveBrief() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.saveBrief.mutationOptions({ onSuccess: inv }));
}
export function useSuggestPriorities() {
  return useMutation(orpc.studio.suggestPriorities.mutationOptions());
}
export function useAddSource() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.addSource.mutationOptions({ onSuccess: inv }));
}
export function useRemoveSource() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.removeSource.mutationOptions({ onSuccess: inv }));
}
export function useSaveItem() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.saveItem.mutationOptions({ onSuccess: inv }));
}
export function useSetItemStatus() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.setStatus.mutationOptions({ onSuccess: inv }));
}
export function useDraftItems() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.draft.mutationOptions({ onSuccess: inv }));
}
export function useCancelDraft() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.cancelDraft.mutationOptions({ onSuccess: inv }));
}
export function useResetItem() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.reset.mutationOptions({ onSuccess: inv }));
}
export function useCreateItem() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.create.mutationOptions({ onSuccess: inv }));
}
export function useRemoveItem() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.remove.mutationOptions({ onSuccess: inv }));
}
export function usePublishProgram() {
  const qc = useQueryClient();
  return useMutation(
    orpc.studio.publish.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.studio.key() });
        void qc.invalidateQueries({ queryKey: orpc.library.key() });
      },
    }),
  );
}
export function useImportHistory() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.importHistory.mutationOptions({ onSuccess: inv }));
}
export function useClearHistory() {
  const inv = useInvalidateStudio();
  return useMutation(orpc.studio.clearHistory.mutationOptions({ onSuccess: inv }));
}
