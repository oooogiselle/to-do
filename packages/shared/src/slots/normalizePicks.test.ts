import { describe, expect, it } from "vitest";
import { normalizePicks, type RawPick } from "./normalizePicks";

const T0 = Date.parse("2026-11-05T15:00:00Z");
const gap = { start: T0, end: T0 + 90 * 60_000 };
const known = new Map([
  ["a", new Set(["a1"])],
  ["b", new Set<string>()],
  ["c", new Set<string>()],
  ["d", new Set<string>()],
]);
const pick = (o: Partial<RawPick>): RawPick => ({
  task_id: "a",
  step_id: null,
  offset_min: 0,
  duration_min: 30,
  reason: "why",
  ...o,
});

describe("normalizePicks", () => {
  it("drops unknown tasks, duplicates and excluded tasks", () => {
    const out = normalizePicks(
      [pick({ task_id: "zzz" }), pick({}), pick({}), pick({ task_id: "b" })],
      gap,
      known,
      new Set(["b"]),
    );
    expect(out.map((p) => p.task_id)).toEqual(["a"]);
  });

  it("rounds to 15 minutes and clips to the gap", () => {
    const [p] = normalizePicks([pick({ offset_min: 62, duration_min: 100 })], gap, known);
    expect(p?.start).toBe(new Date(T0 + 60 * 60_000).toISOString());
    expect(p?.end).toBe(new Date(gap.end).toISOString());
  });

  it("drops picks that no longer fit after clipping", () => {
    expect(normalizePicks([pick({ offset_min: 88, duration_min: 30 })], gap, known)).toEqual([]);
  });

  it("ignores a step that belongs to another task", () => {
    const [p] = normalizePicks([pick({ step_id: "nope" })], gap, known);
    expect(p?.step_id).toBeNull();
    const [q] = normalizePicks([pick({ step_id: "a1" })], gap, known);
    expect(q?.step_id).toBe("a1");
  });

  it("returns at most 3 picks", () => {
    const raw = ["a", "b", "c", "d"].map((task_id) => pick({ task_id }));
    expect(normalizePicks(raw, gap, known)).toHaveLength(3);
  });
});
