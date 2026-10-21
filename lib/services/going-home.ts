/**
 * "Going home": which trains at this station stop at the passenger's home
 * station later on, and which side they come in from and leave towards.
 *
 * Uses only the stops on each train's own route (`haltsAfter`), never a map.
 * A train whose route is unknown is counted as unchecked, never guessed.
 * Pure functions: used by the UI and covered by tests.
 */
import type { Side, SidedRow } from "./orientation";
import type { BoardRow } from "./views";

export interface HomeStation {
  code: string;
  name: string;
}

export interface GoingHome {
  /** Trains that stop at home later on their route, in board order. */
  trains: SidedRow[];
  /** The first of them you can still catch (trains that have just left are skipped). */
  next: SidedRow | null;
  /** The side all of them come in from, when they agree and it is known. Trains starting here are left out. */
  arrivesFrom: Side | null;
  /** The side all of them leave towards, when they agree and it is known. */
  leavesTo: Side | null;
  /** Trains whose route is unknown, so we cannot tell whether they go home. */
  unchecked: number;
}

/** `true`/`false` when the route is known, `null` when it is not. */
export function reachesHome(r: BoardRow, homeCode: string): boolean | null {
  if (r.terminatesHere) return false;
  if (!r.haltsAfter) return null;
  return r.haltsAfter.includes(homeCode);
}

/** One side only when every value is that side; any unknown or disagreement gives `null`. */
function agreed(sides: (Side | null)[]): Side | null {
  const set = new Set(sides);
  return set.size === 1 ? [...set][0] : null;
}

export function goingHome(rows: SidedRow[], homeCode: string): GoingHome {
  const trains: SidedRow[] = [];
  let unchecked = 0;
  for (const r of rows) {
    const reach = reachesHome(r, homeCode);
    if (reach === null) unchecked++;
    else if (reach) trains.push(r);
  }
  return {
    trains,
    next: trains.find((r) => r.status !== "departed") ?? null,
    arrivesFrom: agreed(trains.filter((r) => !r.originatesHere).map((r) => r.side.arrival)),
    leavesTo: agreed(trains.map((r) => r.side.departure)),
    unchecked,
  };
}
