import { RailDataError } from "./errors";
import { isValidDateString } from "./time";
import type { ScheduleStop, TrainSchedule } from "./types";

const TRAIN_NUMBER_RE = /^\d{4,5}$/;
const STATION_CODE_RE = /^[A-Z]{1,10}$/;

export function parseTrainNumber(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!TRAIN_NUMBER_RE.test(value)) {
    throw new RailDataError("invalid_request", "Train number must be 4–5 digits.");
  }
  return value;
}

export function parseStationCode(raw: unknown, field = "Station code"): string {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!STATION_CODE_RE.test(value)) {
    throw new RailDataError("invalid_request", `${field} must be 1–10 letters.`);
  }
  return value;
}

export function parseDate(raw: unknown, fallback: string): string {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string" || !isValidDateString(raw)) {
    throw new RailDataError("invalid_request", "Date must be YYYY-MM-DD.");
  }
  return raw;
}

export function parseIntInRange(raw: unknown, fallback: number, min: number, max: number, field: string): number {
  if (raw == null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new RailDataError("invalid_request", `${field} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

export function parseSearchQuery(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length < 2) throw new RailDataError("invalid_request", "Enter at least 2 characters to search.");
  if (value.length > 60) throw new RailDataError("invalid_request", "Search text is too long.");
  return value;
}

export interface ScheduleIssue {
  sequence: number;
  stationCode: string;
  problem: string;
}

/**
 * Validates a provider timetable. Stops with impossible times (time running
 * backwards, departure before arrival) are reported and removed from the
 * halting set so the planner never boards or alights there. If the timetable
 * is unusable as a whole an error is thrown.
 */
export function validateSchedule(schedule: TrainSchedule): { schedule: TrainSchedule; issues: ScheduleIssue[] } {
  const issues: ScheduleIssue[] = [];
  if (!schedule.number || !schedule.stops?.length) {
    throw new RailDataError("bad_upstream_response", `Timetable for train ${schedule.number || "?"} has no stops.`);
  }
  const stops = [...schedule.stops].sort((a, b) => a.sequence - b.sequence);
  const cleaned: ScheduleStop[] = [];
  let lastTime = -Infinity;

  for (const stop of stops) {
    const problems: string[] = [];
    if (!stop.stationCode) problems.push("missing station code");
    const { arrival, departure } = stop;
    const first = arrival ?? departure;
    if (first != null && first < lastTime) problems.push("time earlier than previous stop");
    if (arrival != null && departure != null && departure < arrival) problems.push("departure before arrival");
    if (arrival == null && departure == null) problems.push("no arrival or departure time");

    if (problems.length) {
      issues.push({ sequence: stop.sequence, stationCode: stop.stationCode, problem: problems.join(", ") });
      if (!stop.stationCode) continue;
      // Keep it in the stop list for display, but never use it for planning.
      cleaned.push({ ...stop, isHalt: false });
      continue;
    }
    lastTime = departure ?? arrival ?? lastTime;
    cleaned.push(stop);
  }

  const usable = cleaned.filter((s) => s.isHalt).length;
  if (usable < 2) {
    throw new RailDataError(
      "bad_upstream_response",
      `Timetable for train ${schedule.number} has fewer than two valid halts.`,
    );
  }
  return { schedule: { ...schedule, stops: cleaned }, issues };
}
