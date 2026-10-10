// Store-local date helpers. Business day rolls over at 4am local.

function partsIn(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
  };
}

export function tzOffsetMs(tz: string, d: Date) {
  const p = partsIn(tz, d);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zoned(tz: string, date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const off = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - off);
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

export function businessDate(tz: string, now = new Date()) {
  const p = partsIn(tz, now);
  const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return p.h < 4 ? addDays(date, -1) : date;
}

export function dueAtFor(tz: string, type: "opening" | "closing", date: string, opening: string, closing: string) {
  if (type === "opening") return zoned(tz, date, opening);
  const [hh] = closing.split(":").map(Number);
  // Closing due times after midnight belong to the next calendar day.
  return zoned(tz, hh! < 12 ? addDays(date, 1) : date, closing);
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Opening and closing time stamps are only valid inside the checklist's window. */
export const OPENING_WINDOW = "06:00";
export const CLOSING_WINDOW = "21:00";
export function opensAtFor(tz: string, type: "opening" | "closing", date: string) {
  return zoned(tz, date, type === "opening" ? OPENING_WINDOW : CLOSING_WINDOW);
}
