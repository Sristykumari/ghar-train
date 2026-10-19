import { RailDataError } from "@/lib/domain/errors";
import { haversineKm } from "@/lib/domain/geo";
import { addDays, istDateOf, offsetToInstant, weekdayOf, MINUTE_MS } from "@/lib/domain/time";
import type {
  CoachPosition,
  LiveBoardEntry,
  LiveTrainStatus,
  ProviderInfo,
  Station,
  StationLayout,
  StationLiveBoard,
  StationScheduleEntry,
  StationSummary,
  TrainBetween,
  TrainSchedule,
  TrainSummary,
} from "@/lib/domain/types";
import type { ProviderExamples, RailDataProvider } from "../types";
import { simulateLiveStatus, type SimulationProfile } from "./simulator";

/**
 * A dataset for the in-memory provider. Used for the development sample
 * network and for deterministic test fixtures. Never production data.
 */
export interface InMemoryDataset {
  label: string;
  stations: Station[];
  trains: TrainSchedule[];
  layouts?: StationLayout[];
  /**
   * Simulation profile per train number and journey date. Return `null` to
   * model "no live data available" for that run.
   */
  liveProfile?: (trainNumber: string, journeyDate: string) => SimulationProfile | null;
  /** Coach order (engine end first) for a train. Sample data only. */
  coaches?: (train: TrainSchedule) => string[] | null;
  /** Suggested trains/stations to try, given the current time. */
  examples?: (now: number) => { trains: string[]; stations: string[] };
}

export interface InMemoryProviderOptions {
  now?: () => number;
  /** When false the provider behaves like a timetable-only source (no live status at all). */
  live?: boolean;
}

export class InMemoryProvider implements RailDataProvider {
  readonly info: ProviderInfo;
  private readonly stationsByCode: Map<string, Station>;
  private readonly trainsByNumber: Map<string, TrainSchedule>;
  private readonly now: () => number;
  private readonly live: boolean;

  constructor(
    private readonly dataset: InMemoryDataset,
    opts: InMemoryProviderOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.live = opts.live ?? true;
    this.stationsByCode = new Map(dataset.stations.map((s) => [s.code, s]));
    this.trainsByNumber = new Map(dataset.trains.map((t) => [t.number, t]));
    this.info = {
      id: "sample",
      name: dataset.label,
      isSample: true,
      capabilities: {
        liveStatus: this.live,
        liveStationBoard: this.live,
        livePlatforms: this.live,
        trainPositions: this.live,
        stationLayouts: (dataset.layouts?.length ?? 0) > 0,
        nearbyStations: dataset.stations.some((s) => s.coordinates),
        trainsBetween: true,
        coachPositions: !!dataset.coaches,
      },
      notes: [
        "Demo data: real station names, invented trains. Times, platforms and positions are not real.",
        ...(this.live ? ["Live running status is simulated from the sample timetable."] : []),
      ],
    };
  }

