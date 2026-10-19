import { describe, expect, it } from "vitest";
import { RailDataError } from "@/lib/domain/errors";
import { InMemoryProvider } from "@/lib/providers/in-memory/provider";
import type { SimulationProfile } from "@/lib/providers/in-memory/simulator";
import { compareOptions, evaluateChain, paretoFilter, planAlternatives, transferRisk } from "@/lib/planner/planner";
import type { JourneyOption, PlanRequest } from "@/lib/planner/types";
import { at, FIXTURE_DATE, fixtureDataset, train, TRAINS } from "../fixtures/network";

const onTime: SimulationProfile = { delayMinutes: 0, updateLagMinutes: 1 };

function setup(nowHHMM: string, profiles: Record<string, SimulationProfile | null> = { "11001": onTime }, opts: { live?: boolean } = {}) {
  const now = at(nowHHMM);
  const provider = new InMemoryProvider(fixtureDataset(profiles), { now: () => now, live: opts.live });
  return { now, provider };
}

const baseReq: PlanRequest = {
  trainNumber: "11001",
  journeyDate: FIXTURE_DATE,
  currentStation: "BBB",
  destination: "EEE",
  minTransferMinutes: 15,
  maxChanges: 2,
};

async function plan(nowHHMM: string, req: Partial<PlanRequest> = {}, profiles?: Record<string, SimulationProfile | null>, extra: { live?: boolean; maxStationLookups?: number } = {}) {
  const { now, provider } = setup(nowHHMM, profiles, extra);
  return planAlternatives(
    { provider, now, staleAfterMinutes: 15, maxStationLookups: extra.maxStationLookups ?? 100 },
    { ...baseReq, ...req },
  );
}

const trains = (o: JourneyOption) => o.legs.map((l) => l.trainNumber);

describe("planAlternatives — alternative route calculation", () => {
  it("compares the current journey with faster alternatives and ranks by arrival time", async () => {
    const r = await plan("08:30");
    expect(r.current).not.toBeNull();
    expect(r.current!.arrivalTime).toBe(at("14:00"));
    expect(r.current!.changes).toBe(0);

    expect(r.options.map(trains)).toEqual([
      ["11005", "11006"], // 10:50, 2 changes
      ["11002"], // 11:15, 1 change
    ]);
    expect(r.options[0].arrivalTime).toBe(at("10:50"));
    expect(r.options[0].minutesSavedVsCurrent).toBe(190);
    expect(r.fastestId).toBe(r.options[0].id);
    // Sorted by arrival, not by train speed or changes
    expect([...r.options].sort(compareOptions)).toEqual(r.options);
  });

  it("supports routes with more than one change and reports each interchange", async () => {
    const r = await plan("08:30");
    const twoChange = r.options.find((o) => o.changes === 2)!;
    expect(twoChange.transfers.map((t) => t.station.code)).toEqual(["BBB", "XXX"]);
    expect(twoChange.transfers.map((t) => t.waitMinutes)).toEqual([20, 20]);
    expect(twoChange.risk).toBe("high");
  });

  it("limits the number of changes when asked", async () => {
    const r = await plan("08:30", { maxChanges: 1 });
    expect(r.options.every((o) => o.changes <= 1)).toBe(true);
    expect(r.options[0].legs.map((l) => l.trainNumber)).toEqual(["11002"]);
  });

  it("includes the current train leg when the change happens at a later stop", async () => {
    const r = await plan("07:50", { currentStation: "AAA" });
    const viaBBB = r.options.find((o) => trains(o).join() === "11001,11002");
    expect(viaBBB).toBeDefined();
    expect(viaBBB!.legs[0]).toMatchObject({ from: { code: "AAA" }, to: { code: "BBB" } });
  });

  it("finds a route when the destination is not on the current train's route", async () => {
    const r = await plan("08:30", { destination: "XXX" });
    expect(r.current).toBeNull();
    expect(r.currentNote).toMatch(/does not stop at Xray/);
    expect(r.options[0].legs.map((l) => l.trainNumber)).toEqual(["11005"]);
  });
});

describe("planAlternatives — transfer feasibility", () => {
  it("enforces the minimum transfer time and records the near miss", async () => {
    const r = await plan("08:30");
    expect(r.options.flatMap(trains)).not.toContain("11003");
    const miss = r.rejected.find((x) => x.trainNumber === "11003");
    expect(miss?.reason).toMatch(/Only 12 min to change; at least 15 min needed/);
  });

  it("allows a tighter connection when the passenger accepts a shorter transfer", async () => {
    const r = await plan("08:30", { minTransferMinutes: 10 });
    expect(trains(r.options[0])).toEqual(["11003"]);
    expect(r.options[0].risk).toBe("high");
  });

  it("drops options that are dominated on arrival, changes and risk", async () => {
    const r = await plan("08:30");
    // 11004 (CCC 10:50 → EEE 12:30, high risk) is later and riskier than 11002 with the same number of changes.
    expect(r.options.flatMap(trains)).not.toContain("11004");
  });

  it("never suggests a connection that has already departed", async () => {
    // 11001 runs 30 min late: reaches BBB 09:30, by which time 11002 (09:30) has left.
    const r = await plan("09:31", {}, { "11001": { delayMinutes: 30, updateLagMinutes: 1 } });
    expect(r.options.flatMap(trains)).not.toContain("11002");
    expect(r.rejected.some((x) => x.trainNumber === "11002" && /already departed|before you would arrive|Only/.test(x.reason))).toBe(true);
  });
});

