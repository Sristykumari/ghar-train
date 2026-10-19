"use client";

import { useEffect, useState } from "react";
import type { PlanResult } from "@/lib/planner/types";
import { apiPost, ApiClientError } from "./api-client";

export interface PlanQuery {
  trainNumber: string;
  journeyDate?: string;
  currentStation: string;
  destination: string;
  minTransferMinutes: number;
  maxChanges: number;
}

/** Reads planner inputs from the URL (shareable, survives reloads). */
export function parsePlanQuery(sp: URLSearchParams): PlanQuery | null {
  const train = sp.get("train");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!train || !from || !to) return null;
  return {
    trainNumber: train,
    journeyDate: sp.get("date") || undefined,
    currentStation: from.toUpperCase(),
    destination: to.toUpperCase(),
    minTransferMinutes: Number(sp.get("mt")) || 15,
    maxChanges: Number(sp.get("mc")) || 2,
  };
}

export function planQueryString(q: PlanQuery): string {
  const p = new URLSearchParams({
    train: q.trainNumber,
    from: q.currentStation,
    to: q.destination,
    mt: String(q.minTransferMinutes),
    mc: String(q.maxChanges),
  });
  if (q.journeyDate) p.set("date", q.journeyDate);
  return p.toString();
}

const CACHE_MS = 90_000;

function readCache(key: string): PlanResult | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, result } = JSON.parse(raw) as { at: number; result: PlanResult };
    return Date.now() - at < CACHE_MS ? result : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, result: PlanResult) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), result }));
  } catch {
    // storage full or blocked — caching is only a convenience
  }
}

/**
 * Runs the planner for a query. Results are cached in sessionStorage for
 * 90 s so the list, comparison and details screens show the same plan
 * without re-querying the data provider.
 */
export function usePlan(query: PlanQuery | null) {
  const key = query ? `plan:${planQueryString(query)}` : null;
  const [state, setState] = useState<{ key: string | null; result: PlanResult | null; error: ApiClientError | null; loading: boolean }>({
    key: null,
    result: null,
    error: null,
    loading: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key || !query) return;
    const cached = nonce === 0 ? readCache(key) : null;
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from session cache
      setState({ key, result: cached, error: null, loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState({ key, result: null, error: null, loading: true });
    apiPost<PlanResult>("/api/journeys/alternatives", query, ctrl.signal)
      .then((r) => {
        writeCache(key, r.data);
        setState({ key, result: r.data, error: null, loading: false });
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setState({ key, result: null, error: e instanceof ApiClientError ? e : new ApiClientError("unknown", "Unexpected error.", 0), loading: false });
      });
    return () => ctrl.abort();
    // query is derived from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { ...state, rerun: () => setNonce((n) => n + 1) };
}
