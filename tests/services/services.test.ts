import { describe, expect, it, vi } from "vitest";
import { RailDataError } from "@/lib/domain/errors";
import { InMemoryProvider } from "@/lib/providers/in-memory/provider";
import type { SimulationProfile } from "@/lib/providers/in-memory/simulator";
import { selectApproaching } from "@/lib/services/approaching";
import { assessFreshness } from "@/lib/services/freshness";
import { getStationBoard, sideFromRoute } from "@/lib/services/station-board";
import { classifyPunctuality, getTrainStatus } from "@/lib/services/train-status";
import type { BoardRow } from "@/lib/services/views";
import { at, FIXTURE_DATE, fixtureDataset, LAYOUTS, TRAINS } from "../fixtures/network";

function provider(nowHHMM: string, profiles: Record<string, SimulationProfile | null>, live = true) {
  const now = at(nowHHMM);
  return { now, p: new InMemoryProvider(fixtureDataset(profiles), { now: () => now, live }) };
}

describe("train status — stoppage display", () => {
  it("shows departed, current and next stops with expected times", async () => {
    const { now, p } = provider("09:50", { "11001": { delayMinutes: 0, updateLagMinutes: 1 } });
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now, staleAfterMinutes: 15 });
    expect(v.stops.map((s) => s.progress)).toEqual(["departed", "departed", "next", "upcoming", "upcoming"]);
    expect(v.nextStop?.stationCode).toBe("CCC");
    expect(v.currentLocation).toBe("Between Bravo Junction and Charlie.");
    expect(v.movement).toBe("departed");
    expect(v.freshness.quality).toBe("simulated");
    expect(v.stops[1].platform).toEqual({ value: "2", quality: "scheduled" });
  });

  it("reports approaching and at-station states", async () => {
    const live = { "11001": { delayMinutes: 0, updateLagMinutes: 1 } };
    const a = provider("10:25", live);
    expect((await getTrainStatus(a.p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now: a.now, staleAfterMinutes: 15 })).movement).toBe("approaching");
    const b = provider("10:32", live);
    const v = await getTrainStatus(b.p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now: b.now, staleAfterMinutes: 15 });
    expect(v.movement).toBe("arrived");
    expect(v.stops[2].progress).toBe("at_station");
  });
});

describe("train status — missing, stale and delayed live data", () => {
  it("falls back to the timetable when live data is unavailable", async () => {
    const { now, p } = provider("09:50", {});
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now, staleAfterMinutes: 15 });
    expect(v.freshness.quality).toBe("scheduled");
    expect(v.movement).toBe("unknown");
    expect(v.currentLocation).toMatch(/unavailable/);
    expect(v.position).toBeNull();
    expect(v.stops.every((s) => s.timeQuality === "scheduled")).toBe(true);
  });

  it("marks stale live data as estimated", () => {
    expect(assessFreshness("live", at("09:00"), at("09:10"), 15)).toMatchObject({ quality: "live", stale: false });
    expect(assessFreshness("live", at("09:00"), at("09:40"), 15)).toMatchObject({ quality: "estimated", stale: true, ageMinutes: 40 });
    expect(assessFreshness("live", 0, at("09:40"), 15)).toMatchObject({ quality: "estimated", stale: true, ageMinutes: null });
  });

  it("flags stale simulated data without pretending it is live", async () => {
    const { now, p } = provider("09:50", { "11001": { delayMinutes: 0, updateLagMinutes: 45 } });
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now, staleAfterMinutes: 15 });
    expect(v.freshness).toMatchObject({ quality: "simulated", stale: true });
  });

  it("shows delays and propagates them to later stops as estimates", async () => {
    const { now, p } = provider("09:50", { "11001": { delayMinutes: 25, updateLagMinutes: 1 } });
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now, staleAfterMinutes: 15 });
    expect(v.punctuality).toBe("delayed");
    expect(v.delayMinutes).toBe(25);
    const eee = v.stops[4];
    expect(eee.expectedArrival! - eee.scheduledArrival!).toBe(25 * 60_000);
    expect(classifyPunctuality(3)).toBe("on_time");
    expect(classifyPunctuality(-10)).toBe("early");
    expect(classifyPunctuality(null)).toBe("unknown");
  });

  it("keeps showing the timetable when the live call fails (e.g. rate limited)", async () => {
    const { now, p } = provider("09:50", { "11001": { delayMinutes: 0, updateLagMinutes: 1 } });
    vi.spyOn(p, "getLiveStatus").mockRejectedValue(new RailDataError("rate_limited", "Quota exceeded", { retryAfterSeconds: 60 }));
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now, staleAfterMinutes: 15 });
    expect(v.liveIssue).toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    expect(v.freshness.quality).toBe("scheduled");
    expect(v.stops).toHaveLength(5);
  });

  it("notes when the train does not run on the chosen date", async () => {
    const { now, p } = provider("09:50", {});
    const v = await getTrainStatus(p, { trainNumber: "11009", journeyDate: "2026-10-17", now, staleAfterMinutes: 15 });
    expect(v.runsOnDate).toBe(false);
  });
});

