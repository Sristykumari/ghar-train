"use client";

import { useSyncExternalStore } from "react";
import type { Orientation } from "@/lib/services/orientation";

/**
 * The passenger's left/right setting per station, kept only in this browser.
 * If storage is blocked it still works for the current visit.
 */
const KEY = "ghar-train:orientation";
const listeners = new Set<() => void>();
let cache: Record<string, Orientation> | null = null;
const EMPTY: Orientation = {};

function readAll(): Record<string, Orientation> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function saveOrientation(stationCode: string, orientation: Orientation | null) {
  const next = { ...readAll() };
  if (orientation && Object.keys(orientation).length) next[stationCode] = orientation;
  else delete next[stationCode];
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — keep for this visit only
  }
  listeners.forEach((l) => l());
}

export function useOrientation(stationCode: string): Orientation {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readAll()[stationCode] ?? EMPTY,
    () => EMPTY,
  );
}
