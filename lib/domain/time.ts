import { WEEKDAYS, type Weekday } from "./types";

/** India Standard Time has a fixed +05:30 offset and no daylight saving. */
export const IST_OFFSET_MS = 330 * 60_000;
export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 1440;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Epoch ms of 00:00 IST on the given `YYYY-MM-DD`. */
export function istMidnight(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS;
}

/** IST calendar date (`YYYY-MM-DD`) containing the given instant. */
export function istDateOf(instant: number): string {
  return new Date(instant + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return istDateOf(istMidnight(date) + days * DAY_MINUTES * MINUTE_MS + 12 * 3600_000);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[new Date(istMidnight(date) + IST_OFFSET_MS).getUTCDay()];
}

/** "HH:MM" → minutes after midnight, or null when malformed. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = HHMM_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Converts a timetable offset (minutes from origin-day midnight) to an instant. */
export function offsetToInstant(journeyDate: string, offsetMinutes: number): number {
  return istMidnight(journeyDate) + offsetMinutes * MINUTE_MS;
}

export function minutesBetween(from: number, to: number): number {
  return Math.round((to - from) / MINUTE_MS);
}

/** Minutes of day (0..1439) for a timetable offset. */
export function minuteOfDay(offset: number): number {
  return ((offset % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** 1-based journey day for a timetable offset. */
export function journeyDay(offset: number): number {
  return Math.floor(offset / DAY_MINUTES) + 1;
}

export function formatOffset(offset: number | null): string {
  if (offset == null) return "—";
  const mod = minuteOfDay(offset);
  return `${String(Math.floor(mod / 60)).padStart(2, "0")}:${String(mod % 60).padStart(2, "0")}`;
}
