import { describe, expect, it } from "vitest";
import { fitPicksToSlots, type TimedPick } from "./fitPicks";

const H = 3_600_000;
const M = 60_000;
const base = Date.parse("2026-11-07T14:00:00.000Z");
const slots = [
  { start: base, end: base + 2 * H }, // 14:00-16:00
  { start: base + 3 * H, end: base + 4 * H }, // 17:00-18:00
];
const known = new Map([
  ["a", new Set(["a1"])],
  ["b", new Set<string>()],
  ["c", new Set<string>()],
]);
const pick = (task_id: string, start: number, duration_min: number, step_id: string | null = null): TimedPick => ({
  task_id,
  step_id,
  start,
  duration_min,
  reason: " because ",
});

describe("fitPicksToSlots", () => {
  it("keeps picks inside slots and rounds them to 15 minutes", () => {
    const out = fitPicksToSlots([pick("a", base + 8 * M, 50)], slots, known);
    expect(out).toEqual([
      {
        task_id: "a",
        step_id: null,
        start: new Date(base + 15 * M).toISOString(),
        end: new Date(base + 60 * M).toISOString(),
        reason: "because",
      },
    ]);
  });

  it("drops picks outside free time, and clips ones that run past the slot", () => {
    const out = fitPicksToSlots([pick("a", base + 2.5 * H, 30), pick("b", base + 3.5 * H, 90)], slots, known);
    expect(out).toHaveLength(1);
    expect(out[0]!.task_id).toBe("b");
    expect(out[0]!.end).toBe(new Date(base + 4 * H).toISOString());
  });

  it("drops unknown tasks, overlaps and repeats, and ignores steps of other tasks", () => {
    const out = fitPicksToSlots(
      [
        pick("zzz", base, 30),
        pick("a", base, 60, "a1"),
        pick("b", base + 30 * M, 30), // overlaps a
        pick("a", base + 60 * M, 30, "a1"), // same step again
        pick("c", base + 60 * M, 30, "a1"), // a1 isn't c's step
      ],
      slots,
      known,
    );
    expect(out.map((p) => [p.task_id, p.step_id])).toEqual([
      ["a", "a1"],
      ["c", null],
    ]);
  });

  it("caps the count and sorts by time", () => {
    const out = fitPicksToSlots(
      [pick("c", base + 3 * H, 30), pick("b", base + H, 30), pick("a", base, 30)],
      slots,
      known,
      2,
    );
    expect(out.map((p) => p.task_id)).toEqual(["b", "c"]);
  });
});
