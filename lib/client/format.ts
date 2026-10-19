import type { DataQuality } from "@/lib/domain/types";

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

/** "14:05" in IST. */
export function formatTime(ms: number | null | undefined): string {
  return ms == null ? "—" : timeFmt.format(ms);
}

/** "16 Oct" in IST. */
export function formatDate(ms: number): string {
  return dateFmt.format(ms);
}

export function formatJourneyDate(date: string): string {
  return dayFmt.format(Date.parse(`${date}T12:00:00+05:30`));
}

/** "2h 05m", "45 min". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${sign}${m} min`;
  return `${sign}${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatDelay(minutes: number | null | undefined): string {
  if (minutes == null) return "Delay unknown";
  if (minutes === 0) return "On time";
  if (minutes < 0) return `${formatDuration(-minutes)} early`;
  return `${formatDuration(minutes)} late`;
}

/** "in 12 min", "now", "8 min ago" — how far away a time is, in words. */
export function formatCountdown(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return "";
  const min = Math.round((ms - now) / 60_000);
  if (min === 0) return "now";
  if (min > 0) return `in ${formatDuration(min)}`;
  return `${formatDuration(-min)} ago`;
}

export function formatAgo(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "unknown";
  const min = Math.round((now - ms) / 60_000);
  if (min <= 0) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${formatDuration(min)} ago`;
}

export const QUALITY_LABEL: Record<DataQuality, string> = {
  live: "Live",
  estimated: "Estimated",
  scheduled: "Scheduled",
  simulated: "Simulated",
  unavailable: "Unavailable",
};

export const QUALITY_HELP: Record<DataQuality, string> = {
  live: "Reported by the live running-status feed.",
  estimated: "Calculated from live data (for example a delay carried forward) or live data that may be outdated.",
  scheduled: "From the published timetable. No live confirmation.",
  simulated: "Generated sample data for development. Not real.",
  unavailable: "No data available.",
};
