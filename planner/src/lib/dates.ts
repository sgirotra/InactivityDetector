// Eastern-time clock plus pure calendar math on "YYYY-MM-DD" strings.
// Calendar arithmetic runs in UTC on purpose: a date string names a day, not an
// instant, so DST and the host timezone can never shift it.

export const TZ = "America/New_York";
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface EasternClock {
  /** today's Eastern calendar date */
  date: string;
  /** minutes since Eastern midnight */
  minutes: number;
  hour: number;
  weekday: number;
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function easternClock(now: Date = new Date()): EasternClock {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, hour, minutes: hour * 60 + Number(parts.minute), weekday: weekdayOf(date) };
}

export function todayET(now: Date = new Date()): string {
  return easternClock(now).date;
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(utc(s)) === s;
}

export function makeISO(y: number, m: number, d: number): string | null {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isISODate(iso) ? iso : null;
}

export function addDays(iso: string, n: number): string {
  return fromUtc(utc(iso) + n * 86400000);
}

/** b - a in whole days (positive when b is later) */
export function dayDiff(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

export function weekdayOf(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

export function parseISOParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "18:30" -> "6:30p", "09:00" -> "9a" */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hs, m] = t.split(":");
  let h = Number(hs);
  const ap = h >= 12 ? "p" : "a";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}${m === "00" ? "" : ":" + m}${ap}`;
}

/** "2026-10-23" -> "Oct 23" */
export function fmtShort(iso: string): string {
  const { m, d } = parseISOParts(iso);
  return `${MON[m - 1]} ${d}`;
}

/** "2026-10-23" -> "Fri, Oct 23" */
export function fmtDay(iso: string): string {
  return `${DOW[weekdayOf(iso)]}, ${fmtShort(iso)}`;
}
