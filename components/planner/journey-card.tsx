import Link from "next/link";
import { Pill, PlatformTag, QualityBadge, type Tone } from "@/components/ui/badges";
import { formatDuration, formatTime } from "@/lib/client/format";
import type { JourneyOption, Risk } from "@/lib/planner/types";

export const RISK_TONE: Record<Risk, Tone> = { low: "ok", medium: "warn", high: "bad" };
export const RISK_LABEL: Record<Risk, string> = { low: "Comfortable change", medium: "Tight change", high: "Risky change" };

export function RiskPill({ risk, changes }: { risk: Risk; changes: number }) {
  if (changes === 0) return <Pill tone="ok">No change</Pill>;
  return <Pill tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</Pill>;
}

export function SavedText({ minutes }: { minutes: number | null }) {
  if (minutes == null) return null;
  if (minutes > 0) return <span className="font-semibold text-ok">{formatDuration(minutes)} earlier</span>;
  if (minutes < 0) return <span className="font-semibold text-bad">{formatDuration(-minutes)} later</span>;
  return <span className="text-muted">Same arrival</span>;
}

/** Compact leg-by-leg itinerary used in result lists. */
export function Itinerary({ option }: { option: JourneyOption }) {
  return (
    <ol className="space-y-2">
      {option.legs.map((leg, i) => {
        const transfer = option.transfers.find((t) => t.station.code === leg.from.code && t.departure === leg.departure);
        return (
          <li key={`${leg.trainNumber}-${i}`}>
            {transfer && (
              <div className="mb-2 ml-1 border-l-2 border-dashed border-border pl-3 text-sm">
                <p>
                  Change at <strong>{transfer.station.name}</strong> · wait {formatDuration(transfer.waitMinutes)}{" "}
                  <Pill tone={RISK_TONE[transfer.risk]}>{RISK_LABEL[transfer.risk]}</Pill>
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{leg.trainNumber}</span>
              <span className="min-w-0 truncate">{leg.trainName}</span>
              <span className="tabular">
                {leg.from.code} {formatTime(leg.departure)} → {leg.to.code} {formatTime(leg.arrival)}
              </span>
              {i > 0 || option.kind === "current" ? <PlatformTag platform={leg.departurePlatform} /> : null}
              <QualityBadge quality={leg.quality} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function JourneyCard({
  option,
  highlight,
  detailsHref,
}: {
  option: JourneyOption;
  highlight?: string;
  detailsHref: string;
}) {
  return (
    <article className={`rounded-2xl border bg-surface p-4 ${highlight ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {highlight && <p className="text-xs font-semibold tracking-wide text-primary uppercase">{highlight}</p>}
          <p className="text-sm text-muted">Arrive</p>
          <p className="font-mono text-2xl font-semibold tabular">{formatTime(option.arrivalTime)}</p>
          <p className="text-sm">
            in {formatDuration(option.minutesToDestination)} · <SavedText minutes={option.minutesSavedVsCurrent} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="neutral">
            {option.changes} change{option.changes === 1 ? "" : "s"}
          </Pill>
          <RiskPill risk={option.risk} changes={option.changes} />
          <Pill tone={option.confidence === "high" ? "ok" : option.confidence === "medium" ? "warn" : "bad"}>{option.confidence} confidence</Pill>
        </div>
      </div>
      <div className="mt-3">
        <Itinerary option={option} />
      </div>
      {option.transfers.some((t) => t.notes.length) && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-muted">
          {[...new Set(option.transfers.flatMap((t) => t.notes))].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <Link href={detailsHref} className="mt-3 inline-block text-sm font-medium text-primary underline">
        Journey details
      </Link>
    </article>
  );
}
