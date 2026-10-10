import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useQuizzes(storeId: string | null) {
  return useQuery(orpc.quizzes.list.queryOptions({ input: { storeId } }));
}
export function useQuiz(slug: string) {
  return useQuery({ ...orpc.quizzes.get.queryOptions({ input: { slug } }), staleTime: Infinity });
}
export function useQuizResults(storeId: string | null, enabled = true) {
  return useQuery({ ...orpc.quizzes.results.queryOptions({ input: { storeId: storeId ?? "" } }), enabled: enabled && !!storeId });
}
export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation(
    orpc.quizzes.submit.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: orpc.quizzes.list.key() });
        void qc.invalidateQueries({ queryKey: orpc.quizzes.results.key() });
        void qc.invalidateQueries({ queryKey: orpc.training.key() });
        void qc.invalidateQueries({ queryKey: orpc.updates.key() });
      },
    }),
  );
}
