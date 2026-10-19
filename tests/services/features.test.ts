import { describe, expect, it } from "vitest";
import { InMemoryProvider } from "@/lib/providers/in-memory/provider";
import { createSampleDataset } from "@/lib/providers/in-memory/sample-network";
import { simulateLiveStatus } from "@/lib/providers/in-memory/simulator";
import { mapCoachPosition, mapTrainsBetween } from "@/lib/providers/railradar/provider";
import { buildBetweenRows, getTrainsBetween } from "@/lib/services/trains-between";
import { getTrainStatus } from "@/lib/services/train-status";
import { at, FIXTURE_DATE, fixtureDataset, TRAINS } from "../fixtures/network";

describe("trains between stations", () => {
  const p = new InMemoryProvider(fixtureDataset(), { now: () => at("08:30") });

  it("lists trains that stop at both stations in that order", async () => {
    const v = await getTrainsBetween(p, { from: "BBB", to: "EEE", date: FIXTURE_DATE, now: at("08:30") });
    expect(v.trains.map((t) => t.trainNumber)).toEqual(["11008", "11001", "11003", "11002"]);
    const fast = v.trains.find((t) => t.trainNumber === "11002")!;
    expect(fast).toMatchObject({ departure: at("09:30"), arrival: at("11:15"), durationMinutes: 105, haltsBetween: 1 });
    expect(v.trains.find((t) => t.trainNumber === "11008")!.departed).toBe(true);
  });

  it("does not list a train running the other way", async () => {
    const v = await getTrainsBetween(p, { from: "EEE", to: "BBB", date: FIXTURE_DATE, now: at("08:30") });
    expect(v.trains).toHaveLength(0);
  });

  it("works out the origin date for overnight trains and respects run days", () => {
    // 11009 runs Fridays only: EEE 23:00 (day 1) → CCC 02:00 (day 2).
    const night = {
      trainNumber: "11009",
      trainName: "Night",
      runDays: TRAINS.find((t) => t.number === "11009")!.runDays,
      fromCode: "CCC",
      fromName: "C",
      toCode: "AAA",
      toName: "A",
      departure: 1440 + 130, // 02:10 on day 2
      arrival: 1440 + 300,
    };
    // Travelling from CCC on Saturday the 17th means the train left its origin on Friday the 16th.
    const sat = buildBetweenRows([night], "2026-10-17", at("00:00", "2026-10-17"));
    expect(sat.rows).toHaveLength(1);
    expect(sat.rows[0]).toMatchObject({ journeyDate: "2026-10-16", departure: at("02:10", "2026-10-17") });
    // From CCC on Friday the 16th it would have left on Thursday, which it does not.
    expect(buildBetweenRows([night], "2026-10-16", 0)).toMatchObject({ rows: [], notRunning: 1 });
  });

  it("rejects the same station twice", async () => {
    await expect(getTrainsBetween(p, { from: "BBB", to: "BBB", date: FIXTURE_DATE, now: 0 })).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("coach position", () => {
  it("returns the coach order from the engine for sample trains, labelled simulated", async () => {
    const sample = new InMemoryProvider(createSampleDataset());
    const c = await sample.getCoachPosition("90001", "MTJ");
    expect(c?.source).toBe("simulated");
    expect(c?.coaches[0]).toMatchObject({ position: 1, code: "ENG" });
    expect(await sample.getCoachPosition("90001", "ZZZ")).toBeNull();
  });

  it("returns null when the data source has no coach data", async () => {
    const p = new InMemoryProvider(fixtureDataset());
    expect(p.info.capabilities.coachPositions).toBe(false);
    expect(await p.getCoachPosition("11001", "BBB")).toBeNull();
  });

  it("maps RailRadar coaches, sorted by position, or falls back to the formation string", () => {
    const fromList = mapCoachPosition(
      { trainNumber: "12952", stationCode: "BRC", platform: "2", coaches: [{ position: 2, code: "H1" }, { position: 1, code: "ENG" }] },
      "12952",
      "BRC",
    );
    expect(fromList?.coaches.map((c) => c.code)).toEqual(["ENG", "H1"]);
    expect(fromList).toMatchObject({ platform: "2", source: "provider" });
    const fromString = mapCoachPosition({ formation: "ENG-EOG-B1-B2" }, "12952", "BRC");
    expect(fromString?.coaches.map((c) => c.code)).toEqual(["ENG", "EOG", "B1", "B2"]);
    expect(mapCoachPosition({}, "1", "X")).toBeNull();
  });
});

describe("RailRadar trains-between mapping", () => {
  it("maps HH:MM + day into journey offsets and drops broken rows", () => {
    const rows = mapTrainsBetween({
      from: { code: "NDLS", name: "New Delhi" },
      to: { code: "AGC", name: "Agra Cantt" },
      trains: [
        { train: { number: "12002", name: "Shatabdi", runDays: ["mon"] }, from: { departure: "06:00", day: 1 }, to: { arrival: "07:50", day: 1 }, distance: 195 },
        { train: { number: "99999", name: "Bad" }, from: { departure: "xx" }, to: { arrival: "07:00" } },
      ],
    });
    expect(rows).toEqual([
      expect.objectContaining({ trainNumber: "12002", fromCode: "NDLS", toCode: "AGC", departure: 360, arrival: 470, distanceKm: 195, runDays: ["mon"] }),
    ]);
  });
});

describe("speed", () => {
  it("is derived for a running simulated train and zero while standing", () => {
    const t = TRAINS[0]; // 11001, 50 km between stops
    const running = simulateLiveStatus(t, FIXTURE_DATE, { delayMinutes: 0, updateLagMinutes: 1 }, at("09:50"));
    expect(running.runningState).toBe("running");
    expect(running.speedKmh).toBe(Math.round(50 / (85 / 60))); // BBB 09:05 → CCC 10:30
    const standing = simulateLiveStatus(t, FIXTURE_DATE, { delayMinutes: 0, updateLagMinutes: 1 }, at("10:32"));
    expect(standing.speedKmh).toBe(0);
  });

  it("is shown on the status view only while the train is running", async () => {
    const p = new InMemoryProvider(fixtureDataset({ "11001": { delayMinutes: 0, updateLagMinutes: 1 } }), { now: () => at("09:50") });
    const v = await getTrainStatus(p, { trainNumber: "11001", journeyDate: FIXTURE_DATE, now: at("09:50"), staleAfterMinutes: 15 });
    expect(v.speed).toEqual({ kmh: 35, quality: "simulated" });
  });
});
