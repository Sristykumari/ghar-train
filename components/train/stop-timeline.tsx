"use client";

import { useState } from "react";
import { PlatformTag, QualityBadge } from "@/components/ui/badges";
import { formatTime } from "@/lib/client/format";
import type { DataQuality } from "@/lib/domain/types";
import type { StopView } from "@/lib/services/views";

const DOT: Record<StopView["progress"], string> = {
  departed: "bg-primary border-primary",
  at_station: "bg-ok border-ok ring-4 ring-ok-bg",
  next: "bg-surface border-accent-solid ring-4 ring-accent-bg",
  upcoming: "bg-surface border-border",
  skipped: "bg-surface border-bad",
  unknown: "bg-surface border-border",
};

function Delay({ minutes }: { minutes: number | null }) {
  if (minutes == null) return null;
  if (Math.abs(minutes) <= 5) return <span className="text-xs font-semibold text-ok">on time</span>;
  const tone = minutes < 0 ? "text-info" : minutes >= 30 ? "text-bad" : "text-warn";
  return (
    <span className={`text-xs font-semibold ${tone}`} title={`${Math.abs(minutes)} minutes ${minutes < 0 ? "early" : "late"}`}>
      {minutes > 0 ? "+" : "−"}
      {Math.abs(minutes)}m
    </span>
  );
}

function Time({ label, scheduled, expected }: { label: string; scheduled: number | null; expected: number | null }) {
  if (scheduled == null && expected == null) return null;
  const changed = expected != null && scheduled != null && Math.abs(expected - scheduled) >= 60_000;
  return (
    <span className="tabular">
      <span className="text-xs text-muted">{label} </span>
      <span className="font-semibold">{formatTime(expected ?? scheduled)}</span>
      {changed && (
        <span className="ml-1 text-xs text-muted line-through" aria-label={`timetable ${formatTime(scheduled)}`}>
          {formatTime(scheduled)}
        </span>
      )}
    </span>
  );
}

/**
 * Vertical journey timeline. Stops already passed collapse behind a button so
 * the next stop is visible straight away. A stop's data source is only shown
 * when it differs from the train's overall source.
 */
export function StopTimeline({ stops, showAll, baseQuality }: { stops: StopView[]; showAll: boolean; baseQuality: DataQuality }) {
  const [showPassed, setShowPassed] = useState(false);
  const visible = showAll ? stops : stops.filter((s) => s.isHalt);
  const lastPassed = visible.reduce((acc, s, i) => (s.progress === "departed" ? i : acc), -1);
  // Keep the last passed stop visible for context.
  const hiddenCount = showPassed ? 0 : Math.max(0, lastPassed);
  const shown = visible.slice(hiddenCount);

  return (
    <div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowPassed(true)}
          className="mb-3 ml-8 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-primary hover:bg-info-bg"
        >
          Show {hiddenCount} earlier stop{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
      <ol>
        {shown.map((s, i) => {
          const last = i === shown.length - 1;
          const newDay = i > 0 && s.day !== shown[i - 1].day;
          const passed = s.progress === "departed";
          return (
            <li key={`${s.sequence}-${s.stationCode}`}>
              {newDay && (
                <p className="my-1 ml-8 text-xs font-semibold tracking-wide text-accent uppercase">Day {s.day}</p>
              )}
              <div className="relative flex gap-3 pb-4">
                <div className="relative flex w-5 shrink-0 justify-center">
                  {!last && <span aria-hidden className={`absolute top-4 bottom-0 w-0.5 ${passed ? "bg-primary" : "bg-border"}`} />}
                  <span
                    aria-hidden
                    className={s.isHalt ? `relative mt-1 h-3.5 w-3.5 rounded-full border-2 ${DOT[s.progress]}` : "relative mt-1.5 h-2 w-2 rounded-full bg-border"}
                  />
                </div>
                <div className={`min-w-0 flex-1 ${passed ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className={s.isHalt ? "font-medium" : "text-sm text-muted"}>
                      {s.stationName} <span className="font-mono text-xs text-muted">{s.stationCode}</span>
                      {!s.isHalt && <span className="ml-1 text-xs text-muted">(passes)</span>}
                    </p>
                    {s.isHalt && <PlatformTag platform={s.platform} quietFor={baseQuality} />}
                  </div>
                  {s.isHalt && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <Time label="Arr" scheduled={s.scheduledArrival} expected={s.expectedArrival} />
                      <Time label="Dep" scheduled={s.scheduledDeparture} expected={s.expectedDeparture} />
                      <Delay minutes={s.delayMinutes} />
                      {s.timeQuality !== baseQuality && <QualityBadge quality={s.timeQuality} />}
                      {s.progress === "next" && <span className="rounded-full bg-accent-bg px-2 py-0.5 text-xs font-semibold text-accent">Next stop</span>}
                      {s.progress === "at_station" && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">Train is here</span>}
                      {s.progress === "skipped" && <span className="text-xs font-semibold text-bad">Skipped</span>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
