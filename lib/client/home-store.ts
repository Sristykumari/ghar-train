"use client";

import { useSyncExternalStore } from "react";
import type { HomeStation } from "@/lib/services/going-home";

/**
 * The passenger's home station, kept only in this browser.
 * If storage is blocked it still works for the current visit.
 */
const KEY = "ghar-train:home";
const listeners = new Set<() => void>();
// `undefined` = not read yet; `null` = no home saved.
let cache: HomeStation | null | undefined;

function read(): HomeStation | null {
  if (cache !== undefined) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    cache = parsed && typeof parsed.code === "string" && typeof parsed.name === "string" ? { code: parsed.code, name: parsed.name } : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveHomeStation(home: HomeStation | null) {
  cache = home;
  try {
    if (home) localStorage.setItem(KEY, JSON.stringify(home));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable — keep for this visit only
  }
  listeners.forEach((l) => l());
}

export function useHomeStation(): HomeStation | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
}
