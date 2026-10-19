import type {
  CoachPosition,
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

/**
 * Contract every railway data source implements. Add a new authorised source
 * by implementing this interface and registering it in `./index.ts`.
 *
 * Rules for implementers
 * - Return `null` when the source has no data for the request (e.g. no live
 *   status for a train that has not started). Throw `RailDataError` for
 *   failures (auth, rate limits, outages, malformed responses).
 * - Never fill gaps with guesses. Leave platform, position or live fields
 *   empty when the upstream does not supply them.
 */
export interface RailDataProvider {
  readonly info: ProviderInfo;

  searchStations(query: string, limit: number): Promise<StationSummary[]>;
  searchTrains(query: string, limit: number): Promise<TrainSummary[]>;
  getStation(code: string): Promise<Station | null>;

  getTrainSchedule(trainNumber: string): Promise<TrainSchedule | null>;
  getLiveStatus(trainNumber: string, journeyDate: string): Promise<LiveTrainStatus | null>;

  /** Trains scheduled to halt at (or pass) the station. */
  getStationSchedule(stationCode: string): Promise<StationScheduleEntry[]>;
  /** Live board for the next `hours`. `null` when unsupported or unavailable. */
  getStationLiveBoard(stationCode: string, hours: number): Promise<StationLiveBoard | null>;
  /** Verified track layout, or `null` when none is known. */
  getStationLayout(stationCode: string): Promise<StationLayout | null>;
  /** Stations within `radiusKm`, nearest first. Throws `unsupported` when the source has no coordinates. */
  getNearbyStations(lat: number, lng: number, radiusKm: number, limit: number): Promise<(Station & { distanceKm: number })[]>;
  /** Trains that halt at `from` and later at `to`. */
  getTrainsBetween(from: string, to: string): Promise<TrainBetween[]>;
  /** Coach order for a train at a station, or null when unknown. */
  getCoachPosition(trainNumber: string, stationCode: string): Promise<CoachPosition | null>;
  /** Optional suggestions for the home screen (e.g. a sample train that is running now). */
  getExamples?(): Promise<ProviderExamples>;
}

export interface ProviderExamples {
  trains: TrainSummary[];
  stations: StationSummary[];
}
