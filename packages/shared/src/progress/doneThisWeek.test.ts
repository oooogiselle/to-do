import { describe, expect, it } from "vitest";
import { weekStart } from "../time";
import { completedAt, isDoneThisWeek, weekProgress, weekStartInstant } from "./doneThisWeek";

const tz = "America/Los_Angeles";
// Wednesday 2026-11-18, 10:00 in Los Angeles.
const now = Date.parse("2026-11-18T18:00:00Z");

type Fields = Parameters<typeof completedAt>[0];
const task = (over: Partial<Fields> = {}): Fields => ({
  status: "done",
  completed_at: "2026-11-17T20:00:00Z",
  updated_at: "2026-11-17T20:00:00Z",
  repeat: "none",
  repeat_days: [],
  ...over,
});

describe("weekStart", () => {
  it("is the Monday of the week, Sunday belonging to the week before", () => {
    expect(weekStart("2026-11-18", tz)).toBe("2026-11-16");
    expect(weekStart("2026-11-16", tz)).toBe("2026-11-16");
    expect(weekStart("2026-11-22", tz)).toBe("2026-11-16");
  });
});

describe("weekStartInstant", () => {
  it("is Monday midnight in the user's time zone", () => {
    expect(new Date(weekStartInstant(now, tz)).toISOString()).toBe("2026-11-16T08:00:00.000Z");
  });
});

describe("isDoneThisWeek", () => {
  it("counts a to-do checked off since Monday", () => {
    expect(isDoneThisWeek(task(), now, tz)).toBe(true);
  });
  it("leaves out last week's, by local time", () => {
    // Sunday 23:30 in Los Angeles is already Monday in UTC.
    expect(isDoneThisWeek(task({ completed_at: "2026-11-16T07:30:00Z" }), now, tz)).toBe(false);
    expect(isDoneThisWeek(task({ completed_at: "2026-11-16T08:00:00Z" }), now, tz)).toBe(true);
  });
  it("uses the last edit until the server fills completed_at", () => {
    expect(isDoneThisWeek(task({ completed_at: null, updated_at: "2026-11-18T17:00:00Z" }), now, tz)).toBe(
      true,
    );
  });
  it("never counts open or repeating to-dos", () => {
    expect(isDoneThisWeek(task({ status: "open" }), now, tz)).toBe(false);
    expect(isDoneThisWeek(task({ repeat: "daily" }), now, tz)).toBe(false);
  });
});

describe("weekProgress", () => {
  it("counts this week's done and all open, skipping repeating ones", () => {
    const tasks = [
      task(),
      task({ completed_at: "2026-11-01T12:00:00Z" }),
      task({ status: "open", completed_at: null }),
      task({ status: "open", completed_at: null }),
      task({ status: "open", completed_at: null, repeat: "daily" }),
    ];
    expect(weekProgress(tasks, now, tz)).toEqual({ done: 1, open: 2, total: 3 });
  });
});
