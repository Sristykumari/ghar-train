"use client";

import { useState } from "react";
import { QualityBadge } from "@/components/ui/badges";
import { useApi } from "@/lib/client/api-client";
import type { CoachPosition as CoachData } from "@/lib/domain/types";
import type { StopView } from "@/lib/services/views";

/** Colour family by coach code, always shown with the code itself. */
function coachTone(code: string): string {
  const c = code.toUpperCase();
  if (c === "ENG") return "bg-foreground text-background";
  if (/^(H|A|B|M|C|E|HA)\d/.test(c)) return "bg-info-bg text-info";
  if (/^S\d/.test(c)) return "bg-teal-bg text-teal";
  if (/^(GS|GEN|UR|D\d?)/.test(c)) return "bg-accent-bg text-accent";
  return "bg-surface-2 text-muted";
}

const LEGEND = [
  { tone: "bg-info-bg text-info", label: "AC (H, A, B, M…)" },
  { tone: "bg-teal-bg text-teal", label: "Sleeper (S)" },
  { tone: "bg-accent-bg text-accent", label: "General (GS)" },
  { tone: "bg-surface-2 text-muted", label: "Luggage / power (SLR, EOG, PC)" },
];

/** Where each coach stands, counted from the engine, at a chosen station. */
export function CoachPositionCard({ trainNumber, halts, defaultStation }: { trainNumber: string; halts: StopView[]; defaultStation: string | null }) {
  const [station, setStation] = useState(defaultStation ?? halts[0]?.stationCode ?? "");
  const [myCoach, setMyCoach] = useState("");
  const { data, error, loading } = useApi<CoachData | null>(station ? `/api/trains/${trainNumber}/coaches/${station}` : null);
  const mine = myCoach.trim().toUpperCase();
  const found = data?.coaches.find((c) => c.code.toUpperCase() === mine) ?? null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">At station</span>
          <select id="coach-station" value={station} onChange={(e) => setStation(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
            {halts.map((s) => (
              <option key={s.sequence} value={s.stationCode}>
                {s.stationName} ({s.stationCode})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Your coach (from your ticket)</span>
          <input
            id="my-coach"
            value={myCoach}
            onChange={(e) => setMyCoach(e.target.value)}
            placeholder="e.g. B3 or S5"
            autoCapitalize="characters"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 uppercase placeholder:normal-case"
          />
        </label>
      </div>

      {loading && <p className="text-sm text-muted">Loading coach order…</p>}
      {error && <p className="text-sm text-bad">{error.message}</p>}
      {!loading && !error && data === null && <p className="text-sm text-muted">Coach order is not available for this train from the current data source.</p>}

      {data && (
        <>
          {mine && (
            <p className={`rounded-xl px-3 py-2 text-sm font-medium ${found ? "bg-primary text-primary-fg" : "bg-warn-bg text-warn"}`}>
              {found
                ? `Coach ${found.code} is number ${found.position} from the engine${data.platform ? ` · usual platform ${data.platform}` : ""}.`
                : `${mine} is not in this train's coach list. Check your ticket.`}
            </p>
          )}
          <div className="overflow-x-auto pb-2">
            <ol className="flex w-max items-end gap-1" aria-label="Coach order from the engine">
              {data.coaches.map((c) => {
                const isMine = found && c.position === found.position;
                return (
                  <li
                    key={c.position}
                    title={c.name ?? c.code}
                    className={`flex h-12 min-w-11 flex-col items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold ${coachTone(c.code)} ${isMine ? "ring-4 ring-primary" : ""} ${c.code === "ENG" ? "rounded-l-2xl" : ""}`}
                  >
                    <span>{c.code}</span>
                    <span className="text-[10px] font-normal opacity-70">{c.position}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {LEGEND.map((l) => (
              <span key={l.label} className={`rounded-full px-2 py-0.5 ${l.tone}`}>
                {l.label}
              </span>
            ))}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <QualityBadge quality={data.source === "simulated" ? "simulated" : "scheduled"} />
            Counted from the engine. Which end of the platform the engine stops at depends on the train&apos;s direction — check the coach display board at the station. Coach order can change.
          </p>
        </>
      )}
    </div>
  );
}
