import { describe, expect, it, vi } from "vitest";
import { RailDataError } from "@/lib/domain/errors";
import { withCache } from "@/lib/providers/cached";
import { InMemoryProvider } from "@/lib/providers/in-memory/provider";
import { createSampleDataset } from "@/lib/providers/in-memory/sample-network";
import { mapLiveStatus, mapSchedule, RailRadarProvider } from "@/lib/providers/railradar/provider";
import { at, fixtureDataset } from "../fixtures/network";

describe("in-memory provider — search", () => {
  const p = new InMemoryProvider(fixtureDataset(), { now: () => at("08:30") });

  it("finds trains by number prefix and by name", async () => {
    expect((await p.searchTrains("1100", 20)).length).toBeGreaterThan(5);
    expect((await p.searchTrains("branch", 10)).map((t) => t.number)).toEqual(["11005", "11006"]);
    expect(await p.searchTrains("nomatch", 10)).toEqual([]);
  });

  it("finds stations by code first, then by name", async () => {
    expect((await p.searchStations("bbb", 5))[0].code).toBe("BBB");
    expect((await p.searchStations("echo", 5)).map((s) => s.code)).toEqual(["EEE"]);
  });

  it("returns nearby stations ordered by distance", async () => {
    const near = await p.getNearbyStations(20.01, 77.01, 100, 3);
    expect(near[0].code).toBe("AAA");
    expect(near.every((s, i) => i === 0 || s.distanceKm >= near[i - 1].distanceKm)).toBe(true);
  });

  it("returns no live status when the run has no live feed", async () => {
    expect(await p.getLiveStatus("11001", "2026-10-16")).toBeNull();
  });
});

describe("demo network", () => {
  it("only contains clearly labelled demo trains", () => {
    const ds = createSampleDataset();
    expect(ds.trains.length).toBeGreaterThan(50);
    for (const t of ds.trains) {
      expect(t.number).toMatch(/^9\d{4}$/);
      expect(t.name.startsWith("Demo")).toBe(true);
    }
    expect(new Set(ds.trains.map((t) => t.number)).size).toBe(ds.trains.length);
    expect(new InMemoryProvider(ds).info.isSample).toBe(true);
  });
});

// ── RailRadar adapter ──────────────────────────────────────────────────────

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }),
  );
}

describe("RailRadar adapter — API failures and rate limits", () => {
  it("refuses to start without an API key", () => {
    expect(() => new RailRadarProvider({ apiKey: "" })).toThrow(expect.objectContaining({ code: "not_configured" }));
  });

  it("sends the key as a Bearer header and never in the URL", async () => {
    const f = fakeFetch(200, { success: true, data: [] });
    await new RailRadarProvider({ apiKey: "secret-key", fetchImpl: f }).searchStations("ndls", 10);
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).not.toContain("secret-key");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
  });

  it("maps 429 to rate_limited with Retry-After", async () => {
    const p = new RailRadarProvider({ apiKey: "k", fetchImpl: fakeFetch(429, { success: false }, { "retry-after": "30" }) });
    const err = await p.getLiveStatus("12951", "2026-10-16").catch((e) => e);
    expect(err).toBeInstanceOf(RailDataError);
    expect(err).toMatchObject({ code: "rate_limited", retryAfterSeconds: 30 });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [503, "upstream_unavailable"],
    [500, "upstream_unavailable"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const p = new RailRadarProvider({ apiKey: "k", fetchImpl: fakeFetch(status, {}) });
    await expect(p.getTrainSchedule("12951")).rejects.toMatchObject({ code });
  });

  it("treats 404 and NOT_FOUND as 'no data' rather than an error", async () => {
    expect(await new RailRadarProvider({ apiKey: "k", fetchImpl: fakeFetch(404, {}) }).getTrainSchedule("12951")).toBeNull();
    const nf = fakeFetch(200, { success: false, error: { code: "NOT_FOUND", message: "x" } });
    expect(await new RailRadarProvider({ apiKey: "k", fetchImpl: nf }).getLiveStatus("12951", "2026-10-16")).toBeNull();
  });

  it("reports network failures and invalid JSON distinctly", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new RailRadarProvider({ apiKey: "k", fetchImpl: down }).searchTrains("ra", 5)).rejects.toMatchObject({ code: "upstream_unavailable" });
    await expect(new RailRadarProvider({ apiKey: "k", fetchImpl: fakeFetch(200, "<html>") }).searchTrains("ra", 5)).rejects.toMatchObject({
      code: "bad_upstream_response",
    });
  });
});

