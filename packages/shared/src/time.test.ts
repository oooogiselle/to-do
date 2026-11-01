import { describe, expect, it } from "vitest";
import { addDays, atMinuteOfDay, localDate, localWeekday, minuteOfDay, zonedInstant } from "./time";

describe("zonedInstant", () => {
  it("resolves local midnight in a zone to UTC", () => {
    expect(zonedInstant("2026-10-12", "00:00", "America/New_York").toISOString()).toBe(
      "2026-10-12T04:00:00.000Z",
    );
  });

  it("handles the DST shift", () => {
    // US DST ends 2026-11-01: EDT (-4) before, EST (-5) after.
    expect(zonedInstant("2026-10-31", "09:00", "America/New_York").toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
    expect(zonedInstant("2026-11-02", "09:00", "America/New_York").toISOString()).toBe(
      "2026-11-02T14:00:00.000Z",
    );
  });
});

describe("localDate / localWeekday", () => {
  const instant = new Date("2026-10-13T02:30:00Z"); // Mon evening in LA, Tue in UTC
  it("uses the zone's calendar day", () => {
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-10-12");
    expect(localDate(instant, "UTC")).toBe("2026-10-13");
    expect(localWeekday(instant, "America/Los_Angeles")).toBe(1);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("minuteOfDay / atMinuteOfDay", () => {
  const tz = "America/New_York";
  const at = (iso: string) => Date.parse(iso);

  it("reads the wall clock on the fall-back day (25h)", () => {
    expect(minuteOfDay(at("2026-11-01T19:10:00Z"), "2026-11-01", tz)).toBe(850); // 2:10pm EST
    expect(minuteOfDay(at("2026-11-01T14:00:00Z"), "2026-11-01", tz)).toBe(540); // 9:00 EST
    expect(minuteOfDay(at("2026-11-01T04:30:00Z"), "2026-11-01", tz)).toBe(30); // 0:30 EDT
    expect(minuteOfDay(at("2026-11-02T05:00:00Z"), "2026-11-01", tz)).toBe(1440); // next midnight
  });

  it("reads the wall clock on the spring-forward day (23h)", () => {
    expect(minuteOfDay(at("2026-03-08T07:30:00Z"), "2026-03-08", tz)).toBe(210); // 3:30 EDT
  });

  it("matches elapsed minutes on an ordinary day, across midnights too", () => {
    expect(minuteOfDay(at("2026-10-12T17:45:00Z"), "2026-10-12", tz)).toBe(825);
    expect(minuteOfDay(at("2026-10-12T03:00:00Z"), "2026-10-12", tz)).toBe(-60); // 11pm the day before
  });

  it("inverts minuteOfDay", () => {
    expect(atMinuteOfDay("2026-11-01", 540, tz)).toBe(
      zonedInstant("2026-11-01", "09:00", tz).getTime(),
    );
    expect(atMinuteOfDay("2026-11-01", 1440, tz)).toBe(
      zonedInstant("2026-11-02", "00:00", tz).getTime(),
    );
    expect(atMinuteOfDay("2026-10-12", 825.5, tz)).toBe(at("2026-10-12T17:45:30Z"));
  });
});
