"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { QualityBadge } from "@/components/ui/badges";
import { Card, EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { formatDelay, formatTime } from "@/lib/client/format";
import { parsePlanQuery, planQueryString, usePlan } from "@/lib/client/use-plan";
import type { PlanResult } from "@/lib/planner/types";
import { JourneyCard } from "./journey-card";
import { PlannerForm } from "./planner-form";
import { Suggestion } from "./suggestion";

function Results({ result, qs }: { result: PlanResult; qs: string }) {
  const { current, options } = result;
  const fastest = options.find((o) => o.id === result.fastestId) ?? null;
  const detailsHref = (id: string) => `/planner/journey?${qs}&id=${encodeURIComponent(id)}`;

  return (
    <div className="space-y-4">
      <Suggestion result={result} />

      {result.warnings.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}

      {current ? (
        <JourneyCard option={current} highlight="If you stay on your train" detailsHref={detailsHref(current.id)} />
      ) : (
        <Notice tone="warn">{result.currentNote}</Notice>
      )}

      {options.length === 0 ? (
        <EmptyState title={current ? "No faster option found" : "No route found"}>
          {current ? "Staying on your train looks like the quickest way to get there." : "No feasible connection was found within the next 24 hours."}
          {result.slowerAlternativesHidden > 0 && ` (${result.slowerAlternativesHidden} slower option${result.slowerAlternativesHidden === 1 ? "" : "s"} not shown.)`}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {options.length} {current ? "faster " : ""}option{options.length === 1 ? "" : "s"}
            </h2>
            <Link href={`/planner/compare?${qs}`} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
              Compare routes
            </Link>
          </div>
          {fastest && <JourneyCard option={fastest} highlight="Fastest feasible" detailsHref={detailsHref(fastest.id)} />}
          {options
            .filter((o) => o.id !== fastest?.id)
            .map((o) => (
              <JourneyCard key={o.id} option={o} detailsHref={detailsHref(o.id)} />
            ))}
          {result.slowerAlternativesHidden > 0 && (
            <p className="text-xs text-muted">
              {result.slowerAlternativesHidden} other feasible option{result.slowerAlternativesHidden === 1 ? " arrives" : "s arrive"} later than staying on
              your train and {result.slowerAlternativesHidden === 1 ? "is" : "are"} not shown.
            </p>
          )}
        </>
      )}

      {result.rejected.length > 0 && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer font-medium">Connections we ruled out ({result.rejected.length})</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {result.rejected.map((r) => (
              <li key={`${r.trainNumber}-${r.station.code}-${r.departure}`}>
                <span className="font-mono font-semibold">{r.trainNumber}</span> {r.trainName} from {r.station.name} at {formatTime(r.departure)} —{" "}
                <span className="text-bad">{r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">
        Checked {result.stats.stationLookups} station timetables, {result.stats.trainLookups} train timetables and {result.stats.liveLookups} live statuses.
      </p>
    </div>
  );
}

/** Compact "what you searched" bar so the answer, not the form, is the first thing you see. */
function SearchSummary({
  result,
  query,
  loading,
  onEdit,
  onRecheck,
}: {
  result: PlanResult | null;
  query: NonNullable<ReturnType<typeof parsePlanQuery>>;
  loading: boolean;
  onEdit: () => void;
  onRecheck: () => void;
}) {
  return (
    <section aria-label="Your search" className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            On <span className="font-mono font-semibold text-foreground">{query.trainNumber}</span>
            {result && <> {result.currentTrain.name}</>}
          </p>
          <p className="text-lg font-semibold">
            {(result?.current ?? result?.options[0])?.legs[0].from.name ?? query.currentStation}{" "}
            <span aria-label="to" className="text-accent">
              →
            </span>{" "}
            {result?.destination.name ?? query.destination}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onRecheck} disabled={loading} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-info-bg disabled:opacity-60">
            {loading ? "Checking…" : "Recheck"}
          </button>
          <button type="button" onClick={onEdit} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
            Edit
          </button>
        </div>
      </div>
      {result && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <QualityBadge quality={result.currentTrain.quality} />
          {result.currentTrain.freshnessMessage}
          {result.currentTrain.delayMinutes != null && <> · {formatDelay(result.currentTrain.delayMinutes)}</>}
          <span>· planned {formatTime(result.generatedAt)} IST</span>
        </p>
      )}
    </section>
  );
}

export function PlannerView() {
  const sp = useSearchParams();
  const query = parsePlanQuery(new URLSearchParams(sp.toString()));
  const { result, error, loading, rerun } = usePlan(query);
  const qs = query ? planQueryString(query) : "";
  // Editing applies to the search it was opened for; a new search collapses the form again.
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const showForm = !query || editingFor === qs;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">Get home sooner</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Find a faster train</h1>
        {!query && (
          <p className="text-muted">
            On a slow train and need to get home sooner? We look for places to change along your route and only suggest connections you can actually make.
          </p>
        )}
      </header>
      {showForm ? (
        <Card>
          <PlannerForm key={qs} initial={query} />
        </Card>
      ) : (
        <SearchSummary result={result} query={query!} loading={loading} onEdit={() => setEditingFor(qs)} onRecheck={rerun} />
      )}
      {query && (
        <section aria-live="polite" aria-busy={loading}>
          {loading && <LoadingState label="Searching connections" rows={3} />}
          {error && <ErrorState error={error} onRetry={rerun} />}
          {result && !loading && <Results result={result} qs={qs} />}
        </section>
      )}
    </div>
  );
}
