import { describe, expect, it } from "vitest";
import type { Task } from "../schemas";
import {
  isDoneOn,
  isRecurring,
  occursOn,
  repeatLabel,
  streakOn,
  toggleDoneDate,
  weekdayOf,
} from "./recurrence";

const task = (over: Partial<Task> = {}) =>
  ({ repeat: "none", repeat_days: [], done_dates: [], status: "open", ...over }) as Task;

describe("weekdayOf", () => {
  it("reads the weekday of a plain date", () => {
    expect(weekdayOf("2026-11-04")).toBe(3); // Wednesday
    expect(weekdayOf("2026-11-01")).toBe(0); // the DST-change Sunday
  });
});

describe("isRecurring / occursOn", () => {
  it("daily occurs every day, weekdays skips the weekend", () => {
    expect(occursOn(task({ repeat: "daily" }), "2026-11-07")).toBe(true);
    expect(occursOn(task({ repeat: "weekdays" }), "2026-11-07")).toBe(false); // Sat
    expect(occursOn(task({ repeat: "weekdays" }), "2026-11-09")).toBe(true); // Mon
  });

  it("custom follows its days, and an empty custom never occurs", () => {
    const t = task({ repeat: "custom", repeat_days: [1, 3, 5] });
    expect(occursOn(t, "2026-11-04")).toBe(true); // Wed
    expect(occursOn(t, "2026-11-05")).toBe(false); // Thu
    const empty = task({ repeat: "custom", repeat_days: [] });
    expect(isRecurring(empty)).toBe(false);
    expect(occursOn(empty, "2026-11-04")).toBe(false);
  });

  it("a one-off task never occurs", () => {
    expect(isRecurring(task())).toBe(false);
    expect(occursOn(task(), "2026-11-04")).toBe(false);
  });
});

describe("repeatLabel", () => {
  it("names the schedule", () => {
    expect(repeatLabel(task({ repeat: "daily" }))).toBe("Daily");
    expect(repeatLabel(task({ repeat: "custom", repeat_days: [5, 1, 3] }))).toBe("Mon, Wed, Fri");
    expect(repeatLabel(task({ repeat: "custom", repeat_days: [0, 1, 2, 3, 4, 5, 6] }))).toBe(
      "Daily",
    );
  });
});

describe("isDoneOn / toggleDoneDate", () => {
  it("is per day for repeating tasks and by status otherwise", () => {
    const r = task({ repeat: "daily", done_dates: ["2026-11-03"] });
    expect(isDoneOn(r, "2026-11-03")).toBe(true);
    expect(isDoneOn(r, "2026-11-04")).toBe(false);
    expect(isDoneOn(task({ status: "done" }), "2026-11-04")).toBe(true);
  });

  it("toggles without duplicates and keeps dates sorted", () => {
    expect(toggleDoneDate(["2026-11-03"], "2026-11-01", true)).toEqual(["2026-11-01", "2026-11-03"]);
    expect(toggleDoneDate(["2026-11-03"], "2026-11-03", true)).toEqual(["2026-11-03"]);
    expect(toggleDoneDate(["2026-11-03"], "2026-11-03", false)).toEqual([]);
  });
});

describe("streakOn", () => {
  const daily = (done_dates: string[]) => task({ repeat: "daily", done_dates });

  it("counts consecutive done days, including today once checked", () => {
    expect(streakOn(daily(["2026-11-02", "2026-11-03", "2026-11-04"]), "2026-11-04")).toBe(3);
  });

  it("doesn't count today until it's checked", () => {
    expect(streakOn(daily(["2026-11-02", "2026-11-03"]), "2026-11-04")).toBe(2);
  });

  it("breaks on a missed day", () => {
    expect(streakOn(daily(["2026-11-01", "2026-11-03", "2026-11-04"]), "2026-11-04")).toBe(2);
  });

  it("skips days the task doesn't occur on", () => {
    // Weekdays: Fri Nov 6 and Mon Nov 9 are consecutive occurrences across the weekend.
    const t = task({ repeat: "weekdays", done_dates: ["2026-11-06", "2026-11-09"] });
    expect(streakOn(t, "2026-11-09")).toBe(2);
  });

  it("is zero for one-off tasks", () => {
    expect(streakOn(task({ done_dates: ["2026-11-04"] }), "2026-11-04")).toBe(0);
  });

  it("walks across the DST change without skipping or repeating a day", () => {
    const dates = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
    expect(streakOn(daily(dates), "2026-11-02")).toBe(4);
  });
});
