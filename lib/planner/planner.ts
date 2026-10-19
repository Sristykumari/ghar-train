import { RailDataError } from "@/lib/domain/errors";
import { istDateOf, minutesBetween, weekdayOf, MINUTE_MS } from "@/lib/domain/time";
import type { DataQuality } from "@/lib/domain/types";
import type { RailDataProvider } from "@/lib/providers/types";
import { assessFreshness } from "@/lib/services/freshness";
import { defaultJourneyDate } from "@/lib/services/train-status";
import { earliestArrivalChains } from "./raptor";
import { applyLive, TimetableSource } from "./timetable";
import type {
  JourneyLeg,
  JourneyOption,
  LegRef,
  PlanRequest,
  PlanResult,
  RejectedConnection,
  Risk,
  TransferView,
  Trip,
} from "./types";

export interface PlannerDeps {
  provider: RailDataProvider;
  now: number;
  staleAfterMinutes: number;
  maxStationLookups: number;
  horizonHours?: number;
  /** Live-status calls allowed for connecting trains (protects quotas). */
  maxLiveLookups?: number;
  maxOptions?: number;
}

/** A candidate itinerary: optionally stay on the current train to some stop, then ride other trains. */
interface ChainSpec {
  onboard: LegRef | null;
  /** Where/when the passenger is when the first ride starts if they are not riding the current train first. */
  start: { stationCode: string; time: number };
  rides: LegRef[];
}

const QUALITY_RANK: Record<DataQuality, number> = { live: 0, simulated: 1, estimated: 2, scheduled: 3, unavailable: 4 };
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };
const RISKS: Risk[] = ["low", "medium", "high"];

/** Extra minutes beyond the minimum transfer time that make a change comfortable. */
export const RISK_BUFFER = { high: 10, medium: 25 };

export function transferRisk(waitMinutes: number, minTransferMinutes: number): Risk {
  const slack = waitMinutes - minTransferMinutes;
  if (slack < RISK_BUFFER.high) return "high";
  if (slack < RISK_BUFFER.medium) return "medium";
  return "low";
}

function chainId(trips: Map<string, Trip>, spec: ChainSpec): string {
  const legs = [spec.onboard, ...spec.rides].filter((l): l is LegRef => !!l);
  return legs
    .map((l) => {
      const t = trips.get(l.tripId)!;
      return `${t.id}:${t.stops[l.boardIdx].stationCode}-${t.stops[l.alightIdx].stationCode}`;
    })
    .join("|");
}

type Evaluated = { ok: true; option: JourneyOption } | { ok: false; rejected: RejectedConnection };

/**
 * Turns a chain of rides into a journey option, re-checking every connection
 * against the current (possibly live-updated) times. Exported for tests.
 */
