import { describe, expect, it } from "vitest";
import { eventTitle, formatMinutes } from "../format/eventTitle";
import {
  combineUrgency,
  deadlineUrgency,
  dueRisk,
  latestStart,
  rankComingUp,
  urgencyReason,
} from "./dueRisk";

const h = 3_600_000;

describe("dueRisk", () => {
  const freeSlots = [
    { start: 0, end: 2 * h },
    { start: 5 * h, end: 6 * h },
  ];
  it("counts only free time before the deadline", () => {
    expect(
      dueRisk({ dueAt: 5.5 * h, remainingEstimateMin: 180, scheduledMin: 0, freeSlots }),
    ).toEqual({
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
    expect(eventTitle("CS61", "Lab report", "Write analysis")).toBe(
      "[CS61] Lab report — Write analysis",
    );
    expect(eventTitle(null, "Lab report")).toBe("Lab report");
  });
  it("formats durations", () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(105)]).toEqual([
      "45m",
      "1h",
      "1h 45m",
    ]);
  });
});

describe("latestStart", () => {
  const freeSlots = [
    { start: 0, end: 2 * h },
    { start: 5 * h, end: 6 * h },
  ];
  it("fills free time backward from the deadline", () => {
    expect(latestStart({ dueAt: 10 * h, neededMin: 30, freeSlots })).toBe(5.5 * h);
    expect(latestStart({ dueAt: 10 * h, neededMin: 120, freeSlots })).toBe(1 * h);
  });
  it("handles an exact fit", () => {
    expect(latestStart({ dueAt: 10 * h, neededMin: 180, freeSlots })).toBe(0);
  });
  it("is null when the work doesn't fit", () => {
    expect(latestStart({ dueAt: 10 * h, neededMin: 181, freeSlots })).toBeNull();
  });
  it("ignores free time after the deadline", () => {
    expect(latestStart({ dueAt: 5.5 * h, neededMin: 60, freeSlots })).toBe(1.5 * h);
  });
  it("returns the deadline when nothing is needed", () => {
    expect(latestStart({ dueAt: 4 * h, neededMin: 0, freeSlots })).toBe(4 * h);
  });
});

describe("rankComingUp", () => {
  const day = 24 * h;
  const item = (
    id: string,
    o: Partial<{ due: number; start: string; overdue: boolean; atRisk: boolean; startBy: number }>,
  ) => ({
    id,
    task: { start_date: o.start ?? null },
    dueAt: o.due ?? null,
    overdue: o.overdue ?? false,
    atRisk: o.atRisk ?? false,
    startBy: o.startBy ?? null,
  });
  const opts = { date: "1970-01-01", dayEnd: day, horizonEnd: 14 * day };
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("orders by urgency, then by when to start", () => {
    const r = rankComingUp(
      [
        item("later", { due: 8 * day, startBy: 6 * day }),
        item("soon", { due: 5 * day, startBy: 3 * day }),
        item("today", { due: 2 * day, startBy: 0.5 * day }),
        item("risk", { due: 3 * day, atRisk: true }),
        item("late", { due: -day, overdue: true, atRisk: true }),
      ],
      opts,
    );
    expect(ids(r)).toEqual(["late", "risk", "today", "soon", "later"]);
    expect(r.map((x) => x.reason)).toEqual([
      "overdue",
      "at-risk",
      "start-today",
      "upcoming",
      "upcoming",
    ]);
  });
  it("drops tasks due past the horizon unless started", () => {
    const r = rankComingUp(
      [
        item("far", { due: 20 * day, startBy: 18 * day }),
        item("farStarted", { due: 20 * day, startBy: 18 * day, start: "1970-01-01" }),
      ],
      opts,
    );
    expect(ids(r)).toEqual(["farStarted"]);
    expect(r[0]?.reason).toBe("started");
  });
  it("hides a task until its start date unless it's at risk", () => {
    const r = rankComingUp(
      [
        item("snoozed", { due: 5 * day, startBy: 3 * day, start: "1970-01-03" }),
        item("snoozedRisk", { due: 2 * day, atRisk: true, start: "1970-01-03" }),
      ],
      opts,
    );
    expect(ids(r)).toEqual(["snoozedRisk"]);
    expect(
      ids(
        rankComingUp([item("snoozed", { due: 5 * day, startBy: 3 * day, start: "1970-01-03" })], {
          ...opts,
          date: "1970-01-03",
        }),
      ),
    ).toEqual(["snoozed"]);
  });
  it("includes started tasks without a due date, after dated ones", () => {
    const r = rankComingUp(
      [
        item("undated", { start: "1970-01-01" }),
        item("undatedNotStarted", {}),
        item("dated", { due: 4 * day, start: "1970-01-01", startBy: 2 * day }),
      ],
      opts,
    );
    expect(ids(r)).toEqual(["dated", "undated"]);
  });
});

describe("deadlineUrgency / combineUrgency", () => {
  const freeSlots = [
    { start: 0, end: 2 * h },
    { start: 5 * h, end: 6 * h },
  ];
  it("gives a start time when the work fits", () => {
    expect(deadlineUrgency({ dueAt: 10 * h, neededMin: 30, freeSlots, now: 0 })).toEqual({
      overdue: false,
      atRisk: false,
      startBy: 5.5 * h,
    });
  });
  it("is at risk when it doesn't fit, and overdue past the deadline", () => {
    expect(deadlineUrgency({ dueAt: 1 * h, neededMin: 120, freeSlots, now: 0 })).toEqual({
      overdue: false,
      atRisk: true,
      startBy: null,
    });
    expect(deadlineUrgency({ dueAt: 1 * h, neededMin: 30, freeSlots, now: 2 * h })).toMatchObject({
      overdue: true,
      atRisk: true,
    });
  });
  it("combines to the more pressing of the two", () => {
    const calm = { overdue: false, atRisk: false, startBy: 5 * h };
    expect(combineUrgency(calm, { overdue: false, atRisk: false, startBy: 3 * h }).startBy).toBe(
      3 * h,
    );
    expect(combineUrgency(calm, { overdue: false, atRisk: true, startBy: null })).toEqual({
      overdue: false,
      atRisk: true,
      startBy: 5 * h,
    });
  });
  it("names the reason for a day", () => {
    expect(urgencyReason({ overdue: false, atRisk: false, startBy: 3 * h }, 4 * h)).toBe(
      "start-today",
    );
    expect(urgencyReason({ overdue: false, atRisk: false, startBy: 5 * h }, 4 * h)).toBe(
      "upcoming",
    );
  });
});
