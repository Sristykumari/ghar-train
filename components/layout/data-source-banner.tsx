"use client";

import { useApi } from "@/lib/client/api-client";
import type { ProviderInfo } from "@/lib/domain/types";

/**
 * Always-visible notice about where data comes from. Sample data is called
 * out loudly; a missing configuration is reported rather than hidden.
 */
export function DataSourceBanner() {
  const { data, error } = useApi<ProviderInfo>("/api/meta");
  if (error?.code === "not_configured") {
    return (
      <div role="alert" className="bg-bad-bg px-4 py-2 text-center text-sm font-medium text-bad">
        No railway data source configured. {error.message}
      </div>
    );
  }
  if (!data?.isSample) return null;
  return (
    <div role="note" className="bg-sim-bg px-4 py-2 text-center text-sm text-sim">
      <strong>Demo data</strong> · real stations, invented trains (9xxxx) with simulated live status.
    </div>
  );
}
