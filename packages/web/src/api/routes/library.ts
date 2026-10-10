import { viewerBase } from "../lib/access";
import { loadLibrary } from "../lib/library";

export const library = {
  /** The program this group runs on: their published copy from the Studio, or the BLM standard. */
  get: viewerBase.handler(async ({ context }) => (await loadLibrary(context.viewer.orgId)).lib),
};
