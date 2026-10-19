/**
 * RailRadar adapter (https://railradar.in/docs).
 *
 * STATUS: field mapping follows RailRadar's published documentation as read
 * on 2026-10-16. It has NOT been verified against live responses because no
 * API key was available while building it. Run `npm run verify:railradar`
 * with a key before relying on it (see docs/DATA_SOURCES.md).
 *
 * RailRadar is an independent, crowd-powered service and is not affiliated
 * with Indian Railways, CRIS, NTES or IRCTC.
 */
import { RailDataError, type RailErrorCode } from "@/lib/domain/errors";
import { parseHHMM, DAY_MINUTES } from "@/lib/domain/time";
import type {
  CoachPosition,
  LiveBoardEntry,
  LiveBoardState,
  LiveStop,
  LiveTrainStatus,
  ProviderInfo,
  RunningState,
  ScheduleStop,
  Station,
  StationLayout,
  StationLiveBoard,
  StationScheduleEntry,
  StationSummary,
  TrainBetween,
  TrainSchedule,
  TrainSummary,
  Weekday,
} from "@/lib/domain/types";
import { WEEKDAYS } from "@/lib/domain/types";
import type { RailDataProvider } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any -- upstream JSON is untyped; every field is read defensively */

export interface RailRadarOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = "https://api.railradar.in/v1";