export function evaluateChain(
  spec: ChainSpec,
  trips: Map<string, Trip>,
  opts: { now: number; minTransferMinutes: number; kind: JourneyOption["kind"] },
): Evaluated {
  const today = istDateOf(opts.now);
  const legRefs = [spec.onboard, ...spec.rides].filter((l): l is LegRef => !!l);
  const legs: JourneyLeg[] = [];
  const legTrips: Trip[] = [];

  for (const ref of legRefs) {
    const trip = trips.get(ref.tripId)!;
    const b = trip.stops[ref.boardIdx];
    const a = trip.stops[ref.alightIdx];
    if (b.departure == null || a.arrival == null) {
      return reject(trip, b, b.departure ?? 0, "Timetable is missing times for this connection.");
    }
    legTrips.push(trip);
    legs.push({
      trainNumber: trip.trainNumber,
      trainName: trip.trainName,
      journeyDate: trip.journeyDate,
      from: { code: b.stationCode, name: b.stationName },
      to: { code: a.stationCode, name: a.stationName },
      departure: b.departure,
      arrival: a.arrival,
      scheduledDeparture: b.scheduledDeparture,
      scheduledArrival: a.scheduledArrival,
      delayMinutes: trip.delayMinutes,
      quality: trip.quality,
      departurePlatform: b.platform,
      arrivalPlatform: a.platform,
      intermediateStops: trip.stops.slice(ref.boardIdx + 1, ref.alightIdx).filter((s) => s.isHalt).length,
    });
  }

  const transfers: TransferView[] = [];
  const firstRide = spec.onboard ? 1 : 0;
  for (let i = firstRide; i < legs.length; i++) {
    const leg = legs[i];
    const trip = legTrips[i];
    const boardStop = trip.stops[legRefs[i].boardIdx];
    const arrival = i === 0 ? spec.start.time : legs[i - 1].arrival;
    const arrivingTrip = i === 0 ? null : legTrips[i - 1];

    if (boardStop.departed || leg.departure < opts.now) {
      return reject(trip, boardStop, leg.departure, "This train has already departed.");
    }
    const wait = minutesBetween(arrival, leg.departure);
    if (wait < opts.minTransferMinutes) {
      return reject(
        trip,
        boardStop,
        leg.departure,
        wait < 0
          ? `Leaves ${-wait} min before you would arrive.`
          : `Only ${wait} min to change; at least ${opts.minTransferMinutes} min needed.`,
      );
    }

    let risk = transferRisk(wait, opts.minTransferMinutes);
    const notes: string[] = [];
    if (arrivingTrip && arrivingTrip.quality === "scheduled" && arrivingTrip.journeyDate <= today) {
      risk = RISKS[Math.min(2, RISK_RANK[risk] + 1)];
      notes.push(`No live status for ${arrivingTrip.trainNumber}; its arrival time is from the timetable.`);
    }
    if (arrivingTrip?.delayMinutes != null && arrivingTrip.delayMinutes >= 30) {
      notes.push(`${arrivingTrip.trainNumber} is running ${arrivingTrip.delayMinutes} min late; delays can grow.`);
    }
    if (!leg.departurePlatform) notes.push("Platform not known yet — check station displays.");
    else if (leg.departurePlatform.quality === "scheduled") {
      notes.push(`Usual platform ${leg.departurePlatform.value} (timetable) — confirm on arrival.`);
    }
    if (trip.quality === "scheduled") notes.push(`No live status for ${trip.trainNumber}; departure time is from the timetable.`);

    transfers.push({
      station: leg.from,
      arrival,
      departure: leg.departure,
      waitMinutes: wait,
      minTransferMinutes: opts.minTransferMinutes,
      risk,
      notes,
    });
  }

  const risk = transfers.reduce<Risk>((r, t) => (RISK_RANK[t.risk] > RISK_RANK[r] ? t.risk : r), "low");
  const dataQuality = legs.reduce<DataQuality>(
    (q, l) => (QUALITY_RANK[l.quality] > QUALITY_RANK[q] ? l.quality : q),
    "live",
  );
  const confidence: JourneyOption["confidence"] =
    risk === "high" || dataQuality === "unavailable"
      ? "low"
      : risk === "medium" || QUALITY_RANK[dataQuality] >= QUALITY_RANK.estimated
        ? "medium"
        : "high";
  const last = legs[legs.length - 1];
  const notes: string[] = [];
  if (legTrips.some((t) => t.quality === "scheduled")) notes.push("Some times are from the timetable, not live data.");

  return {
    ok: true,
    option: {
      id: chainId(trips, spec),
      kind: opts.kind,
      legs,
      transfers,
      departureTime: legs[0].departure,
      arrivalTime: last.arrival,
      minutesToDestination: minutesBetween(opts.now, last.arrival),
      waitingMinutes: transfers.reduce((s, t) => s + t.waitMinutes, 0),
      changes: spec.rides.length,
      risk,
      confidence,
      dataQuality,
      minutesSavedVsCurrent: null,
      notes,
    },
  };

  function reject(trip: Trip, stop: Trip["stops"][number], departure: number, reason: string): Evaluated {
    return {
      ok: false,
      rejected: {
        station: { code: stop.stationCode, name: stop.stationName },
        trainNumber: trip.trainNumber,
        trainName: trip.trainName,
        departure,
        reason,
      },
    };
  }
}

