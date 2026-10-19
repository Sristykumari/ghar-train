import type { Station, ScheduleStop, TrainSchedule, Weekday } from "@/lib/domain/types";
import { WEEKDAYS } from "@/lib/domain/types";

/** Station position along a line, used to derive running times for sample trains. */
export interface LineStation {
  code: string;
  km: number;
}

export interface SampleTrainSpec {
  number: string;
  name: string;
  type?: string;
  /** Ordered station codes on the line this train runs over (including pass-through stations). */
  line: LineStation[];
  /** Codes of stations where the train halts, mapped to halt length in minutes. */
  halts: Record<string, number>;
  /** Departure from the first station, minutes after origin-day midnight. */
  departure: number;
  speedKmph: number;
  runDays?: Weekday[];
  platforms?: Record<string, string>;
}

/** Builds a timetable from distance and an average speed. Development use only. */
export function buildSampleTrain(spec: SampleTrainSpec, stations: Map<string, Station>): TrainSchedule {
  const line = spec.line;
  const stops: ScheduleStop[] = [];
  let clock = spec.departure;
  for (let i = 0; i < line.length; i++) {
    const ls = line[i];
    if (i > 0) clock += Math.max(1, Math.round(((line[i].km - line[i - 1].km) / spec.speedKmph) * 60));
    const isFirst = i === 0;
    const isLast = i === line.length - 1;
    const isHalt = isFirst || isLast || ls.code in spec.halts;
    const halt = isFirst || isLast ? 0 : (spec.halts[ls.code] ?? 0);
    const station = stations.get(ls.code);
    if (!station) throw new Error(`Unknown sample station ${ls.code}`);
    stops.push({
      sequence: i + 1,
      stationCode: ls.code,
      stationName: station.name,
      arrival: isFirst ? null : clock,
      departure: isLast ? null : clock + halt,
      isHalt,
      distanceKm: ls.km - line[0].km,
      scheduledPlatform: isHalt ? (spec.platforms?.[ls.code] ?? null) : null,
      coordinates: station.coordinates ?? null,
    });
    clock += halt;
  }
  return {
    number: spec.number,
    name: spec.name,
    type: spec.type ?? null,
    sourceCode: line[0].code,
    destinationCode: line[line.length - 1].code,
    runDays: spec.runDays ?? [...WEEKDAYS],
    stops,
  };
}

/** Slices a line between two station codes (inclusive), in either direction. */
export function lineBetween(line: LineStation[], from: string, to: string): LineStation[] {
  const a = line.findIndex((s) => s.code === from);
  const b = line.findIndex((s) => s.code === to);
  if (a === -1 || b === -1) throw new Error(`Bad line slice ${from}-${to}`);
  if (a <= b) return line.slice(a, b + 1);
  const total = line[a].km;
  return line
    .slice(b, a + 1)
    .reverse()
    .map((s) => ({ code: s.code, km: total - s.km }));
}
