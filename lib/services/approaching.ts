import type { BoardRow } from "./views";

const MINUTE = 60_000;

/** Rows for the approaching-trains screen: trains near the station right now. Pure; used on the client. */
export function selectApproaching(rows: BoardRow[], now: number, horizonMinutes = 60): BoardRow[] {
  return rows.filter((r) => {
    if (r.status === "at_platform" || r.status === "approaching") return true;
    if (r.status === "departed") {
      const left = r.expectedDeparture ?? r.scheduledDeparture;
      return left != null && now - left <= 10 * MINUTE;
    }
    if (r.status === "scheduled_passed") return false;
    const t = r.expectedArrival ?? r.expectedDeparture;
    return t != null && t >= now - 5 * MINUTE && t - now <= horizonMinutes * MINUTE;
  });
}

export type ApproachPhase = "approaching" | "at_platform" | "departing" | "expected" | "scheduled";

export function approachPhase(r: BoardRow): ApproachPhase {
  switch (r.status) {
    case "at_platform":
      return "at_platform";
    case "approaching":
      return "approaching";
    case "departed":
      return "departing";
    case "expected":
      return "expected";
    default:
      return "scheduled";
  }
}
