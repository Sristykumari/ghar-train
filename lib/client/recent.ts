"use client";

import { useSyncExternalStore } from "react";

/**
 * Recently viewed trains and stations, kept only in this browser
 * (localStorage). Purely a convenience: if storage is blocked the list is
 * simply empty.
 */
export interface RecentItem {
  kind: "train" | "station";
  id: string;
  label: string;
}

const KEY = "ghar-train:recent";
const MAX = 6;
const listeners = new Set<() => void>();
let cache: RecentItem[] | null = null;
const EMPTY: RecentItem[] = [];

function read(): RecentItem[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    cache = [];
  }
  return cache!;
}

export function rememberRecent(item: RecentItem) {
  const next = [item, ...read().filter((x) => !(x.kind === item.kind && x.id === item.id))].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — keep in memory for this visit only
  }
  listeners.forEach((l) => l());
}

export function useRecent(): RecentItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
}
