import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useLog(storeId: string | null, days = 21) {
  return useQuery({ ...orpc.logbook.list.queryOptions({ input: { storeId: storeId ?? "", days } }), enabled: !!storeId });
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.logbook.key() });
    void qc.invalidateQueries({ queryKey: orpc.reports.key() });
  };
}
export function usePresignLog() {
  return useMutation(orpc.logbook.presign.mutationOptions());
}
export function useCreateLog() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.logbook.create.mutationOptions({ onSuccess }));
}
export function useResolveLog() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.logbook.resolve.mutationOptions({ onSuccess }));
}
export function useLogEntry(id: string) {
  return useQuery(orpc.logbook.get.queryOptions({ input: { id } }));
}

type CreateInput = Omit<Parameters<typeof client.logbook.create>[0], "photoKey"> & { file?: File | null };

/** Upload the photo (if any) straight to storage, then write the entry. */
export function useCreateLogWithPhoto() {
  const onSuccess = useInvalidate();
  return useMutation({
    mutationFn: async ({ file, ...rest }: CreateInput) => {
      let photoKey: string | null = null;
      if (file) {
        const type = file.type || "image/jpeg";
        const { key, url } = await client.logbook.presign({ storeId: rest.storeId, contentType: type });
        const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": type } });
        if (!put.ok) throw new Error("The photo didn't upload. Try again, or save without it.");
        photoKey = key;
      }
      return client.logbook.create({ ...rest, photoKey });
    },
    onSuccess,
  });
}
