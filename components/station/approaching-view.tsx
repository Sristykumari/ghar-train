"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DelayPill, PlatformTag, QualityBadge } from "@/components/ui/badges";
import { Card, EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { useApi } from "@/lib/client/api-client";
import { formatAgo, formatCountdown, formatTime } from "@/lib/client/format";
import { saveOrientation, useOrientation } from "@/lib/client/orientation-store";
import { approachPhase, selectApproaching, type ApproachPhase } from "@/lib/services/approaching";
import {
  applySides,
  completeOrientation,
  describeSide,
  groupBySide,
  neighboursOf,
  opposite,
  swapOrientation,
  type Neighbour,
  type Orientation,
  type Side,
  type SidedRow,
} from "@/lib/services/orientation";
import type { StationBoardView } from "@/lib/services/views";
import { BoardStatus } from "./board-status";

const PHASE_TEXT: Record<ApproachPhase, string> = {
  approaching: "Approaching",
  at_platform: "Standing at platform",
  departing: "Just departed",
  expected: "Expected",
  scheduled: "Scheduled (no live data)",
};

/** Left = teal, right = saffron, everywhere on this screen (always with an arrow + word, never colour alone). */
const SIDE_STYLE: Record<Side, { chip: string; heading: string; arrow: string; label: string }> = {
  left: { chip: "bg-teal-bg text-teal", heading: "text-teal", arrow: "←", label: "left" },
  right: { chip: "bg-accent-bg text-accent", heading: "text-accent", arrow: "→", label: "right" },
};

type Filter = "all" | "left" | "right" | "starts";

// ── Setup: "which way are you facing?" ─────────────────────────────────────

function SideButtons({ value, onChange, name }: { value: Side | undefined; onChange: (s: Side) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={`Side for trains towards ${name}`} className="inline-flex rounded-xl bg-surface-2 p-1">
      {(["left", "right"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${value === s ? (s === "left" ? "bg-teal text-surface" : "bg-accent-solid text-white") : "text-muted"}`}
        >
          {s === "left" ? "← My left" : "My right →"}
        </button>
      ))}
    </div>
  );
}

function SideSetup({
  stationCode,
  neighbours,
  orientation,
  layoutAvailable,
}: {
  stationCode: string;
  neighbours: Neighbour[];
  orientation: Orientation;
  layoutAvailable: boolean;
}) {
  const isSet = Object.keys(orientation).length > 0;
  const [editing, setEditing] = useState(false);
  const effective = completeOrientation(orientation, neighbours);
  // At a simple two-way station one question is enough.
  const toAsk = neighbours.length === 2 ? [neighbours[0]] : neighbours;
  const set = (code: string, side: Side) => {
    const next = { ...orientation, [code]: side };
    if (neighbours.length === 2) {
      const other = neighbours.find((n) => n.code !== code);
      if (other) next[other.code] = opposite(side);
    }
    saveOrientation(stationCode, next);
  };

  if (neighbours.length === 0) return null;

  if (isSet && !editing) {
    const lefts = neighbours.filter((n) => effective[n.code] === "left");
    const rights = neighbours.filter((n) => effective[n.code] === "right");
    return (
      <Card>
        <h2 className="font-semibold">Your left and right</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-teal-bg p-3 text-teal">
            <p className="text-xs font-semibold uppercase">← Your left</p>
            <p className="font-medium">{lefts.map((n) => n.name).join(", ") || "—"}</p>
          </div>
          <div className="rounded-xl bg-accent-bg p-3 text-right text-accent">
            <p className="text-xs font-semibold uppercase">Your right →</p>
            <p className="font-medium">{rights.map((n) => n.name).join(", ") || "—"}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveOrientation(stationCode, swapOrientation(effective))}
            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
          >
            ⇄ I&apos;m facing the other way
          </button>
          <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-info-bg">
            Change
          </button>
          <button type="button" onClick={() => saveOrientation(stationCode, null)} className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2">
            Reset
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Saved on this device for {stationCode}. Based on what you told us, not on GPS.</p>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <div className="flex items-start gap-3">
        <svg aria-hidden viewBox="0 0 64 48" className="h-12 w-16 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 10h56M4 18h56" />
          <path d="M8 6v16M20 6v16M32 6v16M44 6v16M56 6v16" strokeWidth="1.5" />
          <circle cx="32" cy="32" r="4" />
          <path d="M32 36v8M26 40h12" />
          <path d="M18 32h-8l3-3M10 32l3 3M46 32h8l-3-3M54 32l-3 3" />
        </svg>
        <div>
          <h2 className="font-semibold">Which trains come from your left or right?</h2>
          <p className="text-sm text-muted">
            Stand on the platform <strong>facing the tracks</strong>. Tell us which way {toAsk.length === 1 ? "this direction goes" : "each direction goes"} and
            we&apos;ll sort every train for you.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {toAsk.map((n) => (
          <li key={n.code} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              Trains <strong>towards {n.name}</strong> <span className="font-mono text-xs text-muted">{n.code}</span> leave on
            </span>
            <SideButtons value={effective[n.code]} onChange={(s) => set(n.code, s)} name={n.name} />
          </li>
        ))}
      </ul>
      {neighbours.length > 2 && (
        <p className="mt-3 text-xs text-muted">This is a junction with {neighbours.length} directions, so we ask about each one.</p>
      )}
      {layoutAvailable && !isSet && (
        <p className="mt-3 text-xs text-muted">Until you set this, sides follow the station diagram, which may not match the way you are facing.</p>
      )}
      {editing && (
        <button type="button" onClick={() => setEditing(false)} className="mt-3 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg">
          Done
        </button>
      )}
    </Card>
  );
}

// ── Track view ─────────────────────────────────────────────────────────────

/**
 * Platforms as horizontal tracks: trains on their way in sit on the side
 * they come from, trains at the platform in the middle, trains that just
 * left on the side they went to.
 */
function TrackDiagram({ rows, platforms, leftLabel, rightLabel, note }: { rows: SidedRow[]; platforms: string[]; leftLabel: string; rightLabel: string; note: string }) {
  const unplaced = rows.filter((r) => !r.platform || !platforms.includes(r.platform.value));

  function chip(r: SidedRow) {
    const phase = approachPhase(r);
    const tone = phase === "at_platform" ? "bg-ok text-surface" : phase === "approaching" ? "bg-info text-surface" : "bg-surface-2 text-foreground border border-border";
    return (
      <Link key={r.key} href={`/train/${r.trainNumber}?date=${r.journeyDate}`} className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${tone}`} title={`${r.trainNumber} ${r.trainName} — ${PHASE_TEXT[phase]}`}>
        {r.trainNumber}
      </Link>
    );
  }

  function lane(pf: string) {
    const here = rows.filter((r) => r.platform?.value === pf);
    const sideOf = (r: SidedRow) => (r.status === "departed" ? r.side.departure : r.status === "at_platform" ? null : r.side.arrival);
    const left = here.filter((r) => sideOf(r) === "left");
    const right = here.filter((r) => sideOf(r) === "right");
    const middle = here.filter((r) => !left.includes(r) && !right.includes(r));
    return (
      <div key={pf} className="grid grid-cols-[3rem_1fr_2fr_1fr] items-center gap-2">
        <span className="text-xs font-semibold text-muted">PF {pf}</span>
        <div className="flex flex-wrap justify-end gap-1">{left.map(chip)}</div>
        <div className="relative flex min-h-8 flex-wrap items-center justify-center gap-1 rounded-md bg-surface-2 px-1">
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-0.5 bg-border" />
          <span className="relative flex flex-wrap gap-1">{middle.map(chip)}</span>
        </div>
        <div className="flex flex-wrap gap-1">{right.map(chip)}</div>
      </div>
    );
  }

  return (
    <figure>
      <div className="mb-2 grid grid-cols-[3rem_1fr_2fr_1fr] gap-2 text-xs font-semibold">
        <span />
        <span className="text-right text-teal">← {leftLabel}</span>
        <span className="text-center text-muted">Platforms</span>
        <span className="text-accent">{rightLabel} →</span>
      </div>
      <div className="space-y-2">{platforms.map(lane)}</div>
      {unplaced.length > 0 && <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted">Platform not known: {unplaced.map(chip)}</p>}
      <figcaption className="mt-3 text-xs text-muted">{note}</figcaption>
    </figure>
  );
}

// ── Train card ─────────────────────────────────────────────────────────────

function TrainCard({ r, now }: { r: SidedRow; now: number }) {
  const side = r.originatesHere ? r.side.departure : r.side.arrival;
  const style = side ? SIDE_STYLE[side] : null;
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/train/${r.trainNumber}?date=${r.journeyDate}`} className="font-semibold hover:underline">
            <span className="font-mono">{r.trainNumber}</span> {r.trainName}
          </Link>
          <p className="text-sm text-muted">{describeSide(r)}</p>
        </div>
        <div className="flex items-center gap-2">
          {style && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style.chip}`}>
              {side === "left" ? `${style.arrow} ${r.originatesHere ? "To" : "From"} left` : `${r.originatesHere ? "To" : "From"} right ${style.arrow}`}
            </span>
          )}
          <PlatformTag platform={r.platform} quietFor={r.timeQuality} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <BoardStatus status={r.status} />
        {r.delayMinutes != null && <DelayPill minutes={r.delayMinutes} />}
        <QualityBadge quality={r.timeQuality} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Previous stop</dt>
          <dd>{r.previousHalt?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Next stop</dt>
          <dd>{r.terminatesHere ? "Terminates here" : (r.nextHalt?.name ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Expected arrival</dt>
          <dd className="font-mono font-semibold tabular">
            {r.originatesHere ? "—" : formatTime(r.expectedArrival)}
            {!r.originatesHere && r.expectedArrival && <span className="ml-1 font-sans text-xs font-normal text-muted">{formatCountdown(r.expectedArrival, now)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Expected departure</dt>
          <dd className="font-mono font-semibold tabular">{r.terminatesHere ? "—" : formatTime(r.expectedDeparture)}</dd>
        </div>
      </dl>
      {r.lastUpdatedAt && <p className="mt-2 text-xs text-muted">Last update {formatAgo(r.lastUpdatedAt, now)}</p>}
    </li>
  );
}

function Section({ title, tone, rows, now }: { title: string; tone?: string; rows: SidedRow[]; now: number }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-2 text-sm font-bold tracking-wide uppercase ${tone ?? "text-muted"}`}>
        {title} <span className="font-normal opacity-80">({rows.length})</span>
      </h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <TrainCard key={r.key} r={r} now={now} />
        ))}
      </ul>
    </section>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function ApproachingView({ code }: { code: string }) {
  const { data, error, loading, refreshing, fetchedAt, refresh } = useApi<StationBoardView>(`/api/stations/${code}/board?hours=2`, {
    refreshMs: 30_000,
  });
  const orientation = useOrientation(code);
  const [filter, setFilter] = useState<Filter>("all");
  // Re-filter as time passes between refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const neighbours = useMemo(() => neighboursOf(data?.rows ?? []), [data]);
  const effective = useMemo(() => completeOrientation(orientation, neighbours), [orientation, neighbours]);

  if (loading) return <LoadingState label="Loading approaching trains" rows={4} />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const userSet = Object.keys(orientation).length > 0;
  const sided = applySides(selectApproaching(data.rows, now), userSet ? effective : null, data.layout.available);
  const groups = groupBySide(sided);
  const sidesKnown = userSet || data.layout.available;
  const shown = filter === "left" ? groups.left : filter === "right" ? groups.right : filter === "starts" ? groups.startsHere : sided;

  const platforms = data.layout.platforms.length
    ? data.layout.platforms
    : [...new Set(sided.map((r) => r.platform?.value).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const leftLabel = userSet
    ? neighbours.filter((n) => effective[n.code] === "left").map((n) => n.code).join(" / ") || "Your left"
    : data.layout.leftNeighbours.join(" / ");
  const rightLabel = userSet
    ? neighbours.filter((n) => effective[n.code] === "right").map((n) => n.code).join(" / ") || "Your right"
    : data.layout.rightNeighbours.join(" / ");

  const FILTERS: { id: Filter; label: string; count: number; active: string }[] = [
    { id: "all", label: "All", count: sided.length, active: "bg-primary text-primary-fg" },
    { id: "left", label: "← From left", count: groups.left.length, active: "bg-teal text-surface" },
    { id: "right", label: "From right →", count: groups.right.length, active: "bg-accent-solid text-white" },
    { id: "starts", label: "Starts here", count: groups.startsHere.length, active: "bg-primary text-primary-fg" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-block rounded-md bg-teal-bg px-2 py-0.5 font-mono text-sm font-semibold text-teal">{data.station.code}</span>
          <h1 className="mt-1 text-2xl font-bold">Approaching {data.station.name}</h1>
          <p className="text-sm text-muted">
            Next 60 minutes · updated {formatAgo(fetchedAt, now)} · refreshes every 30 s{refreshing && " · refreshing…"}
          </p>
        </div>
        <Link href={`/station/${data.station.code}`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
          Full board
        </Link>
      </header>

      {error && <ErrorState error={error} onRetry={refresh} />}
      {!data.live.available && (
        <Notice tone="warn" title="No live approach detection">
          {data.live.issue?.message ?? "The current data source has no live station feed."} Trains below are listed from the timetable only — they may
          be late, early or cancelled.
        </Notice>
      )}

      <SideSetup stationCode={data.station.code} neighbours={neighbours} orientation={orientation} layoutAvailable={data.layout.available} />

      {sidesKnown && platforms.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Track view</h2>
          <TrackDiagram
            rows={sided}
            platforms={platforms}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
            note={userSet ? "Left and right as you are facing, from your setting." : `Station diagram: ${data.layout.sourceNote}`}
          />
        </Card>
      )}

      {sidesKnown && (
        <div role="radiogroup" aria-label="Show trains" className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === f.id ? f.active : "bg-surface text-muted ring-1 ring-border hover:text-foreground"}`}
            >
              {f.label} <span className="tabular opacity-80">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {sided.length === 0 ? (
        <EmptyState title="No trains due in the next hour">Check the full board for later trains.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No trains on that side right now">Try “All”.</EmptyState>
      ) : sidesKnown && filter === "all" ? (
        <div className="space-y-5">
          <Section title={`← From ${userSet ? "your" : "the"} left`} tone="text-teal" rows={groups.left} now={now} />
          <Section title={`From ${userSet ? "your" : "the"} right →`} tone="text-accent" rows={groups.right} now={now} />
          <Section title="Starts here" rows={groups.startsHere} now={now} />
          <Section title="Side not known" rows={groups.unknown} now={now} />
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <TrainCard key={r.key} r={r} now={now} />
          ))}
        </ul>
      )}

      <Notice>
        Left and right come from your setting (or a verified station diagram) plus the station each train really comes from. Phone GPS cannot tell which
        track or platform a train is on, so we never guess it.
      </Notice>
    </div>
  );
}
