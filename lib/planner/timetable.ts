import { addDays, istDateOf, offsetToInstant, weekdayOf } from "@/lib/domain/time";
import type { LiveTrainStatus, TrainSchedule } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validation";
import type { RailDataProvider } from "@/lib/providers/types";
import { assessFreshness } from "@/lib/services/freshness";
import { alignLiveStops } from "@/lib/services/train-status";
import type { Trip } from "./types";

/** Instantiates a dated run of a train from its timetable. */
export function tripFromSchedule(schedule: TrainSchedule, journeyDate: string): Trip {
  return {
    id: `${schedule.number}:${journeyDate}`,
    trainNumber: schedule.number,
    trainName: schedule.name,
    journeyDate,
    quality: "scheduled",
    delayMinutes: null,
    lastUpdatedAt: null,
    stops: schedule.stops.map((s) => {
      const arr = s.arrival == null ? null : offsetToInstant(journeyDate, s.arrival);
      const dep = s.departure == null ? null : offsetToInstant(journeyDate, s.departure);
      return {
        stationCode: s.stationCode,
        stationName: s.stationName,
        arrival: arr,
        departure: dep,
        scheduledArrival: arr,
        scheduledDeparture: dep,
        isHalt: s.isHalt,
        platform: s.scheduledPlatform ? { value: s.scheduledPlatform, quality: "scheduled" } : null,
        departed: false,
      };
    }),
  };
}

/**
 * Replaces scheduled times with live/expected times. Stops the live feed
 * does not cover keep their timetable values, shifted by the overall delay
 * when one is known (marked as estimated).
 */
export function applyLive(
  trip: Trip,
  schedule: TrainSchedule,
  live: LiveTrainStatus,
  now: number,
  staleAfterMinutes: number,
): Trip {
  const freshness = assessFreshness(live.source, live.lastUpdatedAt, now, staleAfterMinutes);
  const aligned = alignLiveStops(schedule, live);
  const fallbackShift = (live.delayMinutes ?? 0) * 60_000;
  return {
    ...trip,
    quality: freshness.quality,
    delayMinutes: live.delayMinutes,
    lastUpdatedAt: live.lastUpdatedAt,
    stops: trip.stops.map((s, i) => {
      const ls = aligned[i];
      if (!ls) {
        return {
          ...s,
          arrival: s.arrival == null ? null : s.arrival + fallbackShift,
          departure: s.departure == null ? null : s.departure + fallbackShift,
        };
      }
      return {
        ...s,
        arrival: ls.actualArrival ?? ls.expectedArrival ?? s.arrival,
        departure: ls.actualDeparture ?? ls.expectedDeparture ?? s.departure,
        departed: ls.status === "departed",
        platform: ls.livePlatform
          ? { value: ls.livePlatform, quality: freshness.quality === "simulated" ? "simulated" : freshness.stale ? "estimated" : "live" }
          : s.platform,
      };
    }),
  };
}

export interface TimetableSourceOptions {
  now: number;
  /** Only consider departures within this many hours from now. */
  horizonHours: number;
  /** Maximum station timetables fetched per planning request. */
  maxStationLookups: number;
}

/**
 * Lazily loads the parts of the timetable the planner explores, so a real
 * provider is only asked about stations the search actually reaches. A
 * budget caps upstream calls; when it is hit the result is flagged as
 * truncated rather than silently incomplete.
 */
export class TimetableSource {
  readonly trips = new Map<string, Trip>();
  readonly schedules = new Map<string, TrainSchedule>();
  readonly issues: string[] = [];
  stationLookups = 0;
  trainLookups = 0;
  truncated = false;
  private readonly departures = new Map<string, Promise<{ trip: Trip; boardIdx: number }[]>>();
  private readonly scheduleLoads = new Map<string, Promise<TrainSchedule | null>>();

  constructor(
    private readonly provider: RailDataProvider,
    private readonly opts: TimetableSourceOptions,
  ) {}

  async schedule(trainNumber: string): Promise<TrainSchedule | null> {
    let p = this.scheduleLoads.get(trainNumber);
    if (!p) {
      this.trainLookups++;
      p = this.provider
        .getTrainSchedule(trainNumber)
        .then((raw) => {
          if (!raw) return null;
          const { schedule, issues } = validateSchedule(raw);
          if (issues.length) {
            this.issues.push(`Train ${trainNumber}: timetable has ${issues.length} invalid stop(s); those stops are not used for changes.`);
          }
          this.schedules.set(trainNumber, schedule);
          return schedule;
        })
        .catch((e: unknown) => {
          this.issues.push(`Train ${trainNumber}: timetable unavailable (${e instanceof Error ? e.message : "error"}).`);
          return null;
        });
      this.scheduleLoads.set(trainNumber, p);
    }
    return p;
  }

  trip(schedule: TrainSchedule, journeyDate: string): Trip {
    const id = `${schedule.number}:${journeyDate}`;
    let t = this.trips.get(id);
    if (!t) {
      t = tripFromSchedule(schedule, journeyDate);
      this.trips.set(id, t);
    }
    return t;
  }

  /** Replace a trip (e.g. after applying live data). */
  setTrip(trip: Trip) {
    this.trips.set(trip.id, trip);
  }

  /** Dated runs departing `stationCode` at or after `earliest`, within the horizon. */
  departuresFrom(stationCode: string, earliest: number): Promise<{ trip: Trip; boardIdx: number }[]> {
    let p = this.departures.get(stationCode);
    if (!p) {
      if (this.stationLookups >= this.opts.maxStationLookups) {
        this.truncated = true;
        return Promise.resolve([]);
      }
      this.stationLookups++;
      p = this.loadDepartures(stationCode);
      this.departures.set(stationCode, p);
    }
    return p.then((list) =>
      list
        .map(({ trip, boardIdx }) => ({ trip: this.trips.get(trip.id) ?? trip, boardIdx }))
        .filter(({ trip, boardIdx }) => (trip.stops[boardIdx].departure ?? -Infinity) >= earliest),
    );
  }

  private async loadDepartures(stationCode: string) {
    const { now, horizonHours } = this.opts;
    const horizonEnd = now + horizonHours * 3600_000;
    const today = istDateOf(now);
    let entries;
    try {
      entries = await this.provider.getStationSchedule(stationCode);
    } catch (e) {
      this.issues.push(`Station ${stationCode}: timetable unavailable (${e instanceof Error ? e.message : "error"}).`);
      return [];
    }

    // Filter on the station timetable first so we only fetch full timetables for plausible trains.
    const wanted: { trainNumber: string; date: string }[] = [];
    for (const e of entries) {
      if (!e.isHalt || e.departure == null) continue;
      for (let back = 3; back >= -1; back--) {
        const date = addDays(today, -back);
        if (!e.runDays.includes(weekdayOf(date))) continue;
        const dep = offsetToInstant(date, e.departure);
        if (dep >= now - 3 * 3600_000 && dep <= horizonEnd) wanted.push({ trainNumber: e.trainNumber, date });
      }
    }

    const out: { trip: Trip; boardIdx: number }[] = [];
    for (const w of wanted) {
      const schedule = await this.schedule(w.trainNumber);
      if (!schedule) continue;
      const boardIdx = schedule.stops.findIndex((s) => s.stationCode === stationCode && s.isHalt);
      if (boardIdx === -1 || boardIdx === schedule.stops.length - 1) continue;
      out.push({ trip: this.trip(schedule, w.date), boardIdx });
    }
    return out;
  }
}
