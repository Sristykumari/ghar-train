import { isRailDataError } from "@/lib/domain/errors";
import type { DataQuality } from "@/lib/domain/types";
import type { Freshness, UpstreamIssue } from "./views";

export function assessFreshness(
  source: "live" | "simulated" | null,
  lastUpdatedAt: number | null,
  now: number,
  staleAfterMinutes: number,
): Freshness {
  if (!source) {
    return {
      quality: "scheduled",
      lastUpdatedAt: null,
      ageMinutes: null,
      stale: false,
      message: "Live running status unavailable. Showing the published timetable.",
    };
  }
  const ageMinutes = lastUpdatedAt && lastUpdatedAt > 0 ? Math.max(0, Math.round((now - lastUpdatedAt) / 60_000)) : null;
  const stale = ageMinutes == null || ageMinutes > staleAfterMinutes;
  const quality: DataQuality = source === "simulated" ? "simulated" : stale ? "estimated" : "live";
  const prefix = source === "simulated" ? "Simulated sample data" : stale ? "Live data may be outdated" : "Live";
  const when = ageMinutes == null ? "update time unknown" : ageMinutes === 0 ? "updated just now" : `updated ${ageMinutes} min ago`;
  return { quality, lastUpdatedAt: lastUpdatedAt || null, ageMinutes, stale, message: `${prefix} · ${when}` };
}

/** Quality for times derived from live data at a stop not yet reached. */
export function projectedQuality(base: DataQuality): DataQuality {
  return base === "live" ? "estimated" : base;
}

export function toIssue(e: unknown): UpstreamIssue {
  if (isRailDataError(e)) return { code: e.code, message: e.message, retryAfterSeconds: e.retryAfterSeconds };
  return { code: "internal", message: "Unexpected error while fetching live data." };
}
