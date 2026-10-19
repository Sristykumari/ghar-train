import { RailDataError } from "@/lib/domain/errors";
import { addDays, istDateOf, journeyDay, offsetToInstant, weekdayOf } from "@/lib/domain/time";
import type { DataQuality, LiveStop, LiveTrainStatus, TrainSchedule } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validation";
import type { RailDataProvider } from "@/lib/providers/types";
import { assessFreshness, projectedQuality, toIssue } from "./freshness";
import type { Movement, PlatformInfo, Punctuality, StopView, TrainStatusView, UpstreamIssue } from "./views";

/** Delay (minutes) up to which a train is still called "on time". */
export const ON_TIME_TOLERANCE_MINUTES = 5;
/** A running train is "approaching" its next halt within this many minutes. */
export const APPROACH_WINDOW_MINUTES = 10;

/**
 * Picks the run of the train most likely meant when no date is given: the
 * most recent run that is currently between departure and arrival (with some
 * slack), otherwise today.
 */
export function defaultJourneyDate(schedule: TrainSchedule, now: number): string {
  const today = istDateOf(now);
  const first = schedule.stops[0]?.departure ?? 0;
  const last = schedule.stops[schedule.stops.length - 1]?.arrival ?? first;
  for (let back = 0; back <= 3; back++) {
    const date = addDays(today, -back);
    if (!schedule.runDays.includes(weekdayOf(date))) continue;
    const start = offsetToInstant(date, first);
    const end = offsetToInstant(date, last) + 3 * 3600_000;
    if (start <= now + 2 * 3600_000 && end >= now) return date;
  }
  return today;
}

/** Aligns live stops to timetable stops by station code, preserving order. */
export function alignLiveStops(schedule: TrainSchedule, live: LiveTrainStatus | null): (LiveStop | null)[] {
  if (!live) return schedule.stops.map(() => null);
  let cursor = 0;
  return schedule.stops.map((s) => {
    for (let i = cursor; i < live.stops.length; i++) {
      if (live.stops[i].stationCode === s.stationCode) {
        cursor = i + 1;
        return live.stops[i];
      }
    }
    return null;
  });
}

function pickPlatform(live: LiveStop | null, scheduled: string | null | undefined, base: DataQuality): PlatformInfo | null {
  if (live?.livePlatform) return { value: live.livePlatform, quality: base === "simulated" ? "simulated" : "live" };
  if (scheduled) return { value: scheduled, quality: "scheduled" };
  return null;
}

export function classifyPunctuality(delay: number | null): Punctuality {
  if (delay == null) return "unknown";
  if (delay < -ON_TIME_TOLERANCE_MINUTES) return "early";
  if (delay <= ON_TIME_TOLERANCE_MINUTES) return "on_time";
  return "delayed";
}

export interface TrainStatusInput {
  trainNumber: string;
  journeyDate?: string;
  now: number;
  staleAfterMinutes: number;
}

export async function getTrainStatus(provider: RailDataProvider, input: TrainStatusInput): Promise<TrainStatusView> {
  const raw = await provider.getTrainSchedule(input.trainNumber);
  if (!raw) throw new RailDataError("not_found", `Train ${input.trainNumber} was not found.`);
  const { schedule } = validateSchedule(raw);
  const journeyDate = input.journeyDate ?? defaultJourneyDate(schedule, input.now);
  const runsOnDate = schedule.runDays.includes(weekdayOf(journeyDate));

  let live: LiveTrainStatus | null = null;
  let liveIssue: UpstreamIssue | null = null;
  if (runsOnDate && provider.info.capabilities.liveStatus) {
    try {
      live = await provider.getLiveStatus(schedule.number, journeyDate);
    } catch (e) {
      liveIssue = toIssue(e);
    }
  }

  return buildTrainStatusView(schedule, journeyDate, runsOnDate, live, liveIssue, input.now, input.staleAfterMinutes, await stationNames(provider, schedule));
}

async function stationNames(provider: RailDataProvider, schedule: TrainSchedule) {
  const byStop = new Map(schedule.stops.map((s) => [s.stationCode, s.stationName]));
  const name = async (code: string) => byStop.get(code) ?? (await provider.getStation(code).catch(() => null))?.name ?? code;
  return { source: await name(schedule.sourceCode), destination: await name(schedule.destinationCode) };
}

