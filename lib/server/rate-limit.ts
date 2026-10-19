import { RailDataError } from "@/lib/domain/errors";

/**
 * Fixed-window, in-memory limiter keyed by client. Protects expensive
 * endpoints (and the upstream quota behind them) from bursts. Per-process
 * only — use a shared store when running more than one instance.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();
  return function check(key: string) {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10_000) hits.clear();
      return;
    }
    if (h.count >= limit) {
      throw new RailDataError("rate_limited", "Too many searches. Please wait a moment and try again.", {
        retryAfterSeconds: Math.ceil((h.start + windowMs - t) / 1000),
      });
    }
    h.count++;
  };
}
