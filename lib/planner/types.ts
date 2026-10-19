import type { DataQuality } from "@/lib/domain/types";
import type { PlatformInfo } from "@/lib/services/views";

/** One dated run of a train with absolute times at every stop. */
export interface Trip {
  id: string;
  trainNumber: string;
  trainName: string;
  journeyDate: string;
  stops: TripStop[];
  /** Quality of the times on this trip ("scheduled" unless live data was applied). */
  quality: DataQuality;
  delayMinutes: number | null;
  lastUpdatedAt: number | null;
}

export interface TripStop {
  stationCode: string;
  stationName: string;
  arrival: number | null;
  departure: number | null;
  scheduledArrival: number | null;
  scheduledDeparture: number | null;
  isHalt: boolean;
  platform: PlatformInfo | null;
  /** True once the train has left this stop according to live data. */
  departed: boolean;
}

/** A ride on one trip between two stop indices. */
export interface LegRef {
  tripId: string;
  boardIdx: number;
  alightIdx: number;
}

export type Risk = "low" | "medium" | "high";

export interface JourneyLeg {
  trainNumber: string;
  trainName: string;
  journeyDate: string;
  from: { code: string; name: string };
  to: { code: string; name: string };
  departure: number;
  arrival: number;
  scheduledDeparture: number | null;
  scheduledArrival: number | null;
  delayMinutes: number | null;
  quality: DataQuality;
  departurePlatform: PlatformInfo | null;
  arrivalPlatform: PlatformInfo | null;
  intermediateStops: number;
}

export interface TransferView {
  station: { code: string; name: string };
  arrival: number;
  departure: number;
  waitMinutes: number;
  minTransferMinutes: number;
  risk: Risk;
  notes: string[];
}

export interface JourneyOption {
  id: string;
  kind: "current" | "alternative";
  legs: JourneyLeg[];
  transfers: TransferView[];
  departureTime: number;
  arrivalTime: number;
  /** Minutes from "now" until arrival at the destination. */
  minutesToDestination: number;
  waitingMinutes: number;
  changes: number;
  risk: Risk;
  confidence: "high" | "medium" | "low";
  dataQuality: DataQuality;
  /** Positive = arrives this many minutes earlier than staying on the current train. */
  minutesSavedVsCurrent: number | null;
  notes: string[];
}

export interface RejectedConnection {
  station: { code: string; name: string };
  trainNumber: string;
  trainName: string;
  departure: number;
  reason: string;
}

export interface PlanRequest {
  trainNumber: string;
  journeyDate?: string;
  /** Station the passenger is at or will reach next on their current train. */
  currentStation: string;
  destination: string;
  minTransferMinutes: number;
  maxChanges: number;
}

export interface PlanResult {
  request: PlanRequest & { journeyDate: string };
  generatedAt: number;
  currentTrain: {
    number: string;
    name: string;
    journeyDate: string;
    quality: DataQuality;
    freshnessMessage: string;
    delayMinutes: number | null;
  };
  destination: { code: string; name: string };
  current: JourneyOption | null;
  currentNote: string | null;
  options: JourneyOption[];
  fastestId: string | null;
  /** Feasible alternatives that arrive later than staying on the current train (not listed). */
  slowerAlternativesHidden: number;
  rejected: RejectedConnection[];
  warnings: string[];
  stats: { stationLookups: number; trainLookups: number; liveLookups: number; truncated: boolean };
}
