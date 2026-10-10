// Which program an org runs on: their published copy from the Studio, or the BLM standard.
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { indexLibrary, STANDARD_LIBRARY, type Library, type LibraryIndex } from "../../shared/library/standard";

const STANDARD = indexLibrary(STANDARD_LIBRARY);
const cache = new Map<string, { version: number; idx: LibraryIndex }>();

export async function loadLibrary(orgId: string): Promise<LibraryIndex> {
  const [head] = await db
    .select({ version: s.orgPrograms.version })
    .from(s.orgPrograms)
    .where(eq(s.orgPrograms.orgId, orgId));
  if (!head) return STANDARD;
  const hit = cache.get(orgId);
  if (hit && hit.version === head.version) return hit.idx;
  const [row] = await db.select().from(s.orgPrograms).where(eq(s.orgPrograms.orgId, orgId));
  if (!row) return STANDARD;
  const data = row.data as Library;
  // Rewards the platform added after this program was published still apply, at the standard values.
  const rewards = [...data.rewards, ...STANDARD_LIBRARY.rewards.filter((r) => !data.rewards.some((x) => x.key === r.key))];
  const idx = indexLibrary({ ...data, rewards });
  cache.set(orgId, { version: row.version, idx });
  return idx;
}

export function standardLibrary() {
  return STANDARD;
}
