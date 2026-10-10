import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { indexLibrary, STANDARD_LIBRARY, type Library } from "../../shared/library/standard";

const STANDARD = indexLibrary(STANDARD_LIBRARY);

/** The program this group runs on. Falls back to the BLM standard while loading. */
export function useLibrary() {
  const q = useQuery({ ...orpc.library.get.queryOptions(), staleTime: 5 * 60_000 });
  return useMemo(() => (q.data ? indexLibrary(q.data as Library) : STANDARD), [q.data]);
}
