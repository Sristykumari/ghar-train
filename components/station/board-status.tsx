import { Pill, type Tone } from "@/components/ui/badges";
import type { BoardRowStatus } from "@/lib/services/views";

const STATUS: Record<BoardRowStatus, { tone: Tone; label: string }> = {
  at_platform: { tone: "ok", label: "At platform" },
  approaching: { tone: "info", label: "Approaching" },
  expected: { tone: "neutral", label: "Expected" },
  departed: { tone: "neutral", label: "Departed" },
  scheduled: { tone: "neutral", label: "Scheduled" },
  scheduled_passed: { tone: "warn", label: "No live update" },
};

export function BoardStatus({ status }: { status: BoardRowStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}
