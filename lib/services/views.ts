/**
 * View models returned by the backend API and rendered by the UI. Every time
 * and platform carries the quality of the data behind it.
 */
import type { DataQuality, RunningState, Weekday } from "@/lib/domain/types";

export interface PlatformInfo {
  value: string;
  /** "live"/"simulated" = reported for this run; "scheduled" = usual platform from the timetable. */
  quality: DataQuality;
}

export interface Freshness {
  quality: DataQuality;
  lastUpdatedAt: number | null;
  ageMinutes: number | null;
  stale: boolean;
  message: string;
}

export interface UpstreamIssue {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export type StopProgress = "departed" | "at_station" | "next" | "upcoming" | "skipped" | "unknown";

export interface StopView {
  sequence: number;
  stationCode: string;
  stationName: string;
  isHalt: boolean;
  distanceKm: number | null;
  day: number;
  scheduledArrival: number | null;
  scheduledDeparture: number | null;
  expectedArrival: number | null;
  expectedDeparture: number | null;
  delayMinutes: number | null;
  timeQuality: DataQuality;
  progress: StopProgress;
  platform: PlatformInfo | null;
  coordinates: { lat: number; lng: number } | null;
}

export type Movement = "not_started" | "departed" | "approaching" | "arrived" | "completed" | "cancelled" | "unknown";
export type Punctuality = "on_time" | "delayed" | "early" | "unknown";

export interface TrainStatusView {
  train: {
    number: string;
    name: string;
    type: string | null;
    sourceCode: string;
    sourceName: string;
    destinationCode: string;
    destinationName: string;
    runDays: Weekday[];
  };
  journeyDate: string;
  runsOnDate: boolean;
  freshness: Freshness;
  runningState: RunningState;
  movement: Movement;
  punctuality: Punctuality;
  delayMinutes: number | null;
  currentLocation: string;
  currentStationCode: string | null;
  nextStop: StopView | null;
  stops: StopView[];
  position: { lat: number; lng: number; isActual: boolean; quality: DataQuality } | null;
  /** Speed at the last update, with the quality of the feed it came from. */
  speed: { kmh: number; quality: DataQuality } | null;
  notices: string[];
  liveIssue: UpstreamIssue | null;
  generatedAt: number;
}

export type BoardRowStatus =
  | "at_platform"
  | "approaching"
  | "expected"
  | "departed"
  | "scheduled"
  | "scheduled_passed";

export interface BoardRow {
  key: string;
  trainNumber: string;
  trainName: string;
  journeyDate: string;
  sourceCode: string;
  sourceName: string | null;
  destinationCode: string;
  destinationName: string | null;
  originatesHere: boolean;
  terminatesHere: boolean;
  previousHalt: { code: string; name: string } | null;
  nextHalt: { code: string; name: string } | null;
  arrivesFrom: { code: string; name: string } | null;
  departsToward: { code: string; name: string } | null;
  /** Side on the station track diagram. Only set when a verified layout supports it. */
  arrivalSide: "left" | "right" | null;
  departureSide: "left" | "right" | null;
  scheduledArrival: number | null;
  scheduledDeparture: number | null;
  expectedArrival: number | null;
  expectedDeparture: number | null;
  delayMinutes: number | null;
  timeQuality: DataQuality;
  platform: PlatformInfo | null;
  status: BoardRowStatus;
  lastUpdatedAt: number | null;
}

export interface StationBoardView {
  station: { code: string; name: string };
  generatedAt: number;
  windowHours: number;
  live: { available: boolean; source: "live" | "simulated" | null; issue: UpstreamIssue | null };
  layout: {
    available: boolean;
    sourceNote: string | null;
    platforms: string[];
    leftNeighbours: string[];
    rightNeighbours: string[];
  };
  rows: BoardRow[];
  truncated: boolean;
}
