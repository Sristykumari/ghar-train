/**
 * OPT-IN check against the real RailRadar API. Skipped unless
 * RAILRADAR_VERIFY=1 and RAILRADAR_API_KEY are set, because each run uses
 * request quota (the free sandbox allows very few calls per month).
 *
 *   RAILRADAR_VERIFY=1 RAILRADAR_API_KEY=... npm run verify:railradar
 *
 * It confirms that our field mapping produces sensible values from real
 * responses. Uses 4 requests.
 */
import { describe, expect, it } from "vitest";
import { istDateOf } from "@/lib/domain/time";
import { validateSchedule } from "@/lib/domain/validation";
import { RailRadarProvider } from "@/lib/providers/railradar/provider";

const enabled = process.env.RAILRADAR_VERIFY === "1" && !!process.env.RAILRADAR_API_KEY;
const TRAIN = process.env.RAILRADAR_VERIFY_TRAIN ?? "12951";
const STATION = process.env.RAILRADAR_VERIFY_STATION ?? "NDLS";

describe.skipIf(!enabled)("RailRadar live verification", () => {
  const p = new RailRadarProvider({ apiKey: process.env.RAILRADAR_API_KEY ?? "x", baseUrl: process.env.RAILRADAR_BASE_URL });

  it("maps a timetable into a valid schedule", async () => {
    const s = await p.getTrainSchedule(TRAIN);
    expect(s).not.toBeNull();
    const { schedule, issues } = validateSchedule(s!);
    console.log(`schedule ${TRAIN}: ${schedule.stops.length} stops, ${issues.length} issues`, issues.slice(0, 3));
    expect(schedule.stops.filter((x) => x.isHalt).length).toBeGreaterThan(1);
  });

  it("maps live running status with a real update timestamp", async () => {
    const live = await p.getLiveStatus(TRAIN, istDateOf(Date.now()));
    console.log("live:", live && { state: live.runningState, at: live.currentStationCode, delay: live.delayMinutes, updated: new Date(live.lastUpdatedAt).toISOString(), stops: live.stops.length });
    if (live) {
      expect(live.lastUpdatedAt).toBeGreaterThan(0);
      expect(live.stops.length).toBeGreaterThan(1);
    }
  });

  it("maps the station timetable and live board", async () => {
    const entries = await p.getStationSchedule(STATION);
    const board = await p.getStationLiveBoard(STATION, 2);
    console.log(`station ${STATION}: ${entries.length} scheduled, live board ${board?.entries.length ?? "n/a"} rows`, board?.entries.slice(0, 2));
    expect(entries.length).toBeGreaterThan(0);
  });
});
