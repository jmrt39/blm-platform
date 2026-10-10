import { db } from "./src/api/database";
import * as s from "./src/api/database/schema";
import { eq, like } from "drizzle-orm";
const map: Record<string,string> = {
  "Specialty cocktail build-out": "Specialty cocktail build out",
  "Wine list: by-the-glass and top 20 bottles": "Wine list: by the glass and top 20 bottles",
  "Full floor sign-off": "Full floor sign off",
  "90-day review with GM": "90 day review with GM",
  "Run a pre-shift line-up": "Run a pre shift line up",
};
let n = 0;
for (const [a,b] of Object.entries(map)) {
  const r = await db.update(s.onboardingItems).set({ title: b }).where(eq(s.onboardingItems.title, a)).returning({ id: s.onboardingItems.id });
  n += r.length;
}
console.log("onboarding renamed", n);
for (const tbl of [s.checklistTemplateItems, s.checklistLines] as const) {
  const old = await db.select({ id: tbl.id, title: tbl.title }).from(tbl).where(like(tbl.title, "%—%"));
  for (const o of old) await db.update(tbl).set({ title: o.title.replace(/ — /g, ": ").replace(/—/g, ": ") }).where(eq(tbl.id, o.id));
  console.log("dash titles fixed", old.length);
}
