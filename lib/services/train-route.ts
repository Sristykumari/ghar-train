import { RailDataError } from "@/lib/domain/errors";
import type { ScheduleStop, Weekday } from "@/lib/domain/types";
import { validateSchedule, type ScheduleIssue } from "@/lib/domain/validation";
import type { RailDataProvider } from "@/lib/providers/types";

export interface TrainRouteView {
  train: { number: string; name: string; type: string | null; sourceCode: string; destinationCode: string; runDays: Weekday[] };
  stops: ScheduleStop[];
  issues: ScheduleIssue[];
}

/** Published timetable for a train (no live data — never consumes live quota). */
export async function getTrainRoute(provider: RailDataProvider, trainNumber: string): Promise<TrainRouteView> {
  const raw = await provider.getTrainSchedule(trainNumber);
  if (!raw) throw new RailDataError("not_found", `Train ${trainNumber} was not found.`);
  const { schedule, issues } = validateSchedule(raw);
  return {
    train: {
      number: schedule.number,
      name: schedule.name,
      type: schedule.type ?? null,
      sourceCode: schedule.sourceCode,
      destinationCode: schedule.destinationCode,
      runDays: schedule.runDays,
    },
    stops: schedule.stops,
    issues,
  };
}