  async searchStations(query: string, limit: number): Promise<StationSummary[]> {
    const q = query.toLowerCase();
    return this.dataset.stations
      .map((s) => {
        const code = s.code.toLowerCase();
        const name = s.name.toLowerCase();
        const score = code === q ? 0 : code.startsWith(q) ? 1 : name.startsWith(q) ? 2 : name.includes(q) ? 3 : -1;
        return { s, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name))
      .slice(0, limit)
      .map(({ s }) => ({ code: s.code, name: s.name, city: s.city ?? null }));
  }

  async searchTrains(query: string, limit: number): Promise<TrainSummary[]> {
    const q = query.toLowerCase();
    return this.dataset.trains
      .filter((t) => t.number.startsWith(q) || t.name.toLowerCase().includes(q))
      .slice(0, limit)
      .map((t) => ({ number: t.number, name: t.name, sourceCode: t.sourceCode, destinationCode: t.destinationCode }));
  }

  async getStation(code: string): Promise<Station | null> {
    return this.stationsByCode.get(code) ?? null;
  }

  async getTrainSchedule(trainNumber: string): Promise<TrainSchedule | null> {
    return this.trainsByNumber.get(trainNumber) ?? null;
  }

  async getLiveStatus(trainNumber: string, journeyDate: string): Promise<LiveTrainStatus | null> {
    if (!this.live) return null;
    const schedule = this.trainsByNumber.get(trainNumber);
    if (!schedule) return null;
    if (!schedule.runDays.includes(weekdayOf(journeyDate))) return null;
    const profile = this.dataset.liveProfile?.(trainNumber, journeyDate) ?? null;
    if (!profile) return null;
    return simulateLiveStatus(schedule, journeyDate, profile, this.now());
  }

  async getStationSchedule(stationCode: string): Promise<StationScheduleEntry[]> {
    const out: StationScheduleEntry[] = [];
    for (const t of this.dataset.trains) {
      const stop = t.stops.find((s) => s.stationCode === stationCode);
      if (!stop) continue;
      out.push({
        trainNumber: t.number,
        trainName: t.name,
        sourceCode: t.sourceCode,
        destinationCode: t.destinationCode,
        runDays: t.runDays,
        arrival: stop.arrival,
        departure: stop.departure,
        isHalt: stop.isHalt,
        scheduledPlatform: stop.scheduledPlatform ?? null,
      });
    }
    return out;
  }

  async getStationLiveBoard(stationCode: string, hours: number): Promise<StationLiveBoard | null> {
    if (!this.live) return null;
    const now = this.now();
    const windowEnd = now + hours * 60 * MINUTE_MS;
    const windowStart = now - 60 * MINUTE_MS;
    const today = istDateOf(now);
    const entries: LiveBoardEntry[] = [];

    for (const t of this.dataset.trains) {
      const idx = t.stops.findIndex((s) => s.stationCode === stationCode && s.isHalt);
      if (idx === -1) continue;
      for (let back = 3; back >= -1; back--) {
        const date = addDays(today, -back);
        if (!t.runDays.includes(weekdayOf(date))) continue;
        const stop = t.stops[idx];
        const schedAt = offsetToInstant(date, (stop.arrival ?? stop.departure)!);
        if (schedAt < windowStart - 6 * 3600_000 || schedAt > windowEnd) continue;
        const status = await this.getLiveStatus(t.number, date);
        if (!status) continue;
        const ls = status.stops[idx];
        const at = ls.expectedArrival ?? ls.expectedDeparture!;
        const leave = ls.expectedDeparture ?? ls.expectedArrival!;
        if (leave < windowStart || at > windowEnd) continue;
        entries.push({
          trainNumber: t.number,
          trainName: t.name,
          journeyDate: date,
          state: ls.status === "departed" ? "departed" : ls.status === "arrived" ? "at_station" : "upcoming",
          expectedArrival: ls.expectedArrival,
          expectedDeparture: ls.expectedDeparture,
          delayMinutes: ls.delayArrivalMinutes ?? ls.delayDepartureMinutes,
          livePlatform: ls.livePlatform ?? null,
        });
      }
    }
    return { stationCode, source: "simulated", fetchedAt: now, entries };
  }

  async getTrainsBetween(from: string, to: string): Promise<TrainBetween[]> {
    const out: TrainBetween[] = [];
    for (const t of this.dataset.trains) {
      const fi = t.stops.findIndex((s) => s.stationCode === from && s.isHalt && s.departure != null);
      if (fi === -1) continue;
      const ti = t.stops.findIndex((s, i) => i > fi && s.stationCode === to && s.isHalt && s.arrival != null);
      if (ti === -1) continue;
      const a = t.stops[fi];
      const b = t.stops[ti];
      out.push({
        trainNumber: t.number,
        trainName: t.name,
        type: t.type ?? null,
        runDays: t.runDays,
        fromCode: a.stationCode,
        fromName: a.stationName,
        toCode: b.stationCode,
        toName: b.stationName,
        departure: a.departure!,
        arrival: b.arrival!,
        distanceKm: a.distanceKm != null && b.distanceKm != null ? b.distanceKm - a.distanceKm : null,
        haltsBetween: t.stops.slice(fi + 1, ti).filter((s) => s.isHalt).length,
      });
    }
    return out;
  }

  async getCoachPosition(trainNumber: string, stationCode: string): Promise<CoachPosition | null> {
    const t = this.trainsByNumber.get(trainNumber);
    const stop = t?.stops.find((s) => s.stationCode === stationCode && s.isHalt);
    const codes = t && stop ? this.dataset.coaches?.(t) : null;
    if (!t || !stop || !codes?.length) return null;
    return {
      trainNumber,
      stationCode,
      platform: stop.scheduledPlatform ?? null,
      coaches: codes.map((code, i) => ({ position: i + 1, code, classType: null, name: null })),
      source: "simulated",
    };
  }

  async getExamples(): Promise<ProviderExamples> {
    const ex = this.dataset.examples?.(this.now()) ?? (await this.runningExamples());
    return {
      trains: ex.trains.flatMap((n) => {
        const t = this.trainsByNumber.get(n);
        return t ? [{ number: t.number, name: t.name, sourceCode: t.sourceCode, destinationCode: t.destinationCode }] : [];
      }),
      stations: ex.stations.flatMap((c) => {
        const s = this.stationsByCode.get(c);
        return s ? [{ code: s.code, name: s.name, city: s.city ?? null }] : [];
      }),
    };
  }

  /** Trains running right now (different names for variety) and stations worth opening. */
  private async runningExamples(): Promise<{ trains: string[]; stations: string[] }> {
    const now = this.now();
    const today = istDateOf(now);
    const picked: string[] = [];
    const names = new Set<string>();
    const ends = new Set<string>();
    for (const t of this.dataset.trains) {
      if (picked.length >= 3) break;
      // Prefer variety: different train names and different end stations.
      if (names.has(t.name) || ends.has(t.sourceCode) || ends.has(t.destinationCode)) continue;
      for (const date of [today, addDays(today, -1)]) {
        const live = await this.getLiveStatus(t.number, date);
        if (live?.runningState === "running") {
          picked.push(t.number);
          names.add(t.name);
          ends.add(t.sourceCode).add(t.destinationCode);
          break;
        }
      }
    }
    const busy = new Map<string, number>();
    for (const t of this.dataset.trains) for (const s of t.stops) if (s.isHalt) busy.set(s.stationCode, (busy.get(s.stationCode) ?? 0) + 1);
    const layoutCodes = (this.dataset.layouts ?? []).map((l) => l.stationCode);
    const busiest = [...busy.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => !layoutCodes.includes(c));
    return { trains: picked, stations: [...layoutCodes.slice(0, 1), ...busiest.slice(0, 2)] };
  }

  async getStationLayout(stationCode: string): Promise<StationLayout | null> {
    return this.dataset.layouts?.find((l) => l.stationCode === stationCode) ?? null;
  }

  async getNearbyStations(lat: number, lng: number, radiusKm: number, limit: number) {
    if (!this.info.capabilities.nearbyStations) {
      throw new RailDataError("unsupported", "This data source has no station coordinates.");
    }
    return this.dataset.stations
      .filter((s) => s.coordinates)
      .map((s) => ({ ...s, distanceKm: Math.round(haversineKm({ lat, lng }, s.coordinates!) * 10) / 10 }))
      .filter((s) => s.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }
}