export class RailRadarProvider implements RailDataProvider {
  readonly info: ProviderInfo = {
    id: "railradar",
    name: "RailRadar API (third-party)",
    isSample: false,
    capabilities: {
      liveStatus: true,
      liveStationBoard: true,
      livePlatforms: true,
      trainPositions: true,
      stationLayouts: false,
      nearbyStations: false,
      trainsBetween: true,
      coachPositions: true,
    },
    notes: [
      "RailRadar is an independent service, not affiliated with Indian Railways, NTES or IRCTC.",
      "Platform numbers are shown only when RailRadar reports them.",
    ],
  };

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: RailRadarOptions) {
    if (!opts.apiKey) throw new RailDataError("not_configured", "RAILRADAR_API_KEY is not set.");
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ── HTTP ────────────────────────────────────────────────────────────────

  private async request(path: string, query: Record<string, string | undefined> = {}): Promise<any | null> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (cause) {
      throw new RailDataError("upstream_unavailable", "Could not reach the railway data service.", { cause });
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const code: RailErrorCode =
        res.status === 401 || res.status === 403
          ? "unauthorized"
          : res.status === 429
            ? "rate_limited"
            : res.status === 400
              ? "invalid_request"
              : "upstream_unavailable";
      const message =
        code === "rate_limited"
          ? "The railway data service rate limit was reached. Try again later."
          : code === "unauthorized"
            ? "The railway data service rejected our API key."
            : `The railway data service returned HTTP ${res.status}.`;
      throw new RailDataError(code, message, {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      });
    }

    let body: any;
    try {
      body = await res.json();
    } catch (cause) {
      throw new RailDataError("bad_upstream_response", "The railway data service returned invalid JSON.", { cause });
    }
    if (!body || body.success === false) {
      if (body?.error?.code === "NOT_FOUND") return null;
      throw new RailDataError("bad_upstream_response", body?.error?.message ?? "Unexpected response from data service.");
    }
    return body.data ?? null;
  }

  // ── Lookup ──────────────────────────────────────────────────────────────

  async searchStations(query: string, limit: number): Promise<StationSummary[]> {
    const data = await this.request("/lookup/search/stations", { q: query, limit: String(pickLimit(limit)) });
    return asArray(data)
      .filter((s) => s?.code && s?.name)
      .map((s) => ({ code: String(s.code).toUpperCase(), name: String(s.name), city: s.city ?? null }));
  }

  async searchTrains(query: string, limit: number): Promise<TrainSummary[]> {
    const data = await this.request("/lookup/search/trains", { q: query, limit: String(pickLimit(limit)) });
    return asArray(data)
      .filter((t) => t?.number && t?.name)
      .map((t) => ({
        number: String(t.number),
        name: String(t.name),
        sourceCode: codeOf(t.source),
        destinationCode: codeOf(t.destination),
      }));
  }

  async getStation(code: string): Promise<Station | null> {
    const matches = await this.searchStations(code, 10);
    const exact = matches.find((s) => s.code === code);
    return exact ? { ...exact, coordinates: null } : null;
  }

  // ── Trains ──────────────────────────────────────────────────────────────

  async getTrainSchedule(trainNumber: string): Promise<TrainSchedule | null> {
    const data = await this.request(`/trains/${encodeURIComponent(trainNumber)}`);
    if (!data) return null;
    return mapSchedule(data, trainNumber);
  }

  async getLiveStatus(trainNumber: string, journeyDate: string): Promise<LiveTrainStatus | null> {
    const data = await this.request(`/trains/${encodeURIComponent(trainNumber)}/live`, {
      date: journeyDate,
      includeCoordinates: "true",
    });
    if (!data) return null;
    return mapLiveStatus(data, trainNumber, journeyDate);
  }

  // ── Stations ────────────────────────────────────────────────────────────

  async getStationSchedule(stationCode: string): Promise<StationScheduleEntry[]> {
    const data = await this.request(`/stations/${encodeURIComponent(stationCode)}/trains`, {
      includeIntermediate: "false",
    });
    if (!data) throw new RailDataError("not_found", `Station ${stationCode} was not found.`);
    return asArray(data.trains).flatMap((row): StationScheduleEntry[] => {
      const t = row?.train;
      const s = row?.stop;
      if (!t?.number || !s) return [];
      return [
        {
          trainNumber: String(t.number),
          trainName: String(t.name ?? ""),
          sourceCode: codeOf(t.source) ?? "",
          destinationCode: codeOf(t.destination) ?? "",
          runDays: mapRunDays(t.runDays),
          arrival: dayTime(s.arrival, s.arrivalDay ?? s.day),
          departure: dayTime(s.departure, s.departureDay ?? s.day),
          isHalt: s.isHalt !== false,
          scheduledPlatform: s.platform ? String(s.platform) : null,
        },
      ];
    });
  }

  async getStationLiveBoard(stationCode: string, hours: number): Promise<StationLiveBoard | null> {
    const allowed = [2, 4, 6, 8];
    const h = allowed.find((x) => x >= hours) ?? 8;
    const data = await this.request(`/stations/${encodeURIComponent(stationCode)}/live`, { hours: String(h) });
    if (!data) return null;
    const entries = asArray(data.trains).flatMap((row): LiveBoardEntry[] => {
      const t = row?.train;
      const live = row?.live;
      if (!t?.number || !live) return [];
      const expectedDeparture = parseInstant(live.expectedDepartureTime);
      const delay = numOrNull(live.delayMinutes);
      const expectedArrival = parseInstant(live.expectedArrivalTime);
      return [
        {
          trainNumber: String(t.number),
          trainName: t.name ?? null,
          journeyDate: typeof row.journeyDate === "string" ? row.journeyDate : null,
          state: mapBoardState(live.type),
          expectedArrival,
          expectedDeparture,
          delayMinutes: delay,
          livePlatform: live.platform ? String(live.platform) : null,
        },
      ];
    });
    return { stationCode, source: "live", fetchedAt: Date.now(), entries };
  }

  async getTrainsBetween(from: string, to: string): Promise<TrainBetween[]> {
    const data = await this.request(`/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
    if (!data) return [];
    return mapTrainsBetween(data);
  }

  async getCoachPosition(trainNumber: string, stationCode: string): Promise<CoachPosition | null> {
    const data = await this.request(`/trains/${encodeURIComponent(trainNumber)}/coaches/${encodeURIComponent(stationCode)}`);
    if (!data) return null;
    return mapCoachPosition(data, trainNumber, stationCode);
  }

  async getStationLayout(): Promise<StationLayout | null> {
    // RailRadar does not publish track layouts.
    return null;
  }

  async getNearbyStations(): Promise<never> {
    throw new RailDataError("unsupported", "Nearby station search is not available from this data source yet.");
  }
}

// ── Mapping helpers (exported for tests) ──────────────────────────────────

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function pickLimit(limit: number) {
  return [5, 10, 20, 50].find((x) => x >= limit) ?? 50;
}

function codeOf(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.toUpperCase();
  return v.code ? String(v.code).toUpperCase() : null;
}

function numOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function mapRunDays(v: any): Weekday[] {
  const days = asArray(v)
    .map((d) => String(d).slice(0, 3).toLowerCase())
    .filter((d): d is Weekday => (WEEKDAYS as string[]).includes(d));
  return days.length ? days : [...WEEKDAYS];
}

/** "HH:MM" + 1-based journey day → minutes from origin-day midnight. */
function dayTime(hhmm: any, day: any): number | null {
  const m = parseHHMM(typeof hhmm === "string" ? hhmm : null);
  if (m == null) return null;
  const d = numOrNull(day);
  return (d && d >= 1 ? d - 1 : 0) * DAY_MINUTES + m;
}

function parseInstant(v: any): number | null {
  if (typeof v !== "string" || !v) return null;
  // Only accept full timestamps; a bare "HH:MM" has no date and is handled by the caller.
  if (!/\d{4}-\d{2}-\d{2}T/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function mapBoardState(v: any): LiveBoardState {
  switch (v) {
    case "at-station":
      return "at_station";
    case "upcoming":
      return "upcoming";
    case "departed":
      return "departed";
    default:
      return "scheduled";
  }
}

export function mapSchedule(data: any, trainNumber: string): TrainSchedule {
  const t = data.train ?? {};
  const route = asArray(data.route);
  // When the day field is missing, roll the day forward whenever the clock goes backwards.
  let dayOffset = 0;
  let last = -1;
  const stops: ScheduleStop[] = route.map((r, i) => {
    const arrRaw = parseHHMM(r.arrival);
    const depRaw = parseHHMM(r.departure);
    const withDay = (raw: number | null, day: any) => {
      if (raw == null) return null;
      const d = numOrNull(day);
      if (d && d >= 1) return (d - 1) * DAY_MINUTES + raw;
      let v = dayOffset + raw;
      if (v < last) {
        dayOffset += DAY_MINUTES;
        v += DAY_MINUTES;
      }
      return v;
    };
    const arrival = withDay(arrRaw, r.arrivalDay ?? r.day);
    if (arrival != null) last = arrival;
    const departure = withDay(depRaw, r.departureDay ?? r.day);
    if (departure != null) last = departure;
    const code = codeOf(r.station) ?? codeOf(r.stationCode) ?? "";
    return {
      sequence: numOrNull(r.sequence) ?? i + 1,
      stationCode: code,
      stationName: String(r.station?.name ?? r.stationName ?? code),
      arrival: i === 0 ? null : arrival,
      departure: i === route.length - 1 ? null : departure,
      isHalt: r.isHalt !== false,
      distanceKm: numOrNull(r.distance),
      scheduledPlatform: r.platform ? String(r.platform) : null,
      coordinates:
        numOrNull(r.lat) != null && numOrNull(r.lng) != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
    };
  });
  return {
    number: String(t.number ?? trainNumber),
    name: String(t.name ?? ""),
    type: t.type ?? null,
    sourceCode: codeOf(t.source) ?? stops[0]?.stationCode ?? "",
    destinationCode: codeOf(t.destination) ?? stops[stops.length - 1]?.stationCode ?? "",
    runDays: mapRunDays(t.runDays),
    stops,
  };
}

function mapRunningState(status: any, stops: LiveStop[]): RunningState {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("not") && s.includes("start")) return "not_started";
  if (s.includes("complete") || s.includes("reached") || s.includes("terminated")) return "completed";
  if (s.includes("at") && s.includes("station")) return "at_station";
  if (s.includes("running") || s.includes("departed") || s.includes("arrived")) return "running";
  if (stops.length && stops.every((x) => x.status === "upcoming")) return "not_started";
  return "unknown";
}

function mapStopStatus(v: any, hasActualDep: boolean, hasActualArr: boolean): LiveStop["status"] {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("skip") || s.includes("divert")) return "skipped";
  if (s.includes("depart") || hasActualDep) return "departed";
  if (s.includes("arriv") || hasActualArr) return "arrived";
  if (s.includes("upcoming") || s.includes("expected") || s === "") return "upcoming";
  return "unknown";
}

export function mapLiveStatus(data: any, trainNumber: string, journeyDate: string): LiveTrainStatus {
  const route = asArray(data.route);
  const stops: LiveStop[] = route.map((r) => {
    const actualArrival = parseInstant(r.actualArrival);
    const actualDeparture = parseInstant(r.actualDeparture);
    const schedArr = parseInstant(r.scheduledArrival);
    const schedDep = parseInstant(r.scheduledDeparture);
    const dArr = numOrNull(r.delayArrival);
    const dDep = numOrNull(r.delayDeparture);
    return {
      stationCode: codeOf(r.stationCode) ?? codeOf(r.station) ?? "",
      actualArrival,
      actualDeparture,
      expectedArrival: actualArrival ?? (schedArr != null ? schedArr + (dArr ?? 0) * 60_000 : null),
      expectedDeparture: actualDeparture ?? (schedDep != null ? schedDep + (dDep ?? 0) * 60_000 : null),
      delayArrivalMinutes: dArr,
      delayDepartureMinutes: dDep,
      status: mapStopStatus(r.status, actualDeparture != null, actualArrival != null),
      livePlatform: r.platform ? String(r.platform) : null,
    };
  });

  const loc = data.currentLocation ?? {};
  const currentCode = codeOf(loc.stationCode);
  const idx = route.findIndex((r) => (codeOf(r.stationCode) ?? codeOf(r.station)) === currentCode);
  let position: LiveTrainStatus["position"] = null;
  if (idx >= 0) {
    const a = route[idx];
    const b = route[idx + 1];
    const p = numOrNull(loc.segmentProgress);
    const aLat = numOrNull(a?.lat);
    const aLng = numOrNull(a?.lng);
    if (aLat != null && aLng != null) {
      const bLat = numOrNull(b?.lat);
      const bLng = numOrNull(b?.lng);
      const interp = p != null && bLat != null && bLng != null;
      position = {
        lat: interp ? aLat + (bLat - aLat) * p : aLat,
        lng: interp ? aLng + (bLng - aLng) * p : aLng,
        // Only "actual" when RailRadar says so; otherwise it is an interpolation.
        isActual: loc.isActualPosition === true && !interp,
      };
    }
  }

  const notices = asArray(data.exceptions)
    .map((e) => (typeof e === "string" ? e : (e?.message ?? e?.type)))
    .filter(Boolean)
    .map(String);

  const updated = parseInstant(data.lastUpdatedAt);
  return {
    trainNumber: String(data.trainNumber ?? trainNumber),
    journeyDate: typeof data.startDate === "string" ? data.startDate.slice(0, 10) : journeyDate,
    source: "live",
    // Without a timestamp we cannot claim freshness; treat as very old so the UI marks it stale.
    lastUpdatedAt: updated ?? 0,
    runningState: mapRunningState(data.status, stops),
    currentStationCode: currentCode,
    segmentProgress: numOrNull(loc.segmentProgress),
    delayMinutes: numOrNull(data.delayMinutes),
    stops,
    position,
    speedKmh: numOrNull(loc.speedKmh),
    notices,
  };
}

export function mapTrainsBetween(data: any): TrainBetween[] {
  const fromInfo = data.from ?? {};
  const toInfo = data.to ?? {};
  return asArray(data.trains).flatMap((row): TrainBetween[] => {
    const t = row?.train;
    const dep = dayTime(row?.from?.departure, row?.from?.day);
    const arr = dayTime(row?.to?.arrival, row?.to?.day);
    if (!t?.number || dep == null || arr == null || arr < dep) return [];
    return [
      {
        trainNumber: String(t.number),
        trainName: String(t.name ?? ""),
        type: t.type ?? null,
        runDays: mapRunDays(t.runDays),
        fromCode: codeOf(fromInfo) ?? "",
        fromName: String(fromInfo.name ?? fromInfo.code ?? ""),
        toCode: codeOf(toInfo) ?? "",
        toName: String(toInfo.name ?? toInfo.code ?? ""),
        departure: dep,
        arrival: arr,
        distanceKm: numOrNull(row.distance),
        haltsBetween: numOrNull(row.totalHaltsBetween),
      },
    ];
  });
}

export function mapCoachPosition(data: any, trainNumber: string, stationCode: string): CoachPosition | null {
  let coaches = asArray(data.coaches)
    .filter((c) => c?.code)
    .map((c, i) => ({
      position: numOrNull(c.position) ?? i + 1,
      code: String(c.code),
      classType: c.classType ? String(c.classType) : null,
      name: c.name ? String(c.name) : null,
    }))
    .sort((a, b) => a.position - b.position);
  if (!coaches.length && typeof data.formation === "string") {
    coaches = data.formation
      .split("-")
      .map((code: string) => code.trim())
      .filter(Boolean)
      .map((code: string, i: number) => ({ position: i + 1, code, classType: null, name: null }));
  }
  if (!coaches.length) return null;
  return {
    trainNumber: String(data.trainNumber ?? trainNumber),
    stationCode: codeOf(data.stationCode) ?? stationCode,
    platform: data.platform ? String(data.platform) : null,
    coaches,
    source: "provider",
  };
}
