import type { RailDataProvider } from "./types";

interface Entry {
  expires: number;
  value: Promise<unknown>;
}

export interface CacheTtls {
  /** Timetables and station lists change rarely. */
  staticMs: number;
  /** Live status: short TTL to protect upstream quotas without hiding fresh updates for long. */
  liveMs: number;
}

const DEFAULT_TTLS: CacheTtls = { staticMs: 6 * 3600_000, liveMs: 60_000 };

/**
 * Wraps a provider with an in-process TTL cache and in-flight request
 * de-duplication. Failed requests are not cached. This is per server
 * instance; use a shared cache (e.g. Redis) when running several instances.
 */
export function withCache(
  provider: RailDataProvider,
  ttls: Partial<CacheTtls> = {},
  now: () => number = Date.now,
  maxEntries = 2000,
): RailDataProvider {
  const t = { ...DEFAULT_TTLS, ...ttls };
  const store = new Map<string, Entry>();

  function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit && hit.expires > now()) return hit.value as Promise<T>;
    const value = load();
    store.set(key, { expires: now() + ttl, value });
    value.catch(() => store.delete(key));
    if (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    return value;
  }

  return {
    info: provider.info,
    searchStations: (q, l) => cached(`ss:${q.toLowerCase()}:${l}`, t.staticMs, () => provider.searchStations(q, l)),
    searchTrains: (q, l) => cached(`st:${q.toLowerCase()}:${l}`, t.staticMs, () => provider.searchTrains(q, l)),
    getStation: (c) => cached(`s:${c}`, t.staticMs, () => provider.getStation(c)),
    getTrainSchedule: (n) => cached(`ts:${n}`, t.staticMs, () => provider.getTrainSchedule(n)),
    getLiveStatus: (n, d) => cached(`ls:${n}:${d}`, t.liveMs, () => provider.getLiveStatus(n, d)),
    getStationSchedule: (c) => cached(`sch:${c}`, t.staticMs, () => provider.getStationSchedule(c)),
    getStationLiveBoard: (c, h) => cached(`slb:${c}:${h}`, t.liveMs, () => provider.getStationLiveBoard(c, h)),
    getExamples: provider.getExamples ? () => provider.getExamples!() : undefined,
    getTrainsBetween: (f, to) => cached(`tb:${f}:${to}`, t.staticMs, () => provider.getTrainsBetween(f, to)),
    getCoachPosition: (n, s) => cached(`cp:${n}:${s}`, t.staticMs, () => provider.getCoachPosition(n, s)),
    getStationLayout: (c) => cached(`lay:${c}`, t.staticMs, () => provider.getStationLayout(c)),
    getNearbyStations: (lat, lng, r, l) =>
      cached(`near:${lat.toFixed(3)}:${lng.toFixed(3)}:${r}:${l}`, t.staticMs, () =>
        provider.getNearbyStations(lat, lng, r, l),
      ),
  };
}