export async function planAlternatives(deps: PlannerDeps, req: PlanRequest): Promise<PlanResult> {
  const { provider, now } = deps;
  const minTransferMs = req.minTransferMinutes * MINUTE_MS;
  const source = new TimetableSource(provider, {
    now,
    horizonHours: deps.horizonHours ?? 24,
    maxStationLookups: deps.maxStationLookups,
  });
  const warnings: string[] = [];

  // 1. The passenger's current train.
  const scheduleA = await source.schedule(req.trainNumber);
  if (!scheduleA) throw new RailDataError("not_found", `Train ${req.trainNumber} was not found.`);
  const journeyDate = req.journeyDate ?? defaultJourneyDate(scheduleA, now);
  if (!scheduleA.runDays.includes(weekdayOf(journeyDate))) {
    throw new RailDataError("invalid_request", `Train ${req.trainNumber} does not leave its origin on ${journeyDate}.`);
  }
  const curIdx = scheduleA.stops.findIndex((s) => s.stationCode === req.currentStation);
  if (curIdx === -1) {
    throw new RailDataError("invalid_request", `${req.currentStation} is not on the route of train ${req.trainNumber}.`);
  }
  if (req.destination === req.currentStation) {
    throw new RailDataError("invalid_request", "Destination must be different from your current station.");
  }

  let tripA = source.trip(scheduleA, journeyDate);
  let liveLookups = 0;
  if (provider.info.capabilities.liveStatus) {
    try {
      liveLookups++;
      const live = await provider.getLiveStatus(scheduleA.number, journeyDate);
      if (live) {
        tripA = applyLive(tripA, scheduleA, live, now, deps.staleAfterMinutes);
        source.setTrip(tripA);
      }
    } catch (e) {
      warnings.push(`Live status for your train is unavailable (${e instanceof Error ? e.message : "error"}).`);
    }
  }
  const freshA = assessFreshness(
    tripA.quality === "scheduled" ? null : tripA.quality === "simulated" ? "simulated" : "live",
    tripA.lastUpdatedAt,
    now,
    deps.staleAfterMinutes,
  );
  if (tripA.quality === "scheduled") {
    warnings.push("No live position for your train — the plan assumes it runs to the timetable.");
  }

  // The passenger must still be on (or about to board) this run of the train.
  const lastStopA = tripA.stops[tripA.stops.length - 1];
  const finished = tripA.quality === "scheduled" ? (lastStopA.arrival ?? Infinity) < now : lastStopA.departed || (lastStopA.arrival ?? Infinity) < now;
  if (finished) {
    throw new RailDataError(
      "invalid_request",
      `Train ${scheduleA.number} has already completed its run that started on ${journeyDate}. Check the journey date.`,
    );
  }
  if (tripA.stops[curIdx].departed) {
    const ahead = tripA.stops.find((s, i) => i > curIdx && s.isHalt && !s.departed);
    throw new RailDataError(
      "invalid_request",
      `Your train has already left ${tripA.stops[curIdx].stationName}.${ahead ? ` Choose the station it reaches next (${ahead.stationName}).` : ""}`,
    );
  }

  const destIdxA = scheduleA.stops.findIndex((s, i) => i > curIdx && s.isHalt && s.stationCode === req.destination);
  const destinationName =
    scheduleA.stops.find((s) => s.stationCode === req.destination)?.stationName ??
    (await provider.getStation(req.destination).catch(() => null))?.name ??
    null;
  if (!destinationName) throw new RailDataError("not_found", `Destination station ${req.destination} was not found.`);

  // 2. Candidate places to get off: halts of the current train still ahead of the passenger.
  const stopsA = tripA.stops;
  const lastCandidate = destIdxA > 0 ? destIdxA - 1 : stopsA.length - 1;
  const candidates: { idx: number; readyAt: number }[] = [];
  for (let i = curIdx; i <= lastCandidate; i++) {
    const s = stopsA[i];
    if (!s.isHalt) continue;
    if (i === curIdx) {
      if (s.departed || (s.departure ?? -Infinity) < now) continue;
      candidates.push({ idx: i, readyAt: Math.max(now, s.arrival ?? now) });
    } else {
      if (s.arrival == null || s.departed || s.arrival < now) continue;
      candidates.push({ idx: i, readyAt: s.arrival });
    }
  }

  // 3. Search from each candidate interchange.
  const specs: ChainSpec[] = [];
  const rejected: RejectedConnection[] = [];
  const exclude = new Set([scheduleA.number]);
  const onboardTo = (idx: number): LegRef | null =>
    idx === curIdx ? null : { tripId: tripA.id, boardIdx: curIdx, alightIdx: idx };

  if (destIdxA > 0) {
    specs.push({ onboard: { tripId: tripA.id, boardIdx: curIdx, alightIdx: destIdxA }, start: { stationCode: req.currentStation, time: now }, rides: [] });
  }

  for (const c of candidates) {
    const station = stopsA[c.idx].stationCode;
    const base = { onboard: onboardTo(c.idx), start: { stationCode: station, time: c.readyAt } };

    const chains = await earliestArrivalChains(source, {
      origin: station,
      readyAt: c.readyAt,
      destination: req.destination,
      maxRides: req.maxChanges,
      minTransferMs,
      now,
      excludeTrains: exclude,
    });
    for (const rides of chains) specs.push({ ...base, rides });

    // Direct trains from this station: keep a couple of extra options, and record near-misses.
    const departures = await source.departuresFrom(station, c.readyAt - 60 * MINUTE_MS);
    const direct = departures
      .map(({ trip, boardIdx }) => ({
        trip,
        boardIdx,
        alightIdx: trip.stops.findIndex((s, j) => j > boardIdx && s.isHalt && s.stationCode === req.destination),
      }))
      .filter((d) => d.alightIdx > 0 && !exclude.has(d.trip.trainNumber))
      .sort((a, b) => a.trip.stops[a.alightIdx].arrival! - b.trip.stops[b.alightIdx].arrival!);
    let kept = 0;
    for (const d of direct) {
      const dep = d.trip.stops[d.boardIdx].departure!;
      if (dep < c.readyAt + minTransferMs) {
        if (dep >= now - 30 * MINUTE_MS) {
          const r = evaluateChain(
            { ...base, rides: [{ tripId: d.trip.id, boardIdx: d.boardIdx, alightIdx: d.alightIdx }] },
            source.trips,
            { now, minTransferMinutes: req.minTransferMinutes, kind: "alternative" },
          );
          if (!r.ok) rejected.push(r.rejected);
        }
        continue;
      }
      if (kept++ < 2) specs.push({ ...base, rides: [{ tripId: d.trip.id, boardIdx: d.boardIdx, alightIdx: d.alightIdx }] });
    }
  }

  // 4. First evaluation on timetable times, then overlay live data on the most promising connecting trains.
  const evaluateAll = () => {
    const options = new Map<string, JourneyOption>();
    const late: RejectedConnection[] = [];
    for (const spec of specs) {
      const r = evaluateChain(spec, source.trips, {
        now,
        minTransferMinutes: req.minTransferMinutes,
        kind: spec.rides.length === 0 ? "current" : "alternative",
      });
      if (r.ok) options.set(r.option.id, r.option);
      else late.push(r.rejected);
    }
    return { options: [...options.values()].sort(compareOptions), late };
  };

  const first = evaluateAll();
  const today = istDateOf(now);
  const maxLive = deps.maxLiveLookups ?? 6;
  if (provider.info.capabilities.liveStatus) {
    const toRefresh: Trip[] = [];
    for (const o of first.options.slice(0, 8)) {
      for (const l of o.legs) {
        const id = `${l.trainNumber}:${l.journeyDate}`;
        const t = source.trips.get(id);
        if (!t || t.id === tripA.id || t.quality !== "scheduled" || t.journeyDate > today) continue;
        if (!toRefresh.some((x) => x.id === id)) toRefresh.push(t);
      }
    }
    for (const t of toRefresh.slice(0, maxLive)) {
      const sched = source.schedules.get(t.trainNumber);
      if (!sched) continue;
      try {
        liveLookups++;
        const live = await provider.getLiveStatus(t.trainNumber, t.journeyDate);
        if (live) source.setTrip(applyLive(t, sched, live, now, deps.staleAfterMinutes));
      } catch {
        // Keep timetable times; the option is already marked as schedule-based.
      }
    }
    if (toRefresh.length > maxLive) warnings.push("Live status was checked only for the most promising connections.");
  }

  const final = evaluateAll();
  for (const r of final.late) {
    if (!rejected.some((x) => x.trainNumber === r.trainNumber && x.station.code === r.station.code)) rejected.push(r);
  }

  const current = final.options.find((o) => o.kind === "current") ?? null;
  let options = paretoFilter(collapseByFinalTrain(final.options.filter((o) => o.kind === "alternative")));
  let slowerHidden = 0;
  if (current) {
    current.minutesSavedVsCurrent = 0;
    for (const o of options) o.minutesSavedVsCurrent = minutesBetween(o.arrivalTime, current.arrivalTime);
    const faster = options.filter((o) => o.arrivalTime < current.arrivalTime);
    slowerHidden = options.length - faster.length;
    options = faster;
  }
  options = options.slice(0, deps.maxOptions ?? 10);
  const fastest = options[0] ?? null;

  if (source.truncated) {
    warnings.push("The search was limited to protect the data provider's request quota; some routes may be missing.");
  }
  warnings.push(...source.issues);

  return {
    request: { ...req, journeyDate },
    generatedAt: now,
    currentTrain: {
      number: scheduleA.number,
      name: scheduleA.name,
      journeyDate,
      quality: freshA.quality,
      freshnessMessage: freshA.message,
      delayMinutes: tripA.delayMinutes,
    },
    destination: { code: req.destination, name: destinationName },
    current,
    currentNote: current
      ? null
      : destIdxA > 0
        ? "Your train's remaining journey could not be evaluated."
        : `Train ${scheduleA.number} does not stop at ${destinationName} after ${stopsA[curIdx].stationName}.`,
    options,
    fastestId: fastest?.id ?? null,
    slowerAlternativesHidden: slowerHidden,
    rejected: rejected.sort((a, b) => a.departure - b.departure).slice(0, 10),
    warnings,
    stats: {
      stationLookups: source.stationLookups,
      trainLookups: source.trainLookups,
      liveLookups,
      truncated: source.truncated,
    },
  };
}

