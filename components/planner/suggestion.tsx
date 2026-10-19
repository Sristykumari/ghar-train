import { formatDuration, formatTime } from "@/lib/client/format";
import type { JourneyOption, PlanResult } from "@/lib/planner/types";
import { RISK_LABEL } from "./journey-card";

interface StepItem {
  icon: string;
  text: React.ReactNode;
}

/** Turns an option into plain step-by-step instructions. Exported for reuse in details. */
export function stepsFor(option: JourneyOption, destinationName: string): StepItem[] {
  const steps: StepItem[] = [];
  option.legs.forEach((leg, i) => {
    const transfer = option.transfers.find((t) => t.departure === leg.departure && t.station.code === leg.from.code);
    const isOnboard = i === 0 && !transfer;
    if (isOnboard) {
      steps.push({
        icon: "🚆",
        text: (
          <>
            Stay on <strong>{leg.trainNumber}</strong> until <strong>{leg.to.name}</strong>, arriving about <strong>{formatTime(leg.arrival)}</strong>.
          </>
        ),
      });
      return;
    }
    if (transfer) {
      steps.push({
        icon: "🔁",
        text: (
          <>
            Change at <strong>{transfer.station.name}</strong> — you&apos;ll have <strong>{formatDuration(transfer.waitMinutes)}</strong> ({RISK_LABEL[transfer.risk].toLowerCase()}).
          </>
        ),
      });
    }
    const pf = leg.departurePlatform;
    steps.push({
      icon: "🎫",
      text: (
        <>
          Take <strong>{leg.trainNumber}</strong> {leg.trainName} at <strong>{formatTime(leg.departure)}</strong>
          {pf ? (pf.quality === "scheduled" ? `, usually from platform ${pf.value}` : `, platform ${pf.value}`) : ", platform not known yet"}.
        </>
      ),
    });
  });
  steps.push({
    icon: "🏠",
    text: (
      <>
        Reach <strong>{destinationName}</strong> at <strong>{formatTime(option.arrivalTime)}</strong> — about {formatDuration(option.minutesToDestination)} from now.
      </>
    ),
  });
  return steps;
}

/** The single recommendation, in everyday words, shown before all the detail. */
export function Suggestion({ result }: { result: PlanResult }) {
  const fastest = result.options.find((o) => o.id === result.fastestId) ?? null;
  const pick = fastest ?? result.current;
  if (!pick) return null;
  const staying = pick.kind === "current";
  const saved = fastest?.minutesSavedVsCurrent;

  return (
    <section aria-labelledby="suggestion-title" className="deep-gradient rounded-2xl p-5 text-white shadow-lg">
      <p className="text-xs font-semibold tracking-wide text-white/85 uppercase">Our suggestion</p>
      <h2 id="suggestion-title" className="mt-1 text-xl font-bold sm:text-2xl">
        {staying
          ? "Stay on your train — it's the quickest way"
          : saved && saved > 0
            ? `Change trains and arrive ${formatDuration(saved)} earlier`
            : `Best way to reach ${result.destination.name}`}
      </h2>
      <ol className="mt-4 space-y-2">
        {stepsFor(pick, result.destination.name).map((s, i) => (
          <li key={i} className="flex gap-3 rounded-xl bg-white/12 px-3 py-2 backdrop-blur-sm">
            <span aria-hidden className="text-lg leading-6">
              {s.icon}
            </span>
            <span className="leading-6">{s.text}</span>
          </li>
        ))}
      </ol>
      {!staying && pick.risk !== "low" && (
        <p className="mt-3 text-sm text-white/90">
          ⚠️ This change is {pick.risk === "high" ? "tight" : "a little tight"}. If your train gets later, check again — or see safer options below.
        </p>
      )}
    </section>
  );
}
