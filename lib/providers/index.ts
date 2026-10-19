import "server-only";
import { RailDataError } from "@/lib/domain/errors";
import { getServerConfig } from "@/lib/server/config";
import { withCache } from "./cached";
import { InMemoryProvider } from "./in-memory/provider";
import { createSampleDataset } from "./in-memory/sample-network";
import { RailRadarProvider } from "./railradar/provider";
import type { RailDataProvider } from "./types";

let instance: { key: string; provider: RailDataProvider } | null = null;

/** Returns the configured provider (cached per process). */
export function getRailDataProvider(): RailDataProvider {
  const cfg = getServerConfig();
  const key = `${cfg.provider}:${cfg.railRadarBaseUrl ?? ""}:${cfg.railRadarApiKey ? "k" : ""}`;
  if (instance?.key === key) return instance.provider;

  let provider: RailDataProvider;
  switch (cfg.provider) {
    case "railradar":
      if (!cfg.railRadarApiKey) {
        throw new RailDataError(
          "not_configured",
          "RAIL_DATA_PROVIDER is railradar but RAILRADAR_API_KEY is not set.",
        );
      }
      provider = withCache(new RailRadarProvider({ apiKey: cfg.railRadarApiKey, baseUrl: cfg.railRadarBaseUrl }));
      break;
    case "sample":
      provider = withCache(new InMemoryProvider(createSampleDataset()), { liveMs: 15_000 });
      break;
  }
  instance = { key, provider };
  return provider;
}

export type { RailDataProvider } from "./types";
