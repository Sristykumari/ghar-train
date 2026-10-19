"use client";

import Link from "next/link";
import { useState } from "react";
import { apiGet, ApiClientError } from "@/lib/client/api-client";
import type { Station } from "@/lib/domain/types";

type Nearby = Station & { distanceKm: number };

/**
 * Asks for location only when the user presses the button. Coordinates are
 * sent to our backend for this one lookup and not stored.
 */
export function NearbyStations() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "locating" }
    | { kind: "done"; stations: Nearby[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function locate() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "Location is not supported by this browser." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await apiGet<Nearby[]>(
            `/api/stations/nearby?lat=${pos.coords.latitude.toFixed(4)}&lng=${pos.coords.longitude.toFixed(4)}&radiusKm=50`,
          );
          setState({ kind: "done", stations: r.data });
        } catch (e) {
          setState({ kind: "error", message: e instanceof ApiClientError ? e.message : "Could not load nearby stations." });
        }
      },
      (err) =>
        setState({
          kind: "error",
          message: err.code === err.PERMISSION_DENIED ? "Location permission was denied. Search by name instead." : "Could not get your location.",
        }),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={state.kind === "locating"}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
      >
        {state.kind === "locating" ? "Finding your location…" : "📍 Stations near me"}
      </button>
      <div aria-live="polite">
        {state.kind === "error" && <p className="mt-2 text-sm text-bad">{state.message}</p>}
        {state.kind === "done" &&
          (state.stations.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No stations found within 50 km.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {state.stations.map((s) => (
                <li key={s.code}>
                  <Link href={`/station/${s.code}`} className="flex items-center justify-between px-3 py-2 hover:bg-surface-2">
                    <span>
                      <span className="font-mono font-semibold">{s.code}</span> <span>{s.name}</span>
                    </span>
                    <span className="text-sm text-muted tabular">{s.distanceKm} km</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
