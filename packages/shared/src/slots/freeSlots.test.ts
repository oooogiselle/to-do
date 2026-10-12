import { describe, expect, it } from "vitest";
import type { WorkingHours } from "../schemas";
import { findFreeSlots, mergeIntervals, totalMinutes, workingWindows } from "./freeSlots";

const tz = "America/New_York";
const weekdays9to5: WorkingHours = {
  "0": null,
  "1": { start: "09:00", end: "17:00" },
  "2": { start: "09:00", end: "17:00" },
  "3": { start: "09:00", end: "17:00" },
  "4": { start: "09:00", end: "17:00" },
  "5": { start: "09:00", end: "17:00" },
  "6": null,
};
const t = (iso: string) => new Date(iso).getTime();
const fmt = (ivs: { start: number; end: number }[]) =>
  ivs.map((i) => `${new Date(i.start).toISOString().slice(11, 16)}-${new Date(i.end).toISOString().slice(11, 16)}`);

// Monday 2026-10-12, EDT (UTC-4): 9:00 local = 13:00Z, 17:00 local = 21:00Z.
const mon = { from: t("2026-10-12T04:00:00Z"), to: t("2026-10-13T04:00:00Z") };

describe("workingWindows", () => {
  it("skips days off and clips to the range", () => {
    const week = workingWindows(weekdays9to5, tz, t("2026-10-11T04:00:00Z"), t("2026-10-18T04:00:00Z"));
    expect(week).toHaveLength(5);
    const partial = workingWindows(weekdays9to5, tz, t("2026-10-12T15:30:00Z"), mon.to);
    expect(fmt(partial)).toEqual(["15:30-21:00"]);
  });

  it("follows the DST change", () => {
    // Mon 2026-11-02 is EST (UTC-5): 9:00 local = 14:00Z.
    const w = workingWindows(weekdays9to5, tz, t("2026-11-02T05:00:00Z"), t("2026-11-03T05:00:00Z"));
    expect(fmt(w)).toEqual(["14:00-22:00"]);
  });
});

describe("findFreeSlots", () => {
  it("returns the whole working day when nothing is busy", () => {
    expect(fmt(findFreeSlots([], { workingHours: weekdays9to5, timezone: tz, ...mon }))).toEqual([
      "13:00-21:00",
    ]);
  });

  it("subtracts busy events, merges overlaps and drops gaps under 15 minutes", () => {
    const busy = [
      { start: "2026-10-12T14:00:00Z", end: "2026-10-12T15:00:00Z" },
      { start: "2026-10-12T14:30:00Z", end: "2026-10-12T15:30:00Z" }, // overlaps the first
      { start: "2026-10-12T15:40:00Z", end: "2026-10-12T17:00:00Z" }, // leaves a 10m gap
      { start: "2026-10-12T20:00:00Z", end: "2026-10-12T23:00:00Z" }, // runs past end of day
    ];
    expect(fmt(findFreeSlots(busy, { workingHours: weekdays9to5, timezone: tz, ...mon }))).toEqual([
      "13:00-14:00",
      "17:00-20:00",
    ]);
  });

  it("ignores events marked free (e.g. all-day events)", () => {
    const busy = [{ start: "2026-10-12T04:00:00Z", end: "2026-10-13T04:00:00Z", busy: false }];
    expect(findFreeSlots(busy, { workingHours: weekdays9to5, timezone: tz, ...mon })).toHaveLength(1);
  });

  it("treats a busy all-day event as blocking the whole day", () => {
    const busy = [{ start: "2026-10-12T04:00:00Z", end: "2026-10-13T04:00:00Z", busy: true }];
    expect(findFreeSlots(busy, { workingHours: weekdays9to5, timezone: tz, ...mon })).toEqual([]);
  });

  it("keeps a slot of exactly 15 minutes", () => {
    const busy = [
      { start: "2026-10-12T13:00:00Z", end: "2026-10-12T14:00:00Z" },
      { start: "2026-10-12T14:15:00Z", end: "2026-10-12T21:00:00Z" },
    ];
    expect(fmt(findFreeSlots(busy, { workingHours: weekdays9to5, timezone: tz, ...mon }))).toEqual([
      "14:00-14:15",
    ]);
  });
});

describe("helpers", () => {
  it("merges touching intervals and totals minutes", () => {
    const merged = mergeIntervals([
      { start: 60_000 * 30, end: 60_000 * 60 },
      { start: 0, end: 60_000 * 30 },
    ]);
    expect(merged).toEqual([{ start: 0, end: 3_600_000 }]);
    expect(totalMinutes(merged)).toBe(60);
  });
});
