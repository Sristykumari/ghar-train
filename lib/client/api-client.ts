"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiFailure, ApiMeta, ApiSuccess } from "@/lib/server/api";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta;
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  let body: ApiSuccess<T> | ApiFailure | null = null;
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (!body) throw new ApiClientError("bad_response", "The server returned an unreadable response.", res.status);
  if (!body.ok) {
    throw new ApiClientError(body.error.code, body.error.message, res.status, body.error.retryAfterSeconds);
  }
  return { data: body.data, meta: body.meta };
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", "Could not reach the server. Check your connection.", 0);
  }
  return parse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", "Could not reach the server. Check your connection.", 0);
  }
  return parse<T>(res);
}

export interface UseApiState<T> {
  data: T | null;
  meta: ApiMeta | null;
  error: ApiClientError | null;
  loading: boolean;
  refreshing: boolean;
  fetchedAt: number | null;
  /** Set when the network failed and a copy saved on this device is shown instead. */
  offlineSavedAt: number | null;
  refresh: () => void;
}

const OFFLINE_PREFIX = "ghar-train:cache:";

function saveOffline(path: string, value: { data: unknown; meta: ApiMeta; at: number }) {
  try {
    localStorage.setItem(OFFLINE_PREFIX + path, JSON.stringify(value));
  } catch {
    // storage full or blocked — offline copy is only a convenience
  }
}

function loadOffline<T>(path: string): { data: T; meta: ApiMeta; at: number } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * GETs a backend route and optionally polls it.
 * - Polling pauses while the tab is hidden and refreshes as soon as the user comes back.
 * - An automatic refresh never cancels a request that is still loading (important on slow
 *   mobile data on a train); only a new path or a manual refresh does.
 * - A failed refresh keeps showing the last good data alongside the error.
 */
export function useApi<T>(path: string | null, opts: { refreshMs?: number; offline?: boolean } = {}): UseApiState<T> {
  const [state, setState] = useState<Omit<UseApiState<T>, "refresh">>({
    data: null,
    meta: null,
    error: null,
    loading: !!path,
    refreshing: false,
    fetchedAt: null,
    offlineSavedAt: null,
  });
  const offline = !!opts.offline;
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const lastPath = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    const isNewPath = lastPath.current !== path;
    lastPath.current = path;
    inFlight.current = true;
    setState((s) =>
      isNewPath
        ? { data: null, meta: null, error: null, loading: true, refreshing: false, fetchedAt: null, offlineSavedAt: null }
        : { ...s, refreshing: true },
    );
    apiGet<T>(path, ctrl.signal)
      .then((r) => {
        const at = Date.now();
        if (offline) saveOffline(path, { data: r.data, meta: r.meta, at });
        setState({ data: r.data, meta: r.meta, error: null, loading: false, refreshing: false, fetchedAt: at, offlineSavedAt: null });
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        const err = e instanceof ApiClientError ? e : new ApiClientError("unknown", "Unexpected error.", 0);
        setState((s) => {
          if (offline && !s.data && err.code === "network") {
            const saved = loadOffline<T>(path);
            if (saved) return { data: saved.data, meta: saved.meta, error: err, loading: false, refreshing: false, fetchedAt: saved.at, offlineSavedAt: saved.at };
          }
          return { ...s, error: err, loading: false, refreshing: false };
        });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) inFlight.current = false;
      });
    return () => ctrl.abort();
  }, [path, tick, offline]);

  useEffect(() => {
    if (!path || !opts.refreshMs) return;
    const autoRefresh = () => {
      if (document.visibilityState === "visible" && !inFlight.current) refresh();
    };
    const id = setInterval(autoRefresh, opts.refreshMs);
    document.addEventListener("visibilitychange", autoRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", autoRefresh);
    };
  }, [path, opts.refreshMs, refresh]);

  return { ...state, refresh };
}