/** Pure assembly of the status view; separated for testing. */
export function buildTrainStatusView(
  schedule: TrainSchedule,
  journeyDate: string,
  runsOnDate: boolean,
  live: LiveTrainStatus | null,
  liveIssue: UpstreamIssue | null,
  now: number,
  staleAfterMinutes: number,
  names: { source: string; destination: string },
): TrainStatusView {
  const freshness = assessFreshness(live?.source ?? null, live?.lastUpdatedAt ?? null, now, staleAfterMinutes);
  const base = freshness.quality;
  const aligned = alignLiveStops(schedule, live);
  const currentIdx = live?.currentStationCode
    ? schedule.stops.findIndex((s, i) => s.stationCode === live.currentStationCode && aligned[i] != null)
    : -1;

  const stops: StopView[] = schedule.stops.map((s, i) => {
    const ls = aligned[i];
    const schedArr = s.arrival == null ? null : offsetToInstant(journeyDate, s.arrival);
    const schedDep = s.departure == null ? null : offsetToInstant(journeyDate, s.departure);
    const reached = ls != null && (ls.status === "departed" || ls.status === "arrived");
    const timeQuality: DataQuality = !ls ? "scheduled" : reached ? base : projectedQuality(base);
    return {
      sequence: s.sequence,
      stationCode: s.stationCode,
      stationName: s.stationName,
      isHalt: s.isHalt,
      distanceKm: s.distanceKm ?? null,
      day: journeyDay(s.arrival ?? s.departure ?? 0),
      scheduledArrival: schedArr,
      scheduledDeparture: schedDep,
      expectedArrival: ls ? (ls.actualArrival ?? ls.expectedArrival) : schedArr,
      expectedDeparture: ls ? (ls.actualDeparture ?? ls.expectedDeparture) : schedDep,
      delayMinutes: ls ? (ls.delayArrivalMinutes ?? ls.delayDepartureMinutes) : null,
      timeQuality,
      progress: !ls
        ? "unknown"
        : ls.status === "skipped"
          ? "skipped"
          : ls.status === "departed"
            ? "departed"
            : ls.status === "arrived"
              ? i === schedule.stops.length - 1 || s.isHalt
                ? "at_station"
                : "departed"
              : "upcoming",
      platform: s.isHalt ? pickPlatform(ls, s.scheduledPlatform, base) : null,
      coordinates: s.coordinates ?? null,
    };
  });

  // Mark the next halt the train has not reached yet.
  let nextStop: StopView | null = null;
  if (live && live.runningState !== "completed" && live.runningState !== "cancelled") {
    const from = currentIdx >= 0 ? currentIdx + 1 : 0;
    const idx = stops.findIndex((s, i) => i >= from && s.isHalt && s.progress === "upcoming");
    if (idx >= 0) {
      stops[idx] = { ...stops[idx], progress: "next" };
      nextStop = stops[idx];
    }
  }

  const delay = live?.delayMinutes ?? null;
  const current = currentIdx >= 0 ? stops[currentIdx] : null;
  const movement = deriveMovement(live, current, nextStop, now);
  const currentLocation = describeLocation(live, current, stops, currentIdx, schedule, journeyDate, runsOnDate);

  return {
    train: {
      number: schedule.number,
      name: schedule.name,
      type: schedule.type ?? null,
      sourceCode: schedule.sourceCode,
      sourceName: names.source,
      destinationCode: schedule.destinationCode,
      destinationName: names.destination,
      runDays: schedule.runDays,
    },
    journeyDate,
    runsOnDate,
    freshness,
    runningState: live?.runningState ?? "unknown",
    movement,
    punctuality: live ? classifyPunctuality(delay) : "unknown",
    delayMinutes: delay,
    currentLocation,
    currentStationCode: live?.currentStationCode ?? null,
    nextStop,
    stops,
    position: live?.position ? { ...live.position, quality: live.position.isActual ? base : projectedQuality(base) } : null,
    speed: live?.speedKmh != null && live.runningState === "running" ? { kmh: live.speedKmh, quality: base } : null,
    notices: live?.notices ?? [],
    liveIssue,
    generatedAt: now,
  };
}

function deriveMovement(live: LiveTrainStatus | null, current: StopView | null, next: StopView | null, now: number): Movement {
  if (!live) return "unknown";
  switch (live.runningState) {
    case "not_started":
      return "not_started";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "at_station":
      return "arrived";
  }
  if (next?.expectedArrival != null && next.expectedArrival - now <= APPROACH_WINDOW_MINUTES * 60_000) return "approaching";
  if (current) return "departed";
  return "unknown";
}

function describeLocation(
  live: LiveTrainStatus | null,
  current: StopView | null,
  stops: StopView[],
  currentIdx: number,
  schedule: TrainSchedule,
  journeyDate: string,
  runsOnDate: boolean,
): string {
  if (!runsOnDate) return `Does not run on ${journeyDate}.`;
  if (!live) return "Current location unavailable — no live running data.";
  switch (live.runningState) {
    case "not_started":
      return `Not started yet from ${schedule.stops[0].stationName}.`;
    case "completed":
      return `Reached ${schedule.stops[schedule.stops.length - 1].stationName}.`;
    case "cancelled":
      return "Cancelled for this date.";
  }
  if (!current) return "Location not reported.";
  if (live.runningState === "at_station") return `At ${current.stationName}.`;
  const next = stops[currentIdx + 1];
  return next ? `Between ${current.stationName} and ${next.stationName}.` : `Near ${current.stationName}.`;
}