describe("station board and approaching trains", () => {
  it("merges timetable and live board with direction and track side", async () => {
    const { now, p } = provider("08:55", { "11001": { delayMinutes: 0, updateLagMinutes: 1, livePlatforms: { BBB: "4" } } });
    const b = await getStationBoard(p, { stationCode: "BBB", hours: 2, now, staleAfterMinutes: 15 });
    const slow = b.rows.find((r) => r.trainNumber === "11001")!;
    expect(slow.status).toBe("approaching");
    expect(slow.previousHalt?.code).toBe("AAA");
    expect(slow.nextHalt?.code).toBe("CCC");
    expect(slow.arrivalSide).toBe("left");
    expect(slow.departureSide).toBe("right");
    // Live-reported platform wins over the usual timetable platform ("2").
    expect(slow.platform).toEqual({ value: "4", quality: "simulated" });

    const fast = b.rows.find((r) => r.trainNumber === "11002")!;
    expect(fast.status).toBe("scheduled");
    expect(fast.originatesHere).toBe(true);
    expect(fast.arrivalSide).toBeNull();
    expect(fast.timeQuality).toBe("scheduled");
    expect(b.layout.available).toBe(true);

    // Later stops come from each train's own route; stations it passes without stopping are left out.
    expect(slow.haltsAfter).toEqual(["CCC", "DDD", "EEE"]);
    expect(fast.haltsAfter).toEqual(["DDD", "EEE"]);
  });

  it("never assigns a side without a verified layout", () => {
    const route = TRAINS[0];
    expect(sideFromRoute(null, route, "BBB", "arrival")).toBeNull();
    expect(sideFromRoute(LAYOUTS[0], route, "BBB", "arrival")).toBe("left");
    // A station not in the layout's neighbour lists gives no side either.
    expect(sideFromRoute({ ...LAYOUTS[0], leftNeighbours: [], rightNeighbours: [] }, route, "BBB", "arrival")).toBeNull();
  });

  it("labels the board as timetable-only when the live board fails", async () => {
    const { now, p } = provider("08:55", {});
    vi.spyOn(p, "getStationLiveBoard").mockRejectedValue(new RailDataError("upstream_unavailable", "down"));
    const b = await getStationBoard(p, { stationCode: "BBB", hours: 2, now, staleAfterMinutes: 15 });
    expect(b.live).toMatchObject({ available: false, issue: { code: "upstream_unavailable" } });
    expect(b.rows.every((r) => r.timeQuality === "scheduled")).toBe(true);
  });

  it("returns not_found for an unknown station", async () => {
    const { now, p } = provider("08:55", {});
    await expect(getStationBoard(p, { stationCode: "ZZZ", hours: 2, now, staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("selects only trains near the station for the approaching screen", () => {
    const now = at("09:00");
    const row = (key: string, status: BoardRow["status"], arr: string | null, dep: string | null) =>
      ({ key, status, expectedArrival: arr ? at(arr) : null, expectedDeparture: dep ? at(dep) : null, scheduledDeparture: dep ? at(dep) : null }) as BoardRow;
    const rows = [
      row("here", "at_platform", "08:58", "09:03"),
      row("soon", "approaching", "09:08", "09:10"),
      row("later", "expected", "11:00", "11:05"),
      row("justLeft", "departed", "08:50", "08:55"),
      row("longGone", "departed", "08:00", "08:10"),
      row("noLive", "scheduled_passed", "08:57", "08:58"),
    ];
    expect(selectApproaching(rows, now).map((r) => r.key)).toEqual(["here", "soon", "justLeft"]);
  });
});
