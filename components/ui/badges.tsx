import type { DataQuality } from "@/lib/domain/types";
import { QUALITY_HELP, QUALITY_LABEL } from "@/lib/client/format";

const QUALITY_STYLE: Record<DataQuality, string> = {
  live: "bg-ok-bg text-ok",
  estimated: "bg-warn-bg text-warn",
  scheduled: "bg-neutral-bg text-neutral",
  simulated: "bg-sim-bg text-sim",
  unavailable: "bg-neutral-bg text-muted",
};

const QUALITY_ICON: Record<DataQuality, string> = {
  live: "●",
  estimated: "◐",
  scheduled: "○",
  simulated: "◇",
  unavailable: "–",
};

/** Tells the user where a value comes from. Shape + text, never colour alone. */
export function QualityBadge({ quality }: { quality: DataQuality }) {
  return (
    <span
      title={QUALITY_HELP[quality]}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${QUALITY_STYLE[quality]}`}
    >
      <span aria-hidden>{QUALITY_ICON[quality]}</span>
      {QUALITY_LABEL[quality]}
      <span className="sr-only">: {QUALITY_HELP[quality]}</span>
    </span>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "sim";

const TONE_STYLE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
  sim: "bg-sim-bg text-sim",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_STYLE[tone]}`}>
      {children}
    </span>
  );
}

export function DelayPill({ minutes }: { minutes: number | null }) {
  if (minutes == null) return <Pill tone="neutral">Delay unknown</Pill>;
  if (minutes <= 5 && minutes >= -5) return <Pill tone="ok">On time</Pill>;
  if (minutes < 0) return <Pill tone="info">{-minutes} min early</Pill>;
  return <Pill tone={minutes >= 30 ? "bad" : "warn"}>{minutes} min late</Pill>;
}

/**
 * Platform number with where it came from. `quietFor` hides the source note when it matches the
 * page's overall source (e.g. every stop of a simulated train), except "usual" which always shows.
 */
export function PlatformTag({ platform, quietFor }: { platform: { value: string; quality: DataQuality } | null; quietFor?: DataQuality }) {
  if (!platform) {
    return (
      <span className="text-xs text-muted" title="No platform information available">
        PF —
      </span>
    );
  }
  const confirmed = platform.quality === "live";
  return (
    <span
      className="inline-flex items-center gap-1 text-sm"
      title={confirmed ? "Platform reported by the live feed" : `${QUALITY_LABEL[platform.quality]} platform — may change`}
    >
      <span className="rounded-md border border-current px-1.5 font-mono font-semibold tabular">PF {platform.value}</span>
      {!confirmed && !(quietFor && platform.quality === quietFor && platform.quality !== "scheduled") && (
        <span className="text-xs text-muted">{platform.quality === "scheduled" ? "usual" : QUALITY_LABEL[platform.quality].toLowerCase()}</span>
      )}
    </span>
  );
}
