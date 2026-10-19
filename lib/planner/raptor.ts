import type { LegRef } from "./types";
import type { TimetableSource } from "./timetable";

export interface RaptorQuery {
  origin: string;
  /** When the passenger is at `origin` (having arrived on another train). */
  readyAt: number;
  destination: string;
  /** Maximum number of trains to ride after leaving the current one. */
  maxRides: number;
  minTransferMs: number;
  now: number;
  /** Trains that must not be used (e.g. the one the passenger is leaving). */
  excludeTrains: Set<string>;
}

interface Label {
  station: string;
  arrival: number;
  leg: LegRef | null;
  trainNumber: string | null;
  prev: Label | null;
}

function usesTrain(label: Label | null, trainNumber: string): boolean {
  for (let l = label; l; l = l.prev) if (l.trainNumber === trainNumber) return true;
  return false;
}

function chainOf(label: Label): LegRef[] {
  const legs: LegRef[] = [];
  for (let l: Label | null = label; l?.leg; l = l.prev) legs.unshift(l.leg);
  return legs;
}

/**
 * Round-based earliest-arrival search (RAPTOR-style, trip-based).
 *
 * Stations are nodes; each dated train run gives time-dependent edges from
 * every halt to every later halt. Round k finds the earliest arrival at each
 * station using exactly k trains, and keeps a label only if it beats every
 * earlier round. The result is the Pareto set of (arrival time, number of
 * trains) at the destination: one chain per round that improved it.
 *
 * Boarding requires departure ≥ arrival + minimum transfer time, and trains
 * that have already left (per live data or the clock) are never boarded.
 */
export async function earliestArrivalChains(source: TimetableSource, q: RaptorQuery): Promise<LegRef[][]> {
  const best = new Map<string, number>([[q.origin, q.readyAt]]);
  const bestAt = (code: string) => best.get(code) ?? Infinity;
  let marked = new Map<string, Label>([
    [q.origin, { station: q.origin, arrival: q.readyAt, leg: null, trainNumber: null, prev: null }],
  ]);
  const results: LegRef[][] = [];

  for (let round = 1; round <= q.maxRides && marked.size > 0; round++) {
    const next = new Map<string, Label>();
    for (const [station, label] of marked) {
      const earliest = label.arrival + q.minTransferMs;
      const departures = await source.departuresFrom(station, earliest);
      for (const { trip, boardIdx } of departures) {
        if (q.excludeTrains.has(trip.trainNumber) || usesTrain(label, trip.trainNumber)) continue;
        const board = trip.stops[boardIdx];
        if (board.departed || board.departure == null || board.departure < q.now || board.departure < earliest) continue;
        for (let j = boardIdx + 1; j < trip.stops.length; j++) {
          const stop = trip.stops[j];
          if (!stop.isHalt || stop.arrival == null) continue;
          if (stop.arrival >= bestAt(q.destination)) break; // cannot beat the best known arrival
          if (stop.arrival < bestAt(stop.stationCode)) {
            best.set(stop.stationCode, stop.arrival);
            next.set(stop.stationCode, {
              station: stop.stationCode,
              arrival: stop.arrival,
              leg: { tripId: trip.id, boardIdx, alightIdx: j },
              trainNumber: trip.trainNumber,
              prev: label,
            });
          }
        }
      }
    }
    const dest = next.get(q.destination);
    if (dest) results.push(chainOf(dest));
    next.delete(q.destination);
    marked = next;
  }
  return results;
}
