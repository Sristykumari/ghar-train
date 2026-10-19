import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";

// `connection()` needs a Next.js request scope; outside the framework it is a no-op for these tests.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

/**
 * Route handler tests against the development sample provider. They check
 * envelopes, status codes and validation — not specific sample trains.
 */
async function load() {
  vi.resetModules();
  return {
    stationSearch: await import("@/app/api/stations/search/route"),
    trainSearch: await import("@/app/api/trains/search/route"),
    live: await import("@/app/api/trains/[number]/live/route"),
    route: await import("@/app/api/trains/[number]/route"),
    board: await import("@/app/api/stations/[code]/board/route"),
    plan: await import("@/app/api/journeys/alternatives/route"),
    meta: await import("@/app/api/meta/route"),
  };
}

const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(path, "http://localhost"), init);
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

describe("API routes", () => {
  beforeEach(() => {
    vi.stubEnv("RAIL_DATA_PROVIDER", "sample");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("searches stations and trains with a consistent envelope", async () => {
    const r = await load();
    const res = await r.stationSearch.GET(req("/api/stations/search?q=gwalior"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, meta: { provider: "sample", isSample: true } });
    expect(body.data[0].code).toBe("GWL");

    const t = await (await r.trainSearch.GET(req("/api/trains/search?q=demo"))).json();
    expect(t.data.length).toBeGreaterThan(0);
  });

  it("validates input and returns 400", async () => {
    const r = await load();
    expect((await r.trainSearch.GET(req("/api/trains/search?q=x"))).status).toBe(400);
    expect((await r.live.GET(req("/api/trains/abc/live"), ctx({ number: "abc" }))).status).toBe(400);
    expect((await r.live.GET(req("/api/trains/90001/live?date=2026-13-01"), ctx({ number: "90001" }))).status).toBe(400);
    expect((await r.board.GET(req("/api/stations/G1/board"), ctx({ code: "G1" }))).status).toBe(400);
    const bad = await r.plan.POST(req("/api/journeys/alternatives", { method: "POST", body: "not json" }));
    expect(bad.status).toBe(400);
  });

  it("returns 404 for unknown trains and stations", async () => {
    const r = await load();
    const res = await r.route.GET(req("/api/trains/12345"), ctx({ number: "12345" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await r.board.GET(req("/api/stations/ZZZ/board"), ctx({ code: "ZZZ" }))).status).toBe(404);
  });

  it("reports a missing production configuration instead of serving sample data", async () => {
    vi.stubEnv("RAIL_DATA_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "production");
    const r = await load();
    const res = await r.meta.GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "not_configured" } });
  });

  it("reports a missing RailRadar key", async () => {
    vi.stubEnv("RAIL_DATA_PROVIDER", "railradar");
    vi.stubEnv("RAILRADAR_API_KEY", "");
    const r = await load();
    const res = await r.trainSearch.GET(req("/api/trains/search?q=raj"));
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/RAILRADAR_API_KEY/);
  });

  it("rate-limits the journey planner per client", async () => {
    const r = await load();
    const body = JSON.stringify({ trainNumber: "90001", currentStation: "ZZZ", destination: "BPL" });
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await r.plan.POST(req("/api/journeys/alternatives", { method: "POST", body, headers }))).status);
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("rate limiter", () => {
  it("resets after the window", () => {
    let now = 0;
    const check = createRateLimiter(2, 1000, () => now);
    check("a");
    check("a");
    expect(() => check("a")).toThrow(expect.objectContaining({ code: "rate_limited", retryAfterSeconds: 1 }));
    expect(() => check("b")).not.toThrow();
    now = 1000;
    expect(() => check("a")).not.toThrow();
  });
});
