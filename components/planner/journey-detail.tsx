"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DelayPill, Pill, PlatformTag, QualityBadge } from "@/components/ui/badges";
import { Card, EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { formatDuration, formatTime } from "@/lib/client/format";
import { parsePlanQuery, planQueryString, usePlan } from "@/lib/client/use-plan";
import { RISK_LABEL, RISK_TONE, RiskPill, SavedText } from "./journey-card";

export function JourneyDetail() {
  const sp = useSearchParams();
  const query = parsePlanQuery(new URLSearchParams(sp.toString()));
  const id = sp.get("id");
  const { result, error, loading, rerun } = usePlan(query);
  const qs = query ? planQueryString(query) : "";

  if (!query || !id) return <EmptyState title="No journey selected">Start from the <Link href="/planner" className="underline">planner</Link>.</EmptyState>;
  if (loading) return <LoadingState label="Loading journey" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={rerun} />;
  if (!result) return null;

  const option = [result.current, ...result.options].find((o) => o?.id === id);
  if (!option) {
    return (
      <EmptyState title="This option is no longer available">
        Connections change as trains run. <Link href={`/planner?${qs}`} className="underline">See current options</Link>.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{option.kind === "current" ? "Stay on your train" : "Alternative journey"}</p>
          <h1 className="text-2xl font-semibold">
            To {result.destination.name} by <span className="font-mono">{formatTime(option.arrivalTime)}</span>
          </h1>
          <p className="text-sm">
            {formatDuration(option.minutesToDestination)} from now · {option.changes} change{option.changes === 1 ? "" : "s"} · waiting{" "}
            {formatDuration(option.waitingMinutes)} {option.kind !== "current" && <>· <SavedText minutes={option.minutesSavedVsCurrent} /></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/planner/compare?${qs}`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
            Compare
          </Link>
          <Link href={`/planner?${qs}`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
            All options
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <RiskPill risk={option.risk} changes={option.changes} />
        <Pill tone={option.confidence === "high" ? "ok" : option.confidence === "medium" ? "warn" : "bad"}>{option.confidence} confidence</Pill>
        <QualityBadge quality={option.dataQuality} />
      </div>
      {option.notes.map((n) => (
        <Notice key={n}>{n}</Notice>
      ))}

      <ol className="space-y-3">
        {option.legs.map((leg, i) => {
          const transfer = option.transfers.find((t) => t.departure === leg.departure && t.station.code === leg.from.code);
          return (
            <li key={`${leg.trainNumber}-${i}`} className="space-y-3">
              {transfer && (
                <Card className="border-dashed">
                  <h2 className="font-semibold">
                    Change at {transfer.station.name} <span className="font-mono text-sm text-muted">{transfer.station.code}</span>
                  </h2>
                  <p className="mt-1 text-sm">
                    Arrive {formatTime(transfer.arrival)} · depart {formatTime(transfer.departure)} · <strong>{formatDuration(transfer.waitMinutes)}</strong> to
                    change (minimum {transfer.minTransferMinutes} min){" "}
                    <Pill tone={RISK_TONE[transfer.risk]}>{RISK_LABEL[transfer.risk]}</Pill>
                  </p>
                  {transfer.notes.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
                      {transfer.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{i === 0 && !transfer ? "Your current train" : `Connecting train`}</p>
                    <Link href={`/train/${leg.trainNumber}?date=${leg.journeyDate}`} className="text-lg font-semibold hover:underline">
                      <span className="font-mono">{leg.trainNumber}</span> {leg.trainName}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {leg.delayMinutes != null && <DelayPill minutes={leg.delayMinutes} />}
                    <QualityBadge quality={leg.quality} />
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Board at</dt>
                    <dd className="font-medium">{leg.from.name}</dd>
                    <dd className="font-mono tabular">
                      {formatTime(leg.departure)}
                      {leg.scheduledDeparture != null && Math.abs(leg.scheduledDeparture - leg.departure) >= 60_000 && (
                        <span className="ml-1 text-xs text-muted line-through">{formatTime(leg.scheduledDeparture)}</span>
                      )}
                    </dd>
                    <dd className="mt-1">
                      <PlatformTag platform={leg.departurePlatform} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Get off at</dt>
                    <dd className="font-medium">{leg.to.name}</dd>
                    <dd className="font-mono tabular">
                      {formatTime(leg.arrival)}
                      {leg.scheduledArrival != null && Math.abs(leg.scheduledArrival - leg.arrival) >= 60_000 && (
                        <span className="ml-1 text-xs text-muted line-through">{formatTime(leg.scheduledArrival)}</span>
                      )}
                    </dd>
                    <dd className="mt-1">
                      <PlatformTag platform={leg.arrivalPlatform} />
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted">
                  {formatDuration(Math.round((leg.arrival - leg.departure) / 60_000))} on board · {leg.intermediateStops} stop
                  {leg.intermediateStops === 1 ? "" : "s"} in between
                </p>
              </Card>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">
        Platforms marked &ldquo;usual&rdquo; are from the timetable. Before changing trains, check the station display or announcements.
      </p>
    </div>
  );
}
