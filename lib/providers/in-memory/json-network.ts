/**
 * Builds the demo dataset from a JSON description (data/demo-network.json).
 * Station places are real; trains are invented and always labelled "Demo".
 * Distances come from coordinates (great-circle × 1.2 to approximate track).
 */
import { haversineKm } from "@/lib/domain/geo";
import { parseHHMM } from "@/lib/domain/time";
import type { Station, StationLayout, TrainSchedule, Weekday } from "@/lib/domain/types";
import { WEEKDAYS } from "@/lib/domain/types";
import { buildSampleTrain, type LineStation } from "./builder";
import type { InMemoryDataset } from "./provider";
import type { SimulationProfile } from "./simulator";

const TRACK_FACTOR = 1.2;

export interface JsonStation {
  code: string;
  name: string;
  city?: string;
  lat: number;
  lng: number;
  platforms?: number;
}

export interface JsonTrain {
  number: string;
  name: string;
  type?: string;
  route: string[];
  departures: string[];
  returnDepartures?: string[];
  speedKmph: number;
  halt?: number;
  halts?: Record<string, number>;
  runDays?: Weekday[];
  delayMinutes?: number;
  noLive?: number[];
  staleLive?: number[];
}

export interface JsonNetwork {
  label?: string;
  stations: JsonStation[];
  layouts?: StationLayout[];
  coachFormations?: Record<string, string[]>;
  trains: JsonTrain[];
}

class NetworkError extends Error {
  constructor(msg: string) {
    super(`demo-network.json: ${msg}`);
  }
}

/** Small deterministic hash so platform numbers stay the same between restarts. */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildJsonNetwork(json: JsonNetwork): InMemoryDataset {
  if (!Array.isArray(json?.stations) || !Array.isArray(json?.trains)) throw new NetworkError("needs 'stations' and 'trains' arrays");

  const stations: Station[] = json.stations.map((s, i) => {
    if (!/^[A-Z]{1,10}$/.test(s.code ?? "") || !s.name || typeof s.lat !== "number" || typeof s.lng !== "number") {
      throw new NetworkError(`station #${i + 1} needs code (CAPITALS), name, lat and lng`);
    }
    return { code: s.code, name: s.name, city: s.city ?? null, coordinates: { lat: s.lat, lng: s.lng } };
  });
  const byCode = new Map(stations.map((s) => [s.code, s]));
  const platformCount = new Map(json.stations.map((s) => [s.code, Math.max(1, s.platforms ?? 3)]));

  const trains: TrainSchedule[] = [];
  const profiles = new Map<string, SimulationProfile | null>();
  const types = new Map<string, string>();
  const seen = new Set<string>();

  for (const t of json.trains) {
    if (!/^\d{5}$/.test(t.number ?? "")) throw new NetworkError(`train "${t.name}" needs a 5-digit number`);
    if (!Array.isArray(t.route) || t.route.length < 2) throw new NetworkError(`train ${t.number} needs at least two stations in 'route'`);
    if (!(t.speedKmph > 0)) throw new NetworkError(`train ${t.number} needs 'speedKmph'`);

    const stops = t.route.map((raw) => ({ code: raw.replace(/^~/, ""), pass: raw.startsWith("~") }));
    for (const s of stops) if (!byCode.has(s.code)) throw new NetworkError(`train ${t.number} uses unknown station ${s.code}`);
    if (stops[0].pass || stops[stops.length - 1].pass) throw new NetworkError(`train ${t.number} must stop at its first and last station`);

    const make = (dir: "out" | "back", times: string[]) => {
      const ordered = dir === "out" ? stops : [...stops].reverse();
      const line: LineStation[] = [];
      let km = 0;
      ordered.forEach((s, i) => {
        if (i > 0) km += haversineKm(byCode.get(ordered[i - 1].code)!.coordinates!, byCode.get(s.code)!.coordinates!) * TRACK_FACTOR;
        line.push({ code: s.code, km: Math.round(km) });
      });
      const halts = Object.fromEntries(ordered.slice(1, -1).filter((s) => !s.pass).map((s) => [s.code, t.halts?.[s.code] ?? t.halt ?? 3]));

      times.forEach((time, idx) => {
        const dep = parseHHMM(time);
        if (dep == null) throw new NetworkError(`train ${t.number} has a bad departure time "${time}" (use HH:MM)`);
        const number = String(Number(t.number) + (dir === "back" ? 1 : 0) + idx * 2);
        if (seen.has(number)) throw new NetworkError(`train number ${number} is used twice; give trains numbers at least 100 apart`);
        seen.add(number);
        const platforms = Object.fromEntries(ordered.map((s) => [s.code, String((hash(number + s.code) % platformCount.get(s.code)!) + 1)]));
        trains.push(
          buildSampleTrain(
            { number, name: t.name, type: t.type, line, halts, departure: dep, speedKmph: t.speedKmph, runDays: t.runDays ?? [...WEEKDAYS], platforms },
            byCode,
          ),
        );
        types.set(number, t.type ?? "Express");
        profiles.set(
          number,
          t.noLive?.includes(idx)
            ? null
            : { delayMinutes: t.delayMinutes ?? 0, updateLagMinutes: t.staleLive?.includes(idx) ? 45 : 2, livePlatforms: platforms },
        );
      });
    };
    make("out", t.departures ?? []);
    make("back", t.returnDepartures ?? []);
  }

  const formations = json.coachFormations ?? {};
  return {
    label: json.label ?? "Demo network",
    stations,
    trains,
    layouts: json.layouts ?? [],
    liveProfile: (n) => profiles.get(n) ?? null,
    coaches: (t) => formations[types.get(t.number) ?? ""] ?? formations.Express ?? null,
  };
}
