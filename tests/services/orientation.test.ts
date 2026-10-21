import { describe, expect, it } from "vitest";
import {
  applySides,
  completeOrientation,
  describeSide,
  groupBySide,
  neighboursOf,
  swapOrientation,
} from "@/lib/services/orientation";
import { goingHome, reachesHome } from "@/lib/services/going-home";
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
    haltsAfter: null,
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

describe("going home", () => {
  // Home is HOM, two stops east of here (EEE, then HOM).
  const east = { haltsAfter: ["EEE", "HOM"] };
  const homeRows = [
    row("down1", "WWW", "EEE", east),
    row("up1", "EEE", "WWW", { haltsAfter: ["WWW"] }),
    row("starter", null, "EEE", east),
    row("ender", "WWW", null, { haltsAfter: [] }),
    row("unknown", "WWW", "EEE"), // route not loaded: haltsAfter null
  ];
  const facing = { EEE: "right", WWW: "left" } as const;

  it("lists only trains that stop at home later on their route", () => {
    expect(reachesHome(homeRows[0], "HOM")).toBe(true);
    expect(reachesHome(homeRows[1], "HOM")).toBe(false);
    expect(reachesHome(homeRows[3], "HOM")).toBe(false);
    expect(goingHome(applySides(homeRows, facing, false), "HOM").trains.map((r) => r.key)).toEqual(["down1", "starter"]);
  });

  it("skips a train that has just left when picking the next train home", () => {
    const rows = [row("gone", "WWW", "EEE", { ...east, status: "departed" }), ...homeRows];
    const g = goingHome(applySides(rows, facing, false), "HOM");
    expect(g.trains.map((r) => r.key)).toEqual(["gone", "down1", "starter"]);
    expect(g.next?.key).toBe("down1");
    expect(goingHome(applySides([rows[0]], facing, false), "HOM").next).toBeNull();
  });

  it("counts trains with an unknown route as unchecked instead of guessing", () => {
    expect(reachesHome(homeRows[4], "HOM")).toBeNull();
    expect(goingHome(applySides(homeRows, facing, false), "HOM").unchecked).toBe(1);
  });

  it("tells which side home trains come in from and leave towards", () => {
    const g = goingHome(applySides(homeRows, facing, false), "HOM");
    // The starter has no arrival side, so it does not count against "comes in from your left".
    expect(g.arrivesFrom).toBe("left");
    expect(g.leavesTo).toBe("right");
  });

  it("gives no side when sides are unknown or the home trains disagree", () => {
    expect(goingHome(applySides(homeRows, null, false), "HOM")).toMatchObject({ arrivesFrom: null, leavesTo: null });
    // A train that reverses here (comes in from the east and goes back east) disagrees with the through train.
    const reversing = [...homeRows, row("rev", "EEE", "EEE", east)];
    expect(goingHome(applySides(reversing, facing, false), "HOM")).toMatchObject({ arrivesFrom: null, leavesTo: "right" });
  });
});