describe("RailRadar adapter — mapping", () => {
  it("maps HH:MM + day timetable fields to journey offsets", () => {
    const s = mapSchedule(
      {
        train: { number: "12951", name: "Test Rajdhani", source: { code: "MMCT" }, destination: { code: "NDLS" }, runDays: ["mon", "tue"] },
        route: [
          { sequence: 1, station: { code: "MMCT", name: "Mumbai Central" }, arrival: null, departure: "17:00", departureDay: 1, isHalt: true, platform: "3" },
          { sequence: 2, station: { code: "RTM", name: "Ratlam" }, arrival: "23:50", departure: "23:55", arrivalDay: 1, departureDay: 1, isHalt: true },
          { sequence: 3, station: { code: "KOTA", name: "Kota" }, arrival: "02:40", departure: "02:50", arrivalDay: 2, departureDay: 2, isHalt: true },
          { sequence: 4, station: { code: "NDLS", name: "New Delhi" }, arrival: "08:32", departure: null, arrivalDay: 2, isHalt: true },
        ],
      },
      "12951",
    );
    expect(s.runDays).toEqual(["mon", "tue"]);
    expect(s.stops.map((x) => [x.stationCode, x.arrival, x.departure])).toEqual([
      ["MMCT", null, 1020],
      ["RTM", 1430, 1435],
      ["KOTA", 1440 + 160, 1440 + 170],
      ["NDLS", 1440 + 512, null],
    ]);
    expect(s.stops[0].scheduledPlatform).toBe("3");
  });

  it("infers day rollover when day fields are missing", () => {
    const s = mapSchedule(
      { train: {}, route: [{ station: { code: "A" }, departure: "22:00" }, { station: { code: "B" }, arrival: "01:00", departure: "01:05" }, { station: { code: "C" }, arrival: "03:00" }] },
      "10000",
    );
    expect(s.stops.map((x) => x.arrival ?? x.departure)).toEqual([1320, 1440 + 60, 1440 + 180]);
  });

  it("maps live status without inventing a platform or an actual position", () => {
    const live = mapLiveStatus(
      {
        trainNumber: "12951",
        startDate: "2026-10-16",
        lastUpdatedAt: "2026-10-16T20:00:00+05:30",
        status: "Running",
        delayMinutes: 12,
        currentLocation: { stationCode: "RTM", isActualPosition: true, segmentProgress: 0.5 },
        route: [
          { stationCode: "MMCT", actualDeparture: "2026-10-16T17:05:00+05:30", status: "departed", lat: 18.97, lng: 72.82 },
          { stationCode: "RTM", actualDeparture: "2026-10-16T23:58:00+05:30", status: "departed", lat: 23.33, lng: 75.04 },
          { stationCode: "KOTA", scheduledArrival: "2026-10-17T02:40:00+05:30", delayArrival: 12, lat: 25.18, lng: 75.83 },
        ],
      },
      "12951",
      "2026-10-16",
    );
    expect(live.source).toBe("live");
    expect(live.delayMinutes).toBe(12);
    expect(live.stops[2].expectedArrival).toBe(Date.parse("2026-10-17T02:52:00+05:30"));
    expect(live.stops.every((s) => s.livePlatform == null)).toBe(true);
    // Interpolated between stations, so not an actual fix even though the feed says isActualPosition.
    expect(live.position?.isActual).toBe(false);
  });

  it("treats a missing update timestamp as unknown freshness", () => {
    expect(mapLiveStatus({ route: [] }, "1", "2026-10-16").lastUpdatedAt).toBe(0);
  });
});

describe("withCache", () => {
  it("caches successes, retries failures, and expires entries", async () => {
    let now = 0;
    const base = new InMemoryProvider(fixtureDataset());
    const spy = vi.spyOn(base, "getTrainSchedule");
    const cached = withCache(base, { staticMs: 1000 }, () => now);
    await cached.getTrainSchedule("11001");
    await cached.getTrainSchedule("11001");
    expect(spy).toHaveBeenCalledTimes(1);
    now = 1001;
    await cached.getTrainSchedule("11001");
    expect(spy).toHaveBeenCalledTimes(2);

    const failing = vi.spyOn(base, "getStationSchedule").mockRejectedValueOnce(new RailDataError("rate_limited", "slow down"));
    await expect(cached.getStationSchedule("BBB")).rejects.toMatchObject({ code: "rate_limited" });
    await Promise.resolve();
    await expect(cached.getStationSchedule("BBB")).resolves.not.toHaveLength(0);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe("demo network file", () => {
  it("builds trains in both directions with consistent times", async () => {
    const { buildJsonNetwork } = await import("@/lib/providers/in-memory/json-network");
    const ds = buildJsonNetwork({
      stations: [
        { code: "AAA", name: "A", lat: 20, lng: 77 },
        { code: "BBB", name: "B", lat: 20.5, lng: 77 },
        { code: "CCC", name: "C", lat: 21, lng: 77 },
      ],
      trains: [{ number: "95001", name: "Demo T", route: ["AAA", "~BBB", "CCC"], departures: ["06:00"], returnDepartures: ["12:00"], speedKmph: 60 }],
    });
    expect(ds.trains.map((t) => [t.number, t.sourceCode, t.destinationCode])).toEqual([
      ["95001", "AAA", "CCC"],
      ["95002", "CCC", "AAA"],
    ]);
    expect(ds.trains[0].stops[1]).toMatchObject({ stationCode: "BBB", isHalt: false });
    expect(ds.trains[0].stops[0].departure).toBe(360);
  });

  it("explains mistakes in the file", async () => {
    const { buildJsonNetwork } = await import("@/lib/providers/in-memory/json-network");
    const st = [{ code: "AAA", name: "A", lat: 20, lng: 77 }];
    expect(() => buildJsonNetwork({ stations: st, trains: [{ number: "95001", name: "x", route: ["AAA", "ZZZ"], departures: [], speedKmph: 60 }] })).toThrow(/unknown station ZZZ/);
    expect(() => buildJsonNetwork({ stations: st, trains: [{ number: "95001", name: "x", route: ["AAA", "AAA"], departures: ["6pm"], speedKmph: 60 }] })).toThrow(/bad departure time/);
  });
});
