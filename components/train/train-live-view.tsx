"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DelayPill, PlatformTag, QualityBadge } from "@/components/ui/badges";
import { Card, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { useApi } from "@/lib/client/api-client";
import { formatAgo, formatCountdown, formatJourneyDate, formatTime } from "@/lib/client/format";
import { rememberRecent } from "@/lib/client/recent";
import { addDays, istDateOf } from "@/lib/domain/time";
import type { TrainStatusView } from "@/lib/services/views";
import { CoachPositionCard } from "./coach-position";
import { DestinationAlarm } from "./destination-alarm";
import { RouteMap } from "./route-map";
import { StopTimeline } from "./stop-timeline";

function headline(v: TrainStatusView): string {
  const cur = v.stops.find((s) => s.stationCode === v.currentStationCode);
  switch (v.movement) {
    case "not_started":
      return `Not started — leaves ${v.train.sourceName} at ${formatTime(v.stops[0]?.expectedDeparture)}`;
    case "departed":
      return `Departed ${cur?.stationName ?? "last station"}`;
    case "approaching":
      return `Approaching ${v.nextStop?.stationName}`;
    case "arrived":
      return `At ${cur?.stationName}`;
    case "completed":
      return `Reached ${v.train.destinationName}`;
    case "cancelled":
      return "Cancelled";
    default:
      return v.runsOnDate ? "Live position unavailable" : "Does not run on this date";
  }
}

export function TrainLiveView({ number }: { number: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const date = params.get("date");
  const [showAll, setShowAll] = useState(false);
  const [today] = useState(() => istDateOf(Date.now()));
  const { data: v, error, loading, refreshing, fetchedAt, offlineSavedAt, refresh } = useApi<TrainStatusView>(
    `/api/trains/${number}/live${date ? `?date=${date}` : ""}`,
    { refreshMs: 60_000, offline: true },
  );
  const trainName = v?.train.name;
  useEffect(() => {
    if (trainName) rememberRecent({ kind: "train", id: number, label: trainName });
  }, [number, trainName]);

  if (loading) return <LoadingState label="Loading train status" rows={5} />;
  if (error && !v) return <ErrorState error={error} onRetry={refresh} />;
  if (!v) return null;

  const DAY_LABEL: Record<number, string> = { [-2]: "2 days ago", [-1]: "Yesterday", 0: "Today", 1: "Tomorrow" };
  const dates = [-2, -1, 0, 1].map((d) => ({ value: addDays(today, d), label: DAY_LABEL[d] }));
  const next = v.nextStop;
  const halts = v.stops.filter((s) => s.isHalt);
  const done = halts.filter((s) => s.progress === "departed" || s.progress === "at_station").length;
  const progressPct = v.runningState === "completed" ? 100 : halts.length > 1 ? Math.round((Math.max(0, done - 0.5) / (halts.length - 1)) * 100) : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted">{v.train.number}{v.train.type ? ` · ${v.train.type}` : ""}</p>
          <h1 className="text-2xl font-semibold">{v.train.name}</h1>
          <p className="text-muted">
            {v.train.sourceName} <span aria-label="to">→</span> {v.train.destinationName}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Train started</p>
          <div role="radiogroup" aria-label="Journey start date" className="flex flex-wrap gap-1">
            {dates.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={v.journeyDate === d.value}
                title={formatJourneyDate(d.value)}
                onClick={() => router.replace(`${pathname}?date=${d.value}`)}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${v.journeyDate === d.value ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-2"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {offlineSavedAt ? (
        <Notice tone="warn" title="You're offline">
          Showing the status saved on this phone at {formatTime(offlineSavedAt)}. The train has moved since then — it will update when you&apos;re back online.
        </Notice>
      ) : (
        error && <ErrorState error={error} onRetry={refresh} />
      )}

      <section aria-labelledby="status-heading" className="rounded-2xl bg-board p-5 text-board-fg">
        <div className="flex flex-wrap items-center gap-2">
          <QualityBadge quality={v.freshness.quality} />
          {v.runningState !== "unknown" && v.runningState !== "not_started" && <DelayPill minutes={v.delayMinutes} />}
          {v.speed && (
            <span className="rounded-full bg-board-row px-2 py-0.5 text-xs font-semibold text-board-fg" title="Speed at the last update">
              🚄 ~{v.speed.kmh} km/h
            </span>
          )}
          <span className="text-xs text-board-muted">{v.freshness.message}</span>
        </div>
        <h2 id="status-heading" className="mt-3 text-xl font-semibold sm:text-2xl">
          {headline(v)}
        </h2>
        <p className="mt-1 text-board-muted">{v.currentLocation}</p>

        {halts.length > 1 && v.runningState !== "unknown" && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-board-muted">
              <span>{v.train.sourceName}</span>
              <span>{v.train.destinationName}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Journey progress"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-1 h-2 overflow-hidden rounded-full bg-board-row"
            >
              <div className="h-full rounded-full bg-board-accent" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {next && (
          <div className="mt-4 rounded-xl bg-board-row p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs tracking-wide text-board-muted uppercase">Next stop</p>
                <p className="text-lg font-semibold">{next.stationName}</p>
              </div>
              <PlatformTag platform={next.platform} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 tabular">
              {next.expectedArrival != null && (
                <div>
                  <p className="text-xs text-board-muted">Arrives</p>
                  <p className="font-mono text-2xl font-semibold text-board-accent">{formatTime(next.expectedArrival)}</p>
                  <p className="text-sm text-board-fg">{formatCountdown(next.expectedArrival)}</p>
                  <p className="text-xs text-board-muted">Timetable {formatTime(next.scheduledArrival)}</p>
                </div>
              )}
              {next.expectedDeparture != null && (
                <div>
                  <p className="text-xs text-board-muted">Departs</p>
                  <p className="font-mono text-2xl font-semibold text-board-accent">{formatTime(next.expectedDeparture)}</p>
                  {next.expectedArrival == null && <p className="text-sm text-board-fg">{formatCountdown(next.expectedDeparture)}</p>}
                  <p className="text-xs text-board-muted">Timetable {formatTime(next.scheduledDeparture)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg border border-board-muted/40 px-3 py-1.5 font-medium hover:bg-board-row disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <span className="text-xs text-board-muted">Fetched {formatAgo(fetchedAt)} · auto-refreshes every minute</span>
        </div>
      </section>

      {v.liveIssue && (
        <Notice tone="warn" title="Live status could not be loaded">
          {v.liveIssue.message} Showing the published timetable instead.
        </Notice>
      )}
      {!v.runsOnDate && <Notice tone="warn">This train does not leave its origin on {formatJourneyDate(v.journeyDate)}. Pick another date.</Notice>}
      {v.freshness.stale && v.freshness.quality !== "scheduled" && (
        <Notice tone="warn" title="Live data may be outdated">
          The last update was {v.freshness.ageMinutes != null ? `${v.freshness.ageMinutes} minutes ago` : "at an unknown time"}. Positions and
          times below are estimates.
        </Notice>
      )}
      {v.notices.map((n) => (
        <Notice key={n} tone="warn">
          {n}
        </Notice>
      ))}

      <div className="flex flex-wrap gap-2">
        <Link href={`/train/${v.train.number}/route`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
          Full timetable
        </Link>
        <Link
          href={`/planner?train=${v.train.number}&date=${v.journeyDate}${next ? `&from=${next.stationCode}` : ""}`}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
        >
          Find a faster alternative
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="mb-3 font-semibold">⏰ Destination alarm</h2>
          <DestinationAlarm
            key={`${v.train.number}-${v.journeyDate}`}
            trainNumber={v.train.number}
            journeyDate={v.journeyDate}
            halts={halts}
            timesAreLive={v.freshness.quality !== "scheduled"}
          />
        </Card>
        <Card className="min-w-0">
          <h2 className="mb-3 font-semibold">🚃 Coach position</h2>
          <CoachPositionCard trainNumber={v.train.number} halts={halts} defaultStation={next?.stationCode ?? null} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Stops</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show non-stop stations
            </label>
          </div>
          <StopTimeline stops={v.stops} showAll={showAll} baseQuality={v.freshness.quality} />
        </Card>
        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">Route map</h2>
          {v.stops.some((s) => s.coordinates) ? (
            <RouteMap view={v} />
          ) : (
            <p className="text-sm text-muted">Station coordinates are not available from the current data source, so no map is shown.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
