// Which program an org runs on: their published copy from the Studio, or the BLM standard written for their house.
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { forHouse, houseName, indexLibrary, STANDARD_LIBRARY, standardLibraryFor, type Library, type LibraryIndex } from "../../shared/library/standard";

const STANDARD = indexLibrary(standardLibraryFor("House"));
const cache = new Map<string, { version: number; idx: LibraryIndex }>();
const standardByHouse = new Map<string, LibraryIndex>();

async function houseOf(orgId: string) {
  const [org] = await db.select({ name: s.orgs.name }).from(s.orgs).where(eq(s.orgs.id, orgId));
  return houseName(org?.name);
}

export async function loadLibrary(orgId: string): Promise<LibraryIndex> {
  const [head] = await db
    .select({ version: s.orgPrograms.version })
    .from(s.orgPrograms)
    .where(eq(s.orgPrograms.orgId, orgId));
  if (!head) {
    const house = await houseOf(orgId);
    let idx = standardByHouse.get(house);
    if (!idx) {
      idx = indexLibrary(standardLibraryFor(house));
      standardByHouse.set(house, idx);
    }
    return idx;
  }
  const hit = cache.get(orgId);
  if (hit && hit.version === head.version) return hit.idx;
  const [row] = await db.select().from(s.orgPrograms).where(eq(s.orgPrograms.orgId, orgId));
  if (!row) return STANDARD;
  const house = await houseOf(orgId);
  // A published copy can still carry the token if an item was never edited; fill it for this house.
  const data = forHouse(row.data as Library, house);
  // Rewards the platform added after this program was published still apply, at the standard values.
  const extra = forHouse(STANDARD_LIBRARY.rewards, house).filter((r) => !data.rewards.some((x) => x.key === r.key));
  const idx = indexLibrary({ ...data, rewards: [...data.rewards, ...extra] });
  cache.set(orgId, { version: row.version, idx });
  return idx;
}

export function standardLibrary() {
  return STANDARD;
}
