import { RailDataError } from "@/lib/domain/errors";
import { addDays, istDateOf, offsetToInstant, weekdayOf, MINUTE_MS } from "@/lib/domain/time";
import type {
  DataQuality,
  LiveBoardEntry,
  StationLayout,
  StationLiveBoard,
  StationScheduleEntry,
  TrainSchedule,
} from "@/lib/domain/types";
import type { RailDataProvider } from "@/lib/providers/types";
import { assessFreshness, toIssue } from "./freshness";
import type { BoardRow, BoardRowStatus, StationBoardView, UpstreamIssue } from "./views";

export const APPROACHING_MINUTES = 15;
const LOOKBACK_MINUTES = 90;
/** Upper bound on timetables fetched per board, to protect provider quotas. */
const MAX_ROUTE_LOOKUPS = 30;

export interface StationBoardInput {
  stationCode: string;
  hours: number;
  now: number;
  staleAfterMinutes: number;
}

interface Instance {
  entry: StationScheduleEntry;
  journeyDate: string;
  schedArr: number | null;
  schedDep: number | null;
  live: LiveBoardEntry | null;
}

/** Expands timetable entries into dated runs that touch the time window. */
export function expandInstances(entries: StationScheduleEntry[], now: number, hours: number): Instance[] {
  const today = istDateOf(now);
  const from = now - LOOKBACK_MINUTES * MINUTE_MS;
  const to = now + hours * 60 * MINUTE_MS;
  const out: Instance[] = [];
  for (const entry of entries) {
    if (!entry.isHalt) continue;
    const ref = entry.arrival ?? entry.departure;
    if (ref == null) continue;
    for (let back = 4; back >= -1; back--) {
      const date = addDays(today, -back);
      if (!entry.runDays.includes(weekdayOf(date))) continue;
      const schedArr = entry.arrival == null ? null : offsetToInstant(date, entry.arrival);
      const schedDep = entry.departure == null ? null : offsetToInstant(date, entry.departure);
      const t = schedArr ?? schedDep!;
      const leave = schedDep ?? schedArr!;
      if (leave < from || t > to) continue;
      out.push({ entry, journeyDate: date, schedArr, schedDep, live: null });
    }
  }
  return out;
}

/**
 * Attaches live board entries to timetable instances. Matches on journey date
 * when the provider gives one, otherwise on the closest scheduled time.
 */
export function attachLive(instances: Instance[], board: StationLiveBoard | null, entries: StationScheduleEntry[], now: number) {
  if (!board) return instances;
  const result = [...instances];
  for (const le of board.entries) {
    const candidates = result.filter((i) => i.entry.trainNumber === le.trainNumber && !i.live);
    let match = le.journeyDate ? candidates.find((c) => c.journeyDate === le.journeyDate) : undefined;
    if (!match && candidates.length) {
      const t = le.expectedArrival ?? le.expectedDeparture ?? now;
      match = candidates.reduce((best, c) =>
        Math.abs((c.schedArr ?? c.schedDep!) - t) < Math.abs((best.schedArr ?? best.schedDep!) - t) ? c : best,
      );
    }
    if (match) {
      match.live = le;
    } else if (le.journeyDate) {
      // Running late enough to fall outside the window — still show it.
      const entry = entries.find((e) => e.trainNumber === le.trainNumber && e.isHalt);
      if (entry) {
        result.push({
          entry,
          journeyDate: le.journeyDate,
          schedArr: entry.arrival == null ? null : offsetToInstant(le.journeyDate, entry.arrival),
          schedDep: entry.departure == null ? null : offsetToInstant(le.journeyDate, entry.departure),
          live: le,
        });
      }
    }
  }
  return result;
}

export function classifyRow(i: Instance, now: number): BoardRowStatus {
  const le = i.live;
  if (le) {
    if (le.state === "at_station") return "at_platform";
    if (le.state === "departed") return "departed";
    const eta = le.expectedArrival ?? le.expectedDeparture;
    if (eta != null && eta - now <= APPROACHING_MINUTES * MINUTE_MS) return "approaching";
    return "expected";
  }
  const leave = i.schedDep ?? i.schedArr!;
  return leave < now ? "scheduled_passed" : "scheduled";
}

/**
 * Which side of the track diagram a train uses, based on the stations it
 * actually runs through (including non-halting ones) — never on map bearing.
 */
export function sideFromRoute(
  layout: StationLayout | null,
  route: TrainSchedule | null,
  stationCode: string,
  direction: "arrival" | "departure",
): "left" | "right" | null {
  if (!layout || !route) return null;
  const idx = route.stops.findIndex((s) => s.stationCode === stationCode);
  if (idx === -1) return null;
  const step = direction === "arrival" ? -1 : 1;
  for (let i = idx + step; i >= 0 && i < route.stops.length; i += step) {
    const code = route.stops[i].stationCode;
    if (layout.leftNeighbours.includes(code)) return "left";
    if (layout.rightNeighbours.includes(code)) return "right";
  }
  return null;
}

