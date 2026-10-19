import "server-only";
import { RailDataError } from "@/lib/domain/errors";

export type ProviderId = "sample" | "railradar";

export interface ServerConfig {
  provider: ProviderId;
  railRadarApiKey: string | undefined;
  railRadarBaseUrl: string | undefined;
  staleAfterMinutes: number;
  plannerMaxStationLookups: number;
}

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Reads server-side configuration. Secrets are only ever read here, on the
 * server; nothing in this module is exposed to the browser.
 */
export function getServerConfig(): ServerConfig {
  const raw = process.env.RAIL_DATA_PROVIDER?.trim().toLowerCase();
  let provider: ProviderId;
  if (raw === "railradar" || raw === "sample") provider = raw;
  else if (!raw && process.env.NODE_ENV !== "production") provider = "sample";
  else if (!raw) {
    // Production must choose a source explicitly so sample data is never served by accident.
    throw new RailDataError(
      "not_configured",
      "No railway data source is configured. Set RAIL_DATA_PROVIDER (railradar or sample).",
    );
  } else {
    throw new RailDataError("not_configured", `Unknown RAIL_DATA_PROVIDER "${raw}".`);
  }

  return {
    provider,
    railRadarApiKey: process.env.RAILRADAR_API_KEY || undefined,
    railRadarBaseUrl: process.env.RAILRADAR_BASE_URL || undefined,
    staleAfterMinutes: intEnv("LIVE_STALE_AFTER_MINUTES", 15),
    plannerMaxStationLookups: intEnv("PLANNER_MAX_STATION_LOOKUPS", 12),
  };
}
