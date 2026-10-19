import { RailDataError } from "@/lib/domain/errors";
import { addDays, DAY_MINUTES, minutesBetween, offsetToInstant, weekdayOf } from "@/lib/domain/time";
import type { TrainBetween, Weekday } from "@/lib/domain/types";
import type { RailDataProvider } from "@/lib/providers/types";

export interface BetweenRow {
  trainNumber: string;
  trainName: string;
  type: string | null;
  /** Date the train leaves its origin (use for the live status page). */
  journeyDate: string;
  departure: number;
  arrival: number;
  durationMinutes: number;
  distanceKm: number | null;
  haltsBetween: number | null;
  runDays: Weekday[];
  departed: boolean;
}

export interface TrainsBetweenView {
  from: { code: string; name: string };
  to: { code: string; name: string };
  /** Date of travel at the `from` station. */
  date: string;
  trains: BetweenRow[];
  /** Trains on this route that do not run on the chosen date. */
  notRunningCount: number;
}

/**
 * Trains from A to B on a given date. Timetable data only (labelled
 * "scheduled" in the UI); the live status page shows today's running.
 * Pure apart from the provider call; exported pieces are tested.
 */
export function buildBetweenRows(list: TrainBetween[], date: string, now: number) {
  const rows: BetweenRow[] = [];
  let notRunning = 0;
  for (const t of list) {
    // The train may reach `from` one or more days after leaving its origin.
    const originDate = addDays(date, -Math.floor(t.departure / DAY_MINUTES));
    if (!t.runDays.includes(weekdayOf(originDate))) {
      notRunning++;
      continue;
    }
    const departure = offsetToInstant(originDate, t.departure);
    const arrival = offsetToInstant(originDate, t.arrival);
    rows.push({
      trainNumber: t.trainNumber,
      trainName: t.trainName,
      type: t.type ?? null,
      journeyDate: originDate,
      departure,
      arrival,
      durationMinutes: minutesBetween(departure, arrival),
      distanceKm: t.distanceKm ?? null,
      haltsBetween: t.haltsBetween ?? null,
      runDays: t.runDays,
      departed: departure < now,
    });
  }
  rows.sort((a, b) => a.departure - b.departure);
  return { rows, notRunning };
}

export async function getTrainsBetween(
  provider: RailDataProvider,
  input: { from: string; to: string; date: string; now: number },
): Promise<TrainsBetweenView> {
  if (input.from === input.to) throw new RailDataError("invalid_request", "Choose two different stations.");
  const [list, fromSt, toSt] = await Promise.all([
    provider.getTrainsBetween(input.from, input.to),
    provider.getStation(input.from).catch(() => null),
    provider.getStation(input.to).catch(() => null),
  ]);
  const { rows, notRunning } = buildBetweenRows(list, input.date, input.now);
  return {
    from: { code: input.from, name: fromSt?.name ?? list[0]?.fromName ?? input.from },
    to: { code: input.to, name: toSt?.name ?? list[0]?.toName ?? input.to },
    date: input.date,
    trains: rows,
    notRunningCount: notRunning,
  };
}
