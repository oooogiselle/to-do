import { describe, expect, it } from "vitest";
import { addDays, localDate, localWeekday, zonedInstant } from "./time";

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