/**
 * Several interchanges often feed the same connecting train (e.g. change at
 * Gwalior or at Jhansi for the same superfast). Keep one option per final
 * train: lowest risk first, then fewer changes, then less waiting.
 */
export function collapseByFinalTrain(options: JourneyOption[]): JourneyOption[] {
  const best = new Map<string, JourneyOption>();
  for (const o of options) {
    const last = o.legs[o.legs.length - 1];
    const key = `${last.trainNumber}:${last.journeyDate}:${last.to.code}`;
    const prev = best.get(key);
    if (
      !prev ||
      o.arrivalTime < prev.arrivalTime ||
      (o.arrivalTime === prev.arrivalTime &&
        (RISK_RANK[o.risk] - RISK_RANK[prev.risk] || o.changes - prev.changes || o.waitingMinutes - prev.waitingMinutes) < 0)
    ) {
      best.set(key, o);
    }
  }
  return [...best.values()].sort(compareOptions);
}

/**
 * Drops options that are no better on any of arrival time, number of changes
 * and connection risk than some other option (and worse on at least one).
 * What remains are genuine trade-offs: faster vs. fewer changes vs. safer.
 */
export function paretoFilter(options: JourneyOption[]): JourneyOption[] {
  const dominates = (a: JourneyOption, b: JourneyOption) =>
    a.arrivalTime <= b.arrivalTime &&
    a.changes <= b.changes &&
    RISK_RANK[a.risk] <= RISK_RANK[b.risk] &&
    (a.arrivalTime < b.arrivalTime || a.changes < b.changes || RISK_RANK[a.risk] < RISK_RANK[b.risk]);
  return options.filter((o) => !options.some((other) => other !== o && dominates(other, o)));
}

/** Earliest arrival first; ties go to fewer changes, then lower risk. */
export function compareOptions(a: JourneyOption, b: JourneyOption): number {
  return a.arrivalTime - b.arrivalTime || a.changes - b.changes || RISK_RANK[a.risk] - RISK_RANK[b.risk];
}
