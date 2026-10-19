/**
 * Left / right at a station.
 *
 * Which side a train comes from depends on which way you are facing, so it
 * cannot be computed from a map. Two honest sources are supported:
 *
 * - "you":    the passenger says, once per station, which side trains towards
 *             a neighbouring station leave on (stored in their browser).
 * - "layout": a verified station track layout from the data source.
 *
 * Given either, the side of every train follows from the station it actually
 * comes from on its route (including stations it passes without stopping).
 * Pure functions: used by the UI and covered by tests.
 */
import type { BoardRow } from "./views";

export type Side = "left" | "right";
export type SideSource = "you" | "layout";

/** Neighbouring station code → the side of the platform it lies on, as seen by the passenger. */
export type Orientation = Record<string, Side>;

export interface Neighbour {
  code: string;
  name: string;
  /** How many listed trains come from or go to this neighbour. */
  trains: number;
}

export interface SidedRow extends BoardRow {
  side: {
    arrival: Side | null;
    departure: Side | null;
    source: SideSource | null;
  };
}

export const opposite = (s: Side): Side => (s === "left" ? "right" : "left");

/** Adjacent stations that trains at this station come from or go to, busiest first. */
export function neighboursOf(rows: BoardRow[]): Neighbour[] {
  const map = new Map<string, Neighbour>();
  for (const r of rows) {
    for (const n of [r.originatesHere ? null : r.arrivesFrom, r.terminatesHere ? null : r.departsToward]) {
      if (!n) continue;
      const cur = map.get(n.code) ?? { code: n.code, name: n.name, trains: 0 };
      cur.trains++;
      map.set(n.code, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.trains - a.trains || a.name.localeCompare(b.name));
}

/**
 * At a simple through station there are only two directions, so one answer
 * is enough: the other neighbour must be on the opposite side.
 */
export function completeOrientation(orientation: Orientation, neighbours: Neighbour[]): Orientation {
  const out = { ...orientation };
  if (neighbours.length === 2) {
    const [a, b] = neighbours;
    if (out[a.code] && !out[b.code]) out[b.code] = opposite(out[a.code]);
    else if (out[b.code] && !out[a.code]) out[a.code] = opposite(out[b.code]);
  }
  return out;
}

/** Facing the other way flips every side. */
export function swapOrientation(orientation: Orientation): Orientation {
  return Object.fromEntries(Object.entries(orientation).map(([k, v]) => [k, opposite(v)]));
}

/**
 * Adds the effective side to each row. The passenger's own setting wins
 * (it is "your left"); otherwise a verified layout is used; otherwise null.
 */
export function applySides(rows: BoardRow[], orientation: Orientation | null, layoutAvailable: boolean): SidedRow[] {
  const hasYours = !!orientation && Object.keys(orientation).length > 0;
  return rows.map((r) => {
    if (hasYours) {
      const arrival = !r.originatesHere && r.arrivesFrom ? (orientation![r.arrivesFrom.code] ?? null) : null;
      const departure = !r.terminatesHere && r.departsToward ? (orientation![r.departsToward.code] ?? null) : null;
      return { ...r, side: { arrival, departure, source: arrival || departure ? "you" : null } };
    }
    if (layoutAvailable && (r.arrivalSide || r.departureSide)) {
      return { ...r, side: { arrival: r.arrivalSide, departure: r.departureSide, source: "layout" } };
    }
    return { ...r, side: { arrival: null, departure: null, source: null } };
  });
}

export interface SideGroups {
  left: SidedRow[];
  right: SidedRow[];
  startsHere: SidedRow[];
  unknown: SidedRow[];
}

/** Groups trains by the side they come in from. Trains starting here have no arrival side. */
export function groupBySide(rows: SidedRow[]): SideGroups {
  const g: SideGroups = { left: [], right: [], startsHere: [], unknown: [] };
  for (const r of rows) {
    if (r.originatesHere) g.startsHere.push(r);
    else if (r.side.arrival === "left") g.left.push(r);
    else if (r.side.arrival === "right") g.right.push(r);
    else g.unknown.push(r);
  }
  return g;
}

/** Plain-language description of where a train comes from and goes to. */
export function describeSide(r: SidedRow): string {
  const who = r.side.source === "you" ? "your" : "the diagram's";
  const from = r.arrivesFrom?.name ?? r.previousHalt?.name;
  if (r.originatesHere) {
    return r.side.departure ? `Starts here — leaves to ${who} ${r.side.departure}` : "Starts here";
  }
  if (!from) return "Arrival direction unknown";
  return r.side.arrival ? `From ${from} — comes in on ${who} ${r.side.arrival}` : `From ${from}`;
}