describe("planAlternatives — delays and live data", () => {
  it("uses the current train's live delay to re-check every connection", async () => {
    const r = await plan("08:30", {}, { "11001": { delayMinutes: 20, updateLagMinutes: 1 } });
    expect(r.current!.arrivalTime).toBe(at("14:20"));
    expect(r.currentTrain.delayMinutes).toBe(20);
    // Arriving BBB 09:20 makes 11002 (09:30) and 11005 (09:20) impossible at a 15 min minimum.
    expect(r.options).toHaveLength(0);
    expect(r.rejected.find((x) => x.trainNumber === "11002")?.reason).toMatch(/Only 10 min/);
  });

  it("overlays live running data for connecting trains", async () => {
    const r = await plan("08:30", {}, { "11001": onTime, "11002": { delayMinutes: 10, updateLagMinutes: 1 } });
    const fast = r.options.find((o) => trains(o).join() === "11002")!;
    expect(fast.arrivalTime).toBe(at("11:25"));
    expect(fast.legs[0].quality).toBe("simulated");
    // 11002 has not started yet, so the feed gives expected times but no overall delay figure.
    expect(fast.legs[0].scheduledArrival).toBe(at("11:15"));
  });

  it("marks timetable-only connections and lowers confidence", async () => {
    const r = await plan("08:30");
    const fast = r.options.find((o) => trains(o).join() === "11002")!;
    expect(fast.legs[0].quality).toBe("scheduled");
    expect(fast.confidence).not.toBe("high");
    expect(fast.transfers[0].notes.join(" ")).toMatch(/No live status for 11002/);
  });

  it("warns when the current train has no live status", async () => {
    const r = await plan("08:30", {}, {}, { live: false });
    expect(r.currentTrain.quality).toBe("scheduled");
    expect(r.warnings.join(" ")).toMatch(/assumes it runs to the timetable/);
  });
});

describe("planAlternatives — invalid situations", () => {
  it("rejects a station the train has already left", async () => {
    await expect(plan("09:10")).rejects.toThrow(/already left Bravo Junction.*Charlie/);
  });

  it("rejects a run that has already finished", async () => {
    await expect(plan("15:00")).rejects.toThrow(/already completed/);
  });

  it("rejects a station that is not on the route", async () => {
    await expect(plan("08:30", { currentStation: "XXX" })).rejects.toThrow(/not on the route/);
  });

  it("rejects a date the train does not run", async () => {
    await expect(plan("08:30", { trainNumber: "11009", currentStation: "EEE", destination: "AAA", journeyDate: "2026-10-17" })).rejects.toThrow(
      /does not leave its origin/,
    );
  });

  it("reports unknown trains as not found", async () => {
    const err = await plan("08:30", { trainNumber: "99999" }).catch((e) => e);
    expect(err).toBeInstanceOf(RailDataError);
    expect(err.code).toBe("not_found");
  });

  it("skips trains with an invalid timetable and says so", async () => {
    const now = at("08:30");
    const broken = train("11010", "Broken Timetable", [
      ["BBB", null, "09:40"],
      ["EEE", "09:10", null], // arrives before it departs
    ]);
    const provider = new InMemoryProvider({ ...fixtureDataset({ "11001": onTime }), trains: [...TRAINS, broken] }, { now: () => now });
    const r = await planAlternatives({ provider, now, staleAfterMinutes: 15, maxStationLookups: 100 }, baseReq);
    expect(r.options.flatMap(trains)).not.toContain("11010");
    expect(r.warnings.join(" ")).toMatch(/11010/);
  });

  it("flags a search truncated by the provider lookup budget", async () => {
    const r = await plan("08:30", {}, undefined, { maxStationLookups: 1 });
    expect(r.stats.truncated).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/limited/);
  });
});

describe("planner helpers", () => {
  it("grades transfer risk by slack over the minimum", () => {
    expect(transferRisk(15, 15)).toBe("high");
    expect(transferRisk(30, 15)).toBe("medium");
    expect(transferRisk(45, 15)).toBe("low");
  });

  it("rejects a chain whose connection is shorter than the minimum transfer", () => {
    const now = at("08:30");
    const trip = (id: string, stops: [string, number | null, number | null][]) => ({
      id,
      trainNumber: id,
      trainName: id,
      journeyDate: FIXTURE_DATE,
      quality: "scheduled" as const,
      delayMinutes: null,
      lastUpdatedAt: null,
      stops: stops.map(([c, a, d]) => ({
        stationCode: c,
        stationName: c,
        arrival: a,
        departure: d,
        scheduledArrival: a,
        scheduledDeparture: d,
        isHalt: true,
        platform: null,
        departed: false,
      })),
    });
    const trips = new Map([
      ["A", trip("A", [["P", null, at("09:00")], ["Q", at("10:00"), null]])],
      ["B", trip("B", [["Q", null, at("10:05")], ["R", at("11:00"), null]])],
    ]);
    const r = evaluateChain(
      { onboard: { tripId: "A", boardIdx: 0, alightIdx: 1 }, start: { stationCode: "P", time: now }, rides: [{ tripId: "B", boardIdx: 0, alightIdx: 1 }] },
      trips,
      { now, minTransferMinutes: 10, kind: "alternative" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toMatch(/Only 5 min/);
  });

  it("keeps genuine trade-offs in the Pareto filter", () => {
    const o = (id: string, arr: number, changes: number, risk: "low" | "medium" | "high") =>
      ({ id, arrivalTime: arr, changes, risk }) as JourneyOption;
    const kept = paretoFilter([o("fast-risky", 1, 2, "high"), o("slow-safe", 2, 1, "low"), o("dominated", 3, 2, "high")]);
    expect(kept.map((x) => x.id)).toEqual(["fast-risky", "slow-safe"]);
  });
});
