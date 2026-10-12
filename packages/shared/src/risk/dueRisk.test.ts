import { describe, expect, it } from "vitest";
import { eventTitle, formatMinutes } from "../format/eventTitle";
import { dueRisk } from "./dueRisk";

const h = 3_600_000;

describe("dueRisk", () => {
  const freeSlots = [
    { start: 0, end: 2 * h },
    { start: 5 * h, end: 6 * h },
  ];
  it("counts only free time before the deadline", () => {
    expect(dueRisk({ dueAt: 5.5 * h, remainingEstimateMin: 180, scheduledMin: 0, freeSlots })).toEqual({
      neededMin: 180,
      freeMin: 150,
      atRisk: true,
    });
  });
  it("is not at risk once enough is scheduled", () => {
    const r = dueRisk({ dueAt: 5.5 * h, remainingEstimateMin: 180, scheduledMin: 60, freeSlots });
    expect(r).toMatchObject({ neededMin: 120, atRisk: false });
  });
});

describe("eventTitle / formatMinutes", () => {
  it("formats titles", () => {
    expect(eventTitle("CS61", "Lab report", "Write analysis")).toBe("[CS61] Lab report — Write analysis");
    expect(eventTitle(null, "Lab report")).toBe("Lab report");
  });
  it("formats durations", () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(105)]).toEqual(["45m", "1h", "1h 45m"]);
  });
});
