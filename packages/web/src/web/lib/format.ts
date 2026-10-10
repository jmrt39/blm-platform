export const money = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });
export const money2 = (n: number) => money(n, 2);
export const num = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number | null | undefined, d = 0) => (n == null ? "·" : `${(n * 100).toFixed(d)}%`);

export function timeOf(d: Date | string | number | null | undefined, tz = "America/New_York") {
  if (!d) return "";
  return new Date(d)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .replace(" AM", " am")
    .replace(" PM", " pm");
}

export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function shortDay(date: string) {
  return dayLabel(date, { weekday: "short", month: "short", day: "numeric" });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong.";
}
