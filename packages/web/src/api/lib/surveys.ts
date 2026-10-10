// Guest reviews and surveys: finding who they name, and each colleague's guest star rating.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { addDays } from "./time";
import { matchNames, type NameMatch } from "../../shared/name-match";

type Feedback = typeof s.guestFeedback.$inferSelect;

/** Colleagues on shift that day or the day before (reviews often come in the morning after). */
async function workedAround(storeId: string, date: string) {
  const rows = await db
    .select({ memberId: s.shiftReportLines.memberId })
    .from(s.shiftReportLines)
    .innerJoin(s.shiftReports, eq(s.shiftReports.id, s.shiftReportLines.reportId))
    .where(and(eq(s.shiftReports.storeId, storeId), inArray(s.shiftReports.businessDate, [date, addDays(date, -1)])));
  return new Set(rows.map((r) => r.memberId).filter((x): x is string => !!x));
}

/** Who the review names, from the store's active roster. */
export async function findNames(storeId: string, text: string, receivedOn: string): Promise<NameMatch[]> {
  const [people, worked] = await Promise.all([
    db
      .select({ id: s.members.id, name: s.members.name, role: s.members.role })
      .from(s.members)
      .where(and(eq(s.members.storeId, storeId), eq(s.members.status, "active"))),
    workedAround(storeId, receivedOn),
  ]);
  return matchNames(text, people, { worked });
}

/** Tag reviews nobody has tagged yet. Never touches a manager's tag. Returns how many were tagged. */
export async function autoTagUntagged(storeId: string) {
  const rows = await db
    .select()
    .from(s.guestFeedback)
    .where(and(eq(s.guestFeedback.storeId, storeId), isNull(s.guestFeedback.tagSource)));
  let n = 0;
  for (const f of rows) {
    if (f.memberIds.length) {
      // Recorded before tagging existed, with names picked by a manager.
      await db.update(s.guestFeedback).set({ tagSource: "manager", taggedByName: f.recordedByName, taggedAt: f.createdAt }).where(eq(s.guestFeedback.id, f.id));
      continue;
    }
    const matches = await findNames(storeId, f.quote, f.receivedOn);
    await db
      .update(s.guestFeedback)
      .set({
        matches,
        memberIds: matches.map((m) => m.memberId),
        memberNames: matches.map((m) => m.name),
        tagSource: matches.length ? "auto" : null,
        taggedAt: matches.length ? new Date() : null,
      })
      .where(eq(s.guestFeedback.id, f.id));
    if (matches.length) n++;
  }
  return n;
}

export type SurveyStats = { stars: number | null; rated: number; count: number; month: number };

/** A colleague's guest star rating: the average stars of every review tagged to them in the last year. */
export function surveyStats(rows: Pick<Feedback, "memberIds" | "rating" | "receivedOn">[], memberId: string, today: string): SurveyStats {
  const from = addDays(today, -365);
  const mine = rows.filter((f) => f.receivedOn >= from && f.memberIds.includes(memberId));
  const rated = mine.filter((f) => f.rating != null);
  return {
    stars: rated.length ? Math.round((rated.reduce((a, f) => a + f.rating!, 0) / rated.length) * 10) / 10 : null,
    rated: rated.length,
    count: mine.length,
    month: mine.filter((f) => f.receivedOn.slice(0, 7) === today.slice(0, 7)).length,
  };
}
