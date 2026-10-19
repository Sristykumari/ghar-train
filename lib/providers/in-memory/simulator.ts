import { MINUTE_MS, offsetToInstant } from "@/lib/domain/time";
import type { LiveStop, LiveTrainStatus, RunningState, TrainPosition, TrainSchedule } from "@/lib/domain/types";

/**
 * DEVELOPMENT / TEST ONLY.
 *
 * Produces a running status from a timetable plus a fixed delay so the UI and
 * planner can be exercised without a live feed. Every status it returns has
 * `source: "simulated"`, and positions are marked `isActual: false`. Nothing
 * here should ever be shown to a passenger as real.
 */
export interface SimulationProfile {
  delayMinutes: number;
  /** How long ago the simulated "last update" happened. Use > stale threshold to test stale handling. */
  updateLagMinutes: number;
  /** Platform the simulated live feed reports, per station code. */
  livePlatforms?: Record<string, string>;
  notices?: string[];
}

export function simulateLiveStatus(
  schedule: TrainSchedule,
  journeyDate: string,
  profile: SimulationProfile,
  now: number,
): LiveTrainStatus {
  const delayMs = profile.delayMinutes * MINUTE_MS;
  const stops: LiveStop[] = schedule.stops.map((s) => {
    const schedArr = s.arrival == null ? null : offsetToInstant(journeyDate, s.arrival);
    const schedDep = s.departure == null ? null : offsetToInstant(journeyDate, s.departure);
    const expArr = schedArr == null ? null : schedArr + delayMs;
    const expDep = schedDep == null ? null : schedDep + delayMs;
    const arrived = expArr != null ? expArr <= now : expDep != null && expDep <= now;
    const departed = expDep != null ? expDep <= now : false;
    const status: LiveStop["status"] = departed ? "departed" : arrived ? "arrived" : "upcoming";
    return {
      stationCode: s.stationCode,
      expectedArrival: expArr,
      expectedDeparture: expDep,
      actualArrival: arrived ? expArr : null,
      actualDeparture: departed ? expDep : null,
      delayArrivalMinutes: expArr == null ? null : profile.delayMinutes,
      delayDepartureMinutes: expDep == null ? null : profile.delayMinutes,
      status,
      livePlatform: s.isHalt ? (profile.livePlatforms?.[s.stationCode] ?? null) : null,
    };
  });

  let lastReached = -1;
  stops.forEach((s, i) => {
    if (s.status !== "upcoming") lastReached = i;
  });

  let runningState: RunningState;
  if (lastReached === -1) runningState = "not_started";
  else if (lastReached === stops.length - 1) runningState = "completed";
  else if (stops[lastReached].status === "arrived" && schedule.stops[lastReached].isHalt) runningState = "at_station";
  else runningState = "running";

  let segmentProgress: number | null = null;
  let speedKmh: number | null = runningState === "at_station" ? 0 : null;
  let position: TrainPosition | null = null;
  if (runningState === "running") {
    const from = stops[lastReached];
    const to = stops[lastReached + 1];
    const start = from.actualDeparture ?? from.actualArrival;
    const end = to.expectedArrival ?? to.expectedDeparture;
    if (start != null && end != null && end > start) {
      segmentProgress = Math.min(1, Math.max(0, (now - start) / (end - start)));
      const km = (schedule.stops[lastReached + 1].distanceKm ?? 0) - (schedule.stops[lastReached].distanceKm ?? 0);
      if (km > 0) speedKmh = Math.round(km / ((end - start) / 3600_000));
      const a = schedule.stops[lastReached].coordinates;
      const b = schedule.stops[lastReached + 1].coordinates;
      if (a && b) {
        position = {
          lat: a.lat + (b.lat - a.lat) * segmentProgress,
          lng: a.lng + (b.lng - a.lng) * segmentProgress,
          isActual: false,
        };
      }
    }
  } else if (lastReached >= 0) {
    const c = schedule.stops[lastReached].coordinates;
    if (c) position = { ...c, isActual: false };
  }

  return {
    trainNumber: schedule.number,
    journeyDate,
    source: "simulated",
    lastUpdatedAt: now - profile.updateLagMinutes * MINUTE_MS,
    runningState,
    currentStationCode: lastReached >= 0 ? stops[lastReached].stationCode : null,
    segmentProgress,
    delayMinutes: runningState === "not_started" ? null : profile.delayMinutes,
    stops,
    position,
    speedKmh,
    notices: profile.notices ?? [],
  };
}
