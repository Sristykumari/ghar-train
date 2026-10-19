/**
 * TEST FIXTURE — deterministic, hand-written timetable. Not real data and
 * not used by the app. Times are written "HH:MM" on the journey day.
 *
 *   AAA ── BBB ── CCC ── DDD ── EEE         main line
 *           └── XXX ──────────────┘         branch (BBB→XXX→EEE)
 *
 * Passenger scenario: on slow train 11001 (AAA 08:00 → EEE 14:00).
 * Passenger arrives BBB 09:00 on 11001 (on time).
 *  11002 BBB 09:30 → EEE 11:15   1 change, 30 min wait (15 min slack over a 15 min minimum) = "medium"
 *  11003 BBB 09:12 → EEE 10:45   only 12 min to change → rejected at a 15 min minimum
 *  11004 CCC 10:50 → EEE 12:30   later and riskier than 11002 → filtered as dominated
 *  11005 BBB 09:20 → XXX 09:40, 11006 XXX 10:00 → EEE 10:50   2 changes, fastest, tight ("high")
 *  11008 BBB 07:00 → EEE 08:00   already departed
 */
import type { InMemoryDataset } from "@/lib/providers/in-memory/provider";
import type { SimulationProfile } from "@/lib/providers/in-memory/simulator";
import { parseHHMM } from "@/lib/domain/time";
import type { ScheduleStop, Station, StationLayout, TrainSchedule, Weekday } from "@/lib/domain/types";
import { WEEKDAYS } from "@/lib/domain/types";

export const FIXTURE_DATE = "2026-10-16"; // a Friday

export const STATIONS: Station[] = [
  { code: "AAA", name: "Alpha", coordinates: { lat: 20, lng: 77 } },
  { code: "BBB", name: "Bravo Junction", coordinates: { lat: 20.5, lng: 77.2 } },
  { code: "CCC", name: "Charlie", coordinates: { lat: 21, lng: 77.4 } },
  { code: "DDD", name: "Delta", coordinates: { lat: 21.5, lng: 77.6 } },
  { code: "EEE", name: "Echo Central", coordinates: { lat: 22, lng: 77.8 } },
  { code: "XXX", name: "Xray", coordinates: { lat: 21, lng: 78 } },
];

const names = Object.fromEntries(STATIONS.map((s) => [s.code, s.name]));

type StopSpec = [code: string, arr: string | null, dep: string | null, opts?: { platform?: string; pass?: boolean; day?: number }];

export function train(number: string, name: string, stops: StopSpec[], runDays: Weekday[] = [...WEEKDAYS]): TrainSchedule {
  const toOffset = (t: string | null, day = 1) => (t == null ? null : (day - 1) * 1440 + parseHHMM(t)!);
  const built: ScheduleStop[] = stops.map(([code, arr, dep, opts], i) => ({
    sequence: i + 1,
    stationCode: code,
    stationName: names[code] ?? code,
    arrival: toOffset(arr, opts?.day),
    departure: toOffset(dep, opts?.day),
    isHalt: !opts?.pass,
    distanceKm: i * 50,
    scheduledPlatform: opts?.platform ?? null,
    coordinates: STATIONS.find((s) => s.code === code)?.coordinates ?? null,
  }));
  return { number, name, sourceCode: stops[0][0], destinationCode: stops[stops.length - 1][0], runDays, stops: built };
}

export const TRAINS: TrainSchedule[] = [
  train("11001", "Test Slow", [
    ["AAA", null, "08:00", { platform: "1" }],
    ["BBB", "09:00", "09:05", { platform: "2" }],
    ["CCC", "10:30", "10:35"],
    ["DDD", "12:00", "12:05"],
    ["EEE", "14:00", null, { platform: "4" }],
  ]),
  train("11002", "Test Fast", [
    ["BBB", null, "09:30", { platform: "3" }],
    ["CCC", "10:00", "10:00", { pass: true }],
    ["DDD", "10:30", "10:32"],
    ["EEE", "11:15", null],
  ]),
  train("11003", "Test Tight", [
    ["BBB", null, "09:12"],
    ["EEE", "10:45", null],
  ]),
  train("11004", "Test Late Express", [
    ["CCC", null, "10:50"],
    ["EEE", "12:30", null],
  ]),
  train("11005", "Test Branch Shuttle", [
    ["BBB", null, "09:20", { platform: "5" }],
    ["XXX", "09:40", null],
  ]),
  train("11006", "Test Branch Link", [
    ["XXX", null, "10:00"],
    ["EEE", "10:50", null],
  ]),
  train("11008", "Test Early Bird", [
    ["BBB", null, "07:00"],
    ["EEE", "08:00", null],
  ]),
  train("11009", "Test Night Mail", [
    ["EEE", null, "23:00"],
    ["CCC", "02:00", "02:10", { day: 2 }],
    ["AAA", "05:00", null, { day: 2 }],
  ], ["fri"]),
];

export const LAYOUTS: StationLayout[] = [
  { stationCode: "BBB", leftNeighbours: ["AAA"], rightNeighbours: ["CCC", "XXX"], platforms: ["1", "2", "3", "4", "5"], sourceNote: "Test layout" },
];

export function fixtureDataset(profiles: Record<string, SimulationProfile | null> = {}): InMemoryDataset {
  return {
    label: "Test fixture",
    stations: STATIONS,
    trains: TRAINS,
    layouts: LAYOUTS,
    liveProfile: (n) => profiles[n] ?? null,
  };
}

/** Epoch ms for "HH:MM" IST on the fixture date. */
export function at(hhmm: string, date = FIXTURE_DATE): number {
  return Date.parse(`${date}T${hhmm}:00+05:30`);
}
