import { describe, expect, it } from "vitest";
import { addDays, istDateOf, istMidnight, isValidDateString, journeyDay, parseHHMM, weekdayOf } from "@/lib/domain/time";
import { parseSearchQuery, parseStationCode, parseTrainNumber, validateSchedule } from "@/lib/domain/validation";
import { train } from "../fixtures/network";

describe("time helpers (IST)", () => {
  it("computes IST midnight and dates independent of the machine time zone", () => {
    expect(new Date(istMidnight("2026-10-16")).toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(istDateOf(Date.parse("2026-10-15T18:29:00Z"))).toBe("2026-10-15");
    expect(istDateOf(Date.parse("2026-10-15T18:30:00Z"))).toBe("2026-10-16");
  });

  it("handles weekdays and day arithmetic across month ends", () => {
    expect(weekdayOf("2026-10-16")).toBe("fri");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("parses HH:MM strictly", () => {
    expect(parseHHMM("09:05")).toBe(545);
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("9.05")).toBeNull();
    expect(parseHHMM("")).toBeNull();
    expect(journeyDay(1440 + 30)).toBe(2);
  });

  it("validates calendar dates", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("16-10-2026")).toBe(false);
  });
});

describe("input validation", () => {
  it("accepts well-formed train numbers, station codes and search text", () => {
    expect(parseTrainNumber(" 12951 ")).toBe("12951");
    expect(parseStationCode("ndls")).toBe("NDLS");
    expect(parseSearchQuery("  raj ")).toBe("raj");
  });

  it("rejects malformed input with invalid_request", () => {
    for (const fn of [() => parseTrainNumber("12a51"), () => parseStationCode("ND-LS"), () => parseSearchQuery("a")]) {
      expect(fn).toThrow(expect.objectContaining({ code: "invalid_request" }));
    }
  });
});

describe("validateSchedule — invalid or incomplete timetable data", () => {
  it("passes a clean timetable through unchanged", () => {
    const t = train("10001", "Clean", [
      ["AAA", null, "08:00"],
      ["BBB", "09:00", "09:05"],
      ["CCC", "10:00", null],
    ]);
    const { schedule, issues } = validateSchedule(t);
    expect(issues).toEqual([]);
    expect(schedule.stops.every((s) => s.isHalt)).toBe(true);
  });

  it("keeps but disables stops whose times run backwards or are missing", () => {
    const t = train("10002", "Messy", [
      ["AAA", null, "08:00"],
      ["BBB", "07:30", "07:35"], // earlier than the previous stop
      ["CCC", null, null], // no times at all
      ["DDD", "10:00", "09:50"], // departs before arriving
      ["EEE", "11:00", null],
    ]);
    const { schedule, issues } = validateSchedule(t);
    expect(issues.map((i) => i.stationCode)).toEqual(["BBB", "CCC", "DDD"]);
    expect(schedule.stops.filter((s) => s.isHalt).map((s) => s.stationCode)).toEqual(["AAA", "EEE"]);
  });

  it("throws when fewer than two usable halts remain", () => {
    const t = train("10003", "Broken", [
      ["AAA", null, "08:00"],
      ["BBB", "07:00", null],
    ]);
    expect(() => validateSchedule(t)).toThrow(expect.objectContaining({ code: "bad_upstream_response" }));
  });

  it("throws on an empty timetable", () => {
    expect(() => validateSchedule({ ...train("10004", "Empty", [["AAA", null, "08:00"]]), stops: [] })).toThrow(/no stops/);
  });
});
