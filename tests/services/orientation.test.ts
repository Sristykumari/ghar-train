import { describe, expect, it } from "vitest";
import {
  applySides,
  completeOrientation,
  describeSide,
  groupBySide,
  neighboursOf,
  swapOrientation,
} from "@/lib/services/orientation";
import type { BoardRow } from "@/lib/services/views";

const st = (code: string) => ({ code, name: `${code} Station` });

function row(key: string, from: string | null, to: string | null, extra: Partial<BoardRow> = {}): BoardRow {
  return {
    key,
    trainNumber: key,
    trainName: `Train ${key}`,
    journeyDate: "2026-10-16",
    sourceCode: "SRC",
    sourceName: null,
    destinationCode: "DST",
    destinationName: null,
    originatesHere: from == null,
    terminatesHere: to == null,
    previousHalt: from ? st(from) : null,
    nextHalt: to ? st(to) : null,
    arrivesFrom: from ? st(from) : null,
    departsToward: to ? st(to) : null,
    arrivalSide: null,
    departureSide: null,
    scheduledArrival: null,
    scheduledDeparture: null,
    expectedArrival: null,
    expectedDeparture: null,
    delayMinutes: null,
    timeQuality: "scheduled",
    platform: null,
    status: "expected",
    lastUpdatedAt: null,
    ...extra,
  };
}

// A through station between WWW (west) and EEE (east).
const rows = [
  row("down1", "WWW", "EEE"),
  row("down2", "WWW", "EEE"),
  row("up1", "EEE", "WWW"),
  row("starter", null, "EEE"),
  row("ender", "WWW", null),
];

describe("left / right at a station", () => {
  it("finds the neighbouring stations from the trains' actual routes", () => {
    expect(neighboursOf(rows).map((n) => [n.code, n.trains])).toEqual([
      ["EEE", 4],
      ["WWW", 4],
    ]);
  });

  it("needs only one answer at a two-direction station", () => {
    const nb = neighboursOf(rows);
    expect(completeOrientation({ EEE: "right" }, nb)).toEqual({ EEE: "right", WWW: "left" });
    expect(completeOrientation({ WWW: "right" }, nb)).toEqual({ WWW: "right", EEE: "left" });
  });

  it("does not guess at a junction with more than two directions", () => {
    const junction = [...rows, row("branch", "NNN", "EEE")];
    expect(completeOrientation({ EEE: "right" }, neighboursOf(junction))).toEqual({ EEE: "right" });
  });

  it("groups trains by the side they come in from, using the passenger's setting", () => {
    const sided = applySides(rows, { EEE: "right", WWW: "left" }, false);
    const g = groupBySide(sided);
    expect(g.left.map((r) => r.key)).toEqual(["down1", "down2", "ender"]);
    expect(g.right.map((r) => r.key)).toEqual(["up1"]);
    expect(g.startsHere.map((r) => r.key)).toEqual(["starter"]);
    expect(sided.find((r) => r.key === "starter")!.side).toEqual({ arrival: null, departure: "right", source: "you" });
    expect(describeSide(sided[0])).toBe("From WWW Station — comes in on your left");
    expect(describeSide(sided.find((r) => r.key === "starter")!)).toBe("Starts here — leaves to your right");
  });

  it("flips every side when facing the other way", () => {
    expect(swapOrientation({ EEE: "right", WWW: "left" })).toEqual({ EEE: "left", WWW: "right" });
  });

  it("uses a verified layout when the passenger has not set anything", () => {
    const withLayout = [row("a", "WWW", "EEE", { arrivalSide: "left", departureSide: "right" })];
    const sided = applySides(withLayout, {}, true);
    expect(sided[0].side).toEqual({ arrival: "left", departure: "right", source: "layout" });
    expect(describeSide(sided[0])).toBe("From WWW Station — comes in on the diagram's left");
  });

  it("prefers the passenger's own setting over the layout diagram", () => {
    const withLayout = [row("a", "WWW", "EEE", { arrivalSide: "left", departureSide: "right" })];
    expect(applySides(withLayout, { WWW: "right", EEE: "left" }, true)[0].side).toEqual({ arrival: "right", departure: "left", source: "you" });
  });

  it("never invents a side when there is no setting and no layout", () => {
    const sided = applySides(rows, null, false);
    expect(sided.every((r) => r.side.arrival === null && r.side.departure === null && r.side.source === null)).toBe(true);
    expect(groupBySide(sided).unknown).toHaveLength(4);
    expect(describeSide(sided[0])).toBe("From WWW Station");
  });

  it("leaves a train without a side when it comes from a neighbour the passenger has not set", () => {
    const junction = [...rows, row("branch", "NNN", "EEE")];
    const sided = applySides(junction, { EEE: "right", WWW: "left" }, false);
    expect(groupBySide(sided).unknown.map((r) => r.key)).toEqual(["branch"]);
  });
});
