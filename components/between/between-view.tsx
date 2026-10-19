"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { stationItem } from "@/components/search/quick-search";
import { Pill, QualityBadge } from "@/components/ui/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { useApi } from "@/lib/client/api-client";
import { formatCountdown, formatDuration, formatJourneyDate, formatTime } from "@/lib/client/format";
import { addDays, istDateOf } from "@/lib/domain/time";
import type { StationSummary } from "@/lib/domain/types";
import type { TrainsBetweenView } from "@/lib/services/trains-between";

const DAY_NAMES = { sun: "S", mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S" } as const;
const ALL_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The From → To form. Used on this page and on the home screen. */
export function BetweenForm({ initialFrom = "", initialTo = "", initialDate }: { initialFrom?: string; initialTo?: string; initialDate?: string }) {
  const router = useRouter();
  const [today] = useState(() => istDateOf(Date.now()));
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [date, setDate] = useState(initialDate ?? today);
  const [keys, setKeys] = useState(0);
  const [err, setErr] = useState("");
  const dates = [0, 1, 2].map((d) => ({ value: addDays(today, d), label: d === 0 ? "Today" : d === 1 ? "Tomorrow" : formatJourneyDate(addDays(today, d)) }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return setErr("Choose both stations.");
    if (from === to) return setErr("Choose two different stations.");
    setErr("");
    router.push(`/between?from=${from}&to=${to}&date=${date}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3" role="search" aria-label="Trains between stations">
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <SearchCombobox<StationSummary>
          key={`from-${keys}`}
          label="From"
          placeholder="Station name or code"
          endpoint="/api/stations/search"
          defaultValue={from}
          toItem={stationItem}
          acceptRaw={(t) => (/^[A-Za-z]{2,6}$/.test(t) ? { id: t.toUpperCase(), primary: t.toUpperCase() } : null)}
          onSelect={(i) => setFrom(i.id)}
        />
        <button
          type="button"
          aria-label="Swap stations"
          onClick={() => {
            setFrom(to);
            setTo(from);
            setKeys((k) => k + 1);
          }}
          className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-lg text-primary hover:bg-info-bg"
        >
          ⇅
        </button>
        <SearchCombobox<StationSummary>
          key={`to-${keys}`}
          label="To"
          placeholder="Station name or code"
          endpoint="/api/stations/search"
          defaultValue={to}
          toItem={stationItem}
          acceptRaw={(t) => (/^[A-Za-z]{2,6}$/.test(t) ? { id: t.toUpperCase(), primary: t.toUpperCase() } : null)}
          onSelect={(i) => setTo(i.id)}
        />
      </div>
      <div role="radiogroup" aria-label="Date of travel" className="flex flex-wrap gap-1.5">
        {dates.map((d) => (
          <button
            key={d.value}
            type="button"
            role="radio"
            aria-checked={date === d.value}
            onClick={() => setDate(d.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${date === d.value ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-fg hover:opacity-90 sm:w-auto sm:px-8">
        Find trains
      </button>
    </form>
  );
}

function Results({ from, to, date }: { from: string; to: string; date: string }) {
  const { data, error, loading, refresh } = useApi<TrainsBetweenView>(`/api/trains/between?from=${from}&to=${to}&date=${date}`);
  const [now] = useState(() => Date.now());
  const [showDeparted, setShowDeparted] = useState(false);
  if (loading) return <LoadingState label="Finding trains" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  return (
    <section className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          {data.from.name} <span className="text-accent">→</span> {data.to.name}
        </h2>
        <span className="flex items-center gap-2 text-sm text-muted">
          {formatJourneyDate(data.date)} · {data.trains.length} train{data.trains.length === 1 ? "" : "s"} <QualityBadge quality="scheduled" />
        </span>
      </div>
      {data.trains.length === 0 ? (
        <EmptyState title="No direct trains on this date">
          {data.notRunningCount > 0 ? `${data.notRunningCount} train(s) on this route don't run on this day. Try another date.` : "Try nearby stations, or the Faster route planner for journeys with a change."}
        </EmptyState>
      ) : (
        <>
        {!showDeparted && data.trains.some((t) => t.departed) && (
          <button type="button" onClick={() => setShowDeparted(true)} className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-primary hover:bg-info-bg">
            Show {data.trains.filter((t) => t.departed).length} train(s) that already left
          </button>
        )}
        <ul className="space-y-3">
          {data.trains.filter((t) => showDeparted || !t.departed).map((t) => (
            <li key={`${t.trainNumber}-${t.journeyDate}`} className={`rounded-2xl border border-border bg-surface p-4 ${t.departed ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/train/${t.trainNumber}?date=${t.journeyDate}`} className="font-semibold hover:underline">
                  <span className="font-mono text-primary">{t.trainNumber}</span> {t.trainName}
                </Link>
                <div className="flex gap-1.5">
                  {t.type && <Pill tone="neutral">{t.type}</Pill>}
                  {t.departed && <Pill tone="warn">Departed</Pill>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 tabular">
                <div>
                  <p className="font-mono text-2xl font-bold">{formatTime(t.departure)}</p>
                  <p className="text-xs text-muted">{data.from.code} · {formatCountdown(t.departure, now)}</p>
                </div>
                <div className="text-center text-xs text-muted">
                  <p className="font-semibold text-foreground">{formatDuration(t.durationMinutes)}</p>
                  <p aria-hidden>———→</p>
                  <p>{t.haltsBetween != null ? `${t.haltsBetween} stop${t.haltsBetween === 1 ? "" : "s"}` : ""}{t.distanceKm != null ? ` · ${t.distanceKm} km` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-bold">{formatTime(t.arrival)}</p>
                  <p className="text-xs text-muted">
                    {data.to.code}
                    {istDateOf(t.arrival) !== istDateOf(t.departure) && " · next day"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex gap-0.5" aria-label={`Runs on ${t.runDays.join(", ")}`}>
                  {ALL_DAYS.map((d) => (
                    <span key={d} className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${t.runDays.includes(d) ? "bg-teal-bg text-teal" : "text-muted/50"}`}>
                      {DAY_NAMES[d]}
                    </span>
                  ))}
                </span>
                <Link href={`/train/${t.trainNumber}?date=${t.journeyDate}`} className="text-sm font-semibold text-primary">
                  Live status →
                </Link>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
      <p className="text-xs text-muted">Times are from the timetable. Open a train for its live running status and platform.</p>
    </section>
  );
}

export function BetweenView() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const from = sp.get("from")?.toUpperCase() ?? "";
  const to = sp.get("to")?.toUpperCase() ?? "";
  const date = sp.get("date") ?? undefined;
  const ready = from && to && pathname === "/between";
  const [today] = useState(() => istDateOf(Date.now()));
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold tracking-wide text-teal uppercase">Plan a trip</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Trains between stations</h1>
      </header>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <BetweenForm key={`${from}-${to}-${date}`} initialFrom={from} initialTo={to} initialDate={date} />
      </section>
      {ready && <Results from={from} to={to} date={date ?? today} />}
    </div>
  );
}
