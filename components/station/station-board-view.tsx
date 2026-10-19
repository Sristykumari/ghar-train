"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DelayPill, PlatformTag, QualityBadge } from "@/components/ui/badges";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { useApi } from "@/lib/client/api-client";
import { formatAgo, formatCountdown, formatTime } from "@/lib/client/format";
import { rememberRecent } from "@/lib/client/recent";
import { useOrientation } from "@/lib/client/orientation-store";
import { applySides, completeOrientation, neighboursOf, type SidedRow } from "@/lib/services/orientation";
import type { BoardRow, StationBoardView as BoardData } from "@/lib/services/views";
import { BoardStatus } from "./board-status";

type Tab = "upcoming" | "here" | "delayed" | "gone";

const TABS: { id: Tab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "here", label: "At station" },
  { id: "delayed", label: "Delayed" },
  { id: "gone", label: "Arrived / departed" },
];

function inTab(r: BoardRow, tab: Tab): boolean {
  switch (tab) {
    case "upcoming":
      return r.status === "approaching" || r.status === "expected" || r.status === "scheduled";
    case "here":
      return r.status === "at_platform";
    case "delayed":
      return (r.delayMinutes ?? 0) > 5 && r.status !== "departed";
    case "gone":
      return r.status === "departed" || r.status === "scheduled_passed";
  }
}

function TimeBlock({ label, sched, exp, now }: { label: string; sched: number | null; exp: number | null; now: number }) {
  if (sched == null && exp == null) return <span className="text-board-muted">—</span>;
  const changed = sched != null && exp != null && Math.abs(exp - sched) >= 60_000;
  return (
    <span className="block">
      <span className="sr-only">{label} </span>
      <span className="font-mono text-lg font-semibold text-board-accent tabular">{formatTime(exp ?? sched)}</span>
      {changed && <span className="block font-mono text-xs text-board-muted line-through tabular">{formatTime(sched)}</span>}
      {exp != null && Math.abs(exp - now) < 90 * 60_000 && (
        <span className="block text-[11px] text-board-fg/80">{formatCountdown(exp, now)}</span>
      )}
    </span>
  );
}