function neighbourHalts(route: TrainSchedule | null, stationCode: string) {
  if (!route) return { prevHalt: null, nextHalt: null, prevAny: null, nextAny: null };
  const idx = route.stops.findIndex((s) => s.stationCode === stationCode);
  if (idx === -1) return { prevHalt: null, nextHalt: null, prevAny: null, nextAny: null };
  const pick = (s: TrainSchedule["stops"][number] | undefined) => (s ? { code: s.stationCode, name: s.stationName } : null);
  const before = route.stops.slice(0, idx);
  const after = route.stops.slice(idx + 1);
  return {
    prevHalt: pick([...before].reverse().find((s) => s.isHalt)),
    nextHalt: pick(after.find((s) => s.isHalt)),
    prevAny: pick(before[before.length - 1]),
    nextAny: pick(after[0]),
  };
}

export async function getStationBoard(provider: RailDataProvider, input: StationBoardInput): Promise<StationBoardView> {
  const { stationCode, hours, now } = input;
  const [station, entries, layout] = await Promise.all([
    provider.getStation(stationCode),
    provider.getStationSchedule(stationCode),
    provider.getStationLayout(stationCode).catch(() => null),
  ]);
  if (!station && entries.length === 0) throw new RailDataError("not_found", `Station ${stationCode} was not found.`);

  let board: StationLiveBoard | null = null;
  let issue: UpstreamIssue | null = null;
  if (provider.info.capabilities.liveStationBoard) {
    try {
      board = await provider.getStationLiveBoard(stationCode, hours);
    } catch (e) {
      issue = toIssue(e);
    }
  }

  const instances = attachLive(expandInstances(entries, now, hours), board, entries, now).sort(
    (a, b) => instanceTime(a) - instanceTime(b),
  );
  const truncated = new Set(instances.map((i) => i.entry.trainNumber)).size > MAX_ROUTE_LOOKUPS;
  const routeNumbers = [...new Set(instances.map((i) => i.entry.trainNumber))].slice(0, MAX_ROUTE_LOOKUPS);
  const routes = new Map<string, TrainSchedule | null>();
  await Promise.all(
    routeNumbers.map(async (n) => routes.set(n, await provider.getTrainSchedule(n).catch(() => null))),
  );

  const liveQuality: DataQuality = board ? assessFreshness(board.source, board.fetchedAt, now, input.staleAfterMinutes).quality : "scheduled";
  const nameOf = (code: string, route: TrainSchedule | null) =>
    route?.stops.find((s) => s.stationCode === code)?.stationName ?? null;

  const rows: BoardRow[] = instances.map((i) => {
    const route = routes.get(i.entry.trainNumber) ?? null;
    const n = neighbourHalts(route, stationCode);
    const le = i.live;
    const delay = le?.delayMinutes ?? null;
    const expectedArrival = le ? (le.expectedArrival ?? shift(i.schedArr, delay)) : i.schedArr;
    const expectedDeparture = le ? (le.expectedDeparture ?? shift(i.schedDep, delay)) : i.schedDep;
    return {
      key: `${i.entry.trainNumber}:${i.journeyDate}`,
      trainNumber: i.entry.trainNumber,
      trainName: i.entry.trainName || le?.trainName || route?.name || "",
      journeyDate: i.journeyDate,
      sourceCode: i.entry.sourceCode,
      sourceName: nameOf(i.entry.sourceCode, route),
      destinationCode: i.entry.destinationCode,
      destinationName: nameOf(i.entry.destinationCode, route),
      originatesHere: i.entry.arrival == null || i.entry.sourceCode === stationCode,
      terminatesHere: i.entry.departure == null || i.entry.destinationCode === stationCode,
      previousHalt: n.prevHalt,
      nextHalt: n.nextHalt,
      arrivesFrom: n.prevAny,
      departsToward: n.nextAny,
      arrivalSide: sideFromRoute(layout, route, stationCode, "arrival"),
      departureSide: sideFromRoute(layout, route, stationCode, "departure"),
      scheduledArrival: i.schedArr,
      scheduledDeparture: i.schedDep,
      expectedArrival,
      expectedDeparture,
      delayMinutes: delay,
      timeQuality: le ? (le.state === "upcoming" && liveQuality === "live" ? "estimated" : liveQuality) : "scheduled",
      platform: le?.livePlatform
        ? { value: le.livePlatform, quality: liveQuality === "simulated" ? "simulated" : "live" }
        : i.entry.scheduledPlatform
          ? { value: i.entry.scheduledPlatform, quality: "scheduled" }
          : null,
      status: classifyRow(i, now),
      lastUpdatedAt: le ? (board?.fetchedAt ?? null) : null,
    };
  });

  return {
    station: { code: stationCode, name: station?.name ?? stationCode },
    generatedAt: now,
    windowHours: hours,
    live: { available: !!board, source: board?.source ?? null, issue },
    layout: {
      available: !!layout,
      sourceNote: layout?.sourceNote ?? null,
      platforms: layout?.platforms ?? [],
      leftNeighbours: layout?.leftNeighbours ?? [],
      rightNeighbours: layout?.rightNeighbours ?? [],
    },
    rows,
    truncated,
  };
}

function shift(t: number | null, delay: number | null) {
  return t == null ? null : t + (delay ?? 0) * MINUTE_MS;
}

function instanceTime(i: Instance) {
  return i.live?.expectedArrival ?? i.live?.expectedDeparture ?? i.schedArr ?? i.schedDep ?? 0;
}

