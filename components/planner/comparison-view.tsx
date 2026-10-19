"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Pill, QualityBadge } from "@/components/ui/badges";
import { Card, EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { formatDuration, formatTime, formatAgo } from "@/lib/client/format";
import { parsePlanQuery, planQueryString, usePlan } from "@/lib/client/use-plan";
import type { JourneyOption, Risk } from "@/lib/planner/types";
import { RISK_LABEL, RISK_TONE, SavedText } from "./journey-card";

type SortMode = "fastest" | "fewest" | "safest";
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

const SORTS: { id: SortMode; label: string }[] = [
  { id: "fastest", label: "Fastest" },
  { id: "fewest", label: "Fewest changes" },
  { id: "safest", label: "Lowest risk" },
];

function sortOptions(list: JourneyOption[], mode: SortMode) {
  return [...list].sort((a, b) => {
    if (mode === "fewest") return a.changes - b.changes || a.arrivalTime - b.arrivalTime;
    if (mode === "safest") return RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.arrivalTime - b.arrivalTime;
    return a.arrivalTime - b.arrivalTime;
  });
}

function optionLabel(o: JourneyOption, fastestId: string | null) {
  if (o.kind === "current") return "Stay on current train";
  if (o.id === fastestId) return "Fastest alternative";
  return `Via ${o.transfers.map((t) => t.station.code).join(", ")}`;
}

/** Gantt-style bars: riding (solid) and waiting (hatched) from now to arrival, on one shared time axis. */
function TimelineChart({ options, start, fastestId }: { options: JourneyOption[]; start: number; fastestId: string | null }) {
  const end = Math.max(...options.map((o) => o.arrivalTime));
  const span = Math.max(1, end - start);
  const pct = (t: number) => `${(((Math.max(start, t) - start) / span) * 100).toFixed(2)}%`;
  const width = (a: number, b: number) => `${(((Math.max(start, b) - Math.max(start, a)) / span) * 100).toFixed(2)}%`;
  const hours = Math.ceil(span / 3600_000);
  const step = hours > 12 ? 3 : hours > 6 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(hours / step) + 1 }, (_, i) => start + i * step * 3600_000).filter((t) => t <= end);

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded-sm bg-primary" /> On a train
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded-sm border border-border bg-[repeating-linear-gradient(45deg,var(--muted)_0_2px,transparent_2px_6px)]" /> Waiting to change
        </span>
      </div>
      <div className="space-y-4">
        {options.map((o) => {
          const segments: { from: number; to: number; kind: "ride" | "wait"; label: string; title: string }[] = [];
          o.legs.forEach((l, i) => {
            const t = o.transfers.find((x) => x.departure === l.departure && x.station.code === l.from.code);
            if (t && i > 0) segments.push({ from: t.arrival, to: t.departure, kind: "wait", label: "", title: `Wait ${formatDuration(t.waitMinutes)} at ${t.station.name}` });
            segments.push({
              from: l.departure,
              to: l.arrival,
              kind: "ride",
              label: l.trainNumber,
              title: `${l.trainNumber} ${l.trainName}: ${l.from.name} ${formatTime(l.departure)} → ${l.to.name} ${formatTime(l.arrival)}`,
            });
          });
          return (
            <div key={o.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{optionLabel(o, fastestId)}</span>
                <span className="font-mono font-semibold tabular">{formatTime(o.arrivalTime)}</span>
              </div>
              <div className="relative h-7 rounded-md bg-surface-2">
                {segments.map((s, i) =>
                  s.to <= start ? null : (
                    <div
                      key={i}
                      title={s.title}
                      className={`absolute top-0 bottom-0 flex items-center overflow-hidden rounded-[4px] border-x-2 border-surface ${
                        s.kind === "ride" ? "bg-primary text-primary-fg" : "bg-[repeating-linear-gradient(45deg,var(--muted)_0_2px,transparent_2px_6px)]"
                      }`}
                      style={{ left: pct(s.from), width: width(s.from, s.to) }}
                    >
                      {s.kind === "ride" && <span className="truncate px-1.5 font-mono text-[11px] font-semibold">{s.label}</span>}
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 h-5 border-t border-border text-[11px] text-muted" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 pt-1 tabular" style={{ left: pct(t) }}>
            {formatTime(t)}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-muted">Time axis starts now ({formatTime(start)} IST). Hover a bar for details; the table below has every value.</figcaption>
    </figure>
  );
}

export function ComparisonView() {
  const sp = useSearchParams();
  const query = parsePlanQuery(new URLSearchParams(sp.toString()));
  const { result, error, loading, rerun } = usePlan(query);
  const [mode, setMode] = useState<SortMode>("fastest");
  const qs = query ? planQueryString(query) : "";

  if (!query) return <EmptyState title="Nothing to compare">Start from the <Link href="/planner" className="underline">planner</Link>.</EmptyState>;
  if (loading) return <LoadingState label="Loading comparison" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={rerun} />;
  if (!result) return null;

  const all = [...(result.current ? [result.current] : []), ...result.options];
  const sorted = sortOptions(all, mode);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Compare routes to {result.destination.name}</h1>
          <p className="text-sm text-muted">
            Planned {formatAgo(result.generatedAt)} · your train {result.currentTrain.number}: {result.currentTrain.freshnessMessage}
          </p>
        </div>
        <Link href={`/planner?${qs}`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
          Back to options
        </Link>
      </header>

      {all.length === 0 ? (
        <EmptyState title="No routes to compare" />
      ) : (
        <>
          <div role="radiogroup" aria-label="Prefer" className="flex flex-wrap gap-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={mode === s.id}
                onClick={() => setMode(s.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === s.id ? "bg-primary text-primary-fg" : "border border-border bg-surface hover:bg-surface-2"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {mode !== "fastest" && sorted[0] && (
            <Notice>
              Best for &ldquo;{SORTS.find((s) => s.id === mode)?.label.toLowerCase()}&rdquo;: <strong>{optionLabel(sorted[0], result.fastestId)}</strong>, arriving{" "}
              {formatTime(sorted[0].arrivalTime)}.
            </Notice>
          )}

          <Card>
            <TimelineChart options={sorted} start={result.generatedAt} fastestId={result.fastestId} />
          </Card>

          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Route comparison</caption>
              <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">Route</th>
                  <th scope="col" className="px-3 py-2">Arrives</th>
                  <th scope="col" className="px-3 py-2">Time to go</th>
                  <th scope="col" className="px-3 py-2">vs staying</th>
                  <th scope="col" className="px-3 py-2">Waiting</th>
                  <th scope="col" className="px-3 py-2">Changes</th>
                  <th scope="col" className="px-3 py-2">Delays</th>
                  <th scope="col" className="px-3 py-2">Data</th>
                  <th scope="col" className="px-3 py-2">Risk / confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {sorted.map((o) => (
                  <tr key={o.id} className={o.id === result.fastestId ? "bg-info-bg/40" : ""}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <Link href={`/planner/journey?${qs}&id=${encodeURIComponent(o.id)}`} className="hover:underline">
                        {optionLabel(o, result.fastestId)}
                      </Link>
                      <span className="block font-mono text-xs font-normal text-muted">{o.legs.map((l) => l.trainNumber).join(" → ")}</span>
                    </th>
                    <td className="px-3 py-2 font-mono font-semibold">{formatTime(o.arrivalTime)}</td>
                    <td className="px-3 py-2">{formatDuration(o.minutesToDestination)}</td>
                    <td className="px-3 py-2">{o.kind === "current" ? "—" : <SavedText minutes={o.minutesSavedVsCurrent} />}</td>
                    <td className="px-3 py-2">{formatDuration(o.waitingMinutes)}</td>
                    <td className="px-3 py-2">{o.changes}</td>
                    <td className="px-3 py-2">
                      {o.legs
                        .filter((l) => l.delayMinutes != null && l.delayMinutes > 5)
                        .map((l) => `${l.trainNumber} +${l.delayMinutes}m`)
                        .join(", ") || "None reported"}
                    </td>
                    <td className="px-3 py-2">
                      <QualityBadge quality={o.dataQuality} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {o.changes > 0 && <Pill tone={RISK_TONE[o.risk]}>{RISK_LABEL[o.risk]}</Pill>}
                        <Pill tone={o.confidence === "high" ? "ok" : o.confidence === "medium" ? "warn" : "bad"}>{o.confidence}</Pill>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