function Row({ r, now }: { r: SidedRow; now: number }) {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 bg-board-row px-3 py-3 sm:grid-cols-[5rem_5rem_1fr_9rem_7rem] sm:items-center">
      <div>
        <span className="text-[10px] tracking-wider text-board-muted uppercase">{r.originatesHere ? "Dep" : "Arr"}</span>
        <TimeBlock now={now} label="arrival" sched={r.originatesHere ? r.scheduledDeparture : r.scheduledArrival} exp={r.originatesHere ? r.expectedDeparture : r.expectedArrival} />
      </div>
      <div className="hidden sm:block">
        <span className="text-[10px] tracking-wider text-board-muted uppercase">Dep</span>
        {r.terminatesHere ? <span className="block text-sm text-board-muted">Terminates</span> : <TimeBlock now={now} label="departure" sched={r.scheduledDeparture} exp={r.expectedDeparture} />}
      </div>
      <div className="min-w-0">
        <Link href={`/train/${r.trainNumber}?date=${r.journeyDate}`} className="font-semibold hover:underline">
          <span className="font-mono text-board-accent">{r.trainNumber}</span> {r.trainName}
        </Link>
        <p className="truncate text-sm text-board-muted">
          {r.originatesHere ? "Starts here" : `From ${r.sourceName ?? r.sourceCode}`} → {r.terminatesHere ? "Terminates here" : (r.destinationName ?? r.destinationCode)}
        </p>
        <p className="truncate text-xs text-board-muted">
          {r.previousHalt && <>Prev: {r.previousHalt.name}</>}
          {r.previousHalt && r.nextHalt && " · "}
          {r.nextHalt && <>Next: {r.nextHalt.name}</>}
          <span className="sm:hidden">{!r.terminatesHere && ` · Dep ${formatTime(r.expectedDeparture ?? r.scheduledDeparture)}`}</span>
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-auto">
        <BoardStatus status={r.status} />
        {!r.originatesHere && r.side.arrival && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.side.arrival === "left" ? "bg-teal-bg text-teal" : "bg-accent-bg text-accent"}`}>
            {r.side.arrival === "left" ? "← From left" : "From right →"}
          </span>
        )}
        {r.delayMinutes != null && <DelayPill minutes={r.delayMinutes} />}
      </div>
      <div className="col-start-2 flex items-center gap-2 text-board-fg sm:col-start-auto sm:flex-col sm:items-end">
        <PlatformTag platform={r.platform} quietFor={r.timeQuality} />
        <QualityBadge quality={r.timeQuality} />
      </div>
    </li>
  );
}

export function StationBoardView({ code }: { code: string }) {
  const [hours, setHours] = useState(4);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const { data, error, loading, refreshing, fetchedAt, offlineSavedAt, refresh } = useApi<BoardData>(`/api/stations/${code}/board?hours=${hours}`, {
    refreshMs: 60_000,
    offline: true,
  });

  // Ticks so "in 5 min" stays right between data refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const stationName = data?.station.name;
  useEffect(() => {
    if (stationName) rememberRecent({ kind: "station", id: code, label: stationName });
  }, [code, stationName]);

  const platforms = useMemo(
    () => [...new Set((data?.rows ?? []).map((r) => r.platform?.value).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [data],
  );

  const orientation = useOrientation(code);
  const sidedAll = useMemo(() => {
    const all: BoardRow[] = data?.rows ?? [];
    const userSet = Object.keys(orientation).length > 0;
    return applySides(all, userSet ? completeOrientation(orientation, neighboursOf(all)) : null, !!data?.layout.available);
  }, [data, orientation]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sidedAll.filter(
      (r) =>
        inTab(r, tab) &&
        (!platform || r.platform?.value === platform) &&
        (!q ||
          r.trainNumber.includes(q) ||
          r.trainName.toLowerCase().includes(q) ||
          r.destinationCode.toLowerCase().includes(q) ||
          (r.destinationName ?? "").toLowerCase().includes(q) ||
          (r.sourceName ?? "").toLowerCase().includes(q)),
    );
  }, [sidedAll, tab, platform, query]);

  if (loading) return <LoadingState label="Loading station board" rows={6} />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-block rounded-md bg-teal-bg px-2 py-0.5 font-mono text-sm font-semibold text-teal">{data.station.code}</span>
          <h1 className="mt-1 text-2xl font-bold">{data.station.name}</h1>
          <p className="text-sm text-muted">
            {data.live.available ? (data.live.source === "simulated" ? "Simulated live board" : "Live board") : "Timetable only"} · fetched {formatAgo(fetchedAt)}
            {refreshing && " · refreshing…"}
          </p>
        </div>
        <Link href={`/station/${data.station.code}/approaching`} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
          Approaching · left / right
        </Link>
      </header>

      {offlineSavedAt ? (
        <Notice tone="warn" title="You're offline">
          Showing the board saved on this phone at {formatTime(offlineSavedAt)}. It will update when you&apos;re back online.
        </Notice>
      ) : (
        error && <ErrorState error={error} onRetry={refresh} />
      )}
      {!data.live.available && (
        <Notice tone="warn" title="Live arrivals unavailable">
          {data.live.issue?.message ?? "This data source does not provide a live station board."} Times and platforms below are from the timetable and
          are not confirmed.
        </Notice>
      )}
      {data.truncated && <Notice>Showing route details for the first trains only, to stay within the data provider&apos;s limits.</Notice>}

      <form className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => e.preventDefault()} role="search">
        <label className="col-span-2 text-sm sm:col-span-1">
          <span className="mb-1 block font-medium">Filter by train or destination</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number, name or station"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
            <option value="">All</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Time window</span>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
            {[2, 4, 8].map((h) => (
              <option key={h} value={h}>
                Next {h} hours
              </option>
            ))}
          </select>
        </label>
      </form>

      <div role="tablist" aria-label="Board sections" className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const count = data.rows.filter((r) => inTab(r, t.id)).length;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-primary text-primary-fg" : "bg-surface text-muted ring-1 ring-border hover:text-foreground"}`}
            >
              {t.label} <span className="tabular opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <section role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {rows.length === 0 ? (
          <EmptyState title="No trains match">Try another tab, filter or a longer time window.</EmptyState>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-board text-board-fg [&>li+li]:mt-px">
            {rows.map((r) => (
              <Row key={r.key} r={r} now={now} />
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">
        Times IST. &ldquo;usual&rdquo; platforms come from the timetable and may change — confirm on station displays.
      </p>
    </div>
  );
}
