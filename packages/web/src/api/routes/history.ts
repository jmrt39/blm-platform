import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { loadStore, managerBase, viewerBase } from "../lib/access";
import { businessDate } from "../lib/time";
import { historyCoverage, onThisDay } from "../lib/history";

export const history = {
  /** This day last year at one store: what the room did, for line up and planning. */
  onThisDay: viewerBase.input(z.object({ storeId: z.string() })).handler(async ({ input, context }) => {
    const store = await loadStore(context.viewer, input.storeId);
    const today = businessDate(store.timezone);
    return { today, lastYear: await onThisDay([store.id], today) };
  }),

  /** How much of last year each store has on file. */
  coverage: managerBase.handler(async ({ context }) => {
    const ids = context.viewer.storeIds;
    const stores = ids.length ? await db.select({ id: s.stores.id, name: s.stores.name }).from(s.stores).where(inArray(s.stores.id, ids)) : [];
    const cov = await historyCoverage(ids);
    return stores.map((st) => ({ ...st, ...cov.get(st.id)! }));
  }),
};
