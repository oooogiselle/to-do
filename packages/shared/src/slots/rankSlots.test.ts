import { describe, expect, it } from "vitest";
import { rankSlots } from "./rankSlots";

const h = 3_600_000;
const m = 60_000;
const slot = (startH: number, endH: number) => ({ start: startH * h, end: endH * h });

describe("rankSlots", () => {
  it("prefers the earliest slots that fit the whole estimate", () => {
    const r = rankSlots({
      freeSlots: [slot(1, 1.5), slot(2, 5), slot(6, 8), slot(9, 12)],
      now: 0,
      dueAt: null,
      neededMin: 90,
    });
    expect(r.map((s) => s.kind)).toEqual(["single", "single", "single"]);
    expect(r.map((s) => s.blocks[0]!.start / h)).toEqual([2, 6, 9]);
    expect(r[0]!.blocks[0]!.end - r[0]!.blocks[0]!.start).toBe(90 * m);
  });

  it("ignores time after the due date and before now, rounding to 15 minutes", () => {
    const r = rankSlots({ freeSlots: [slot(0, 3), slot(4, 6)], now: 0.1 * h, dueAt: 5 * h, neededMin: 60 });
    expect(r.map((s) => s.blocks[0]!.start / m)).toEqual([15, 240]);
  });

  it("drops slots under 30 minutes for work over an hour", () => {
    const r = rankSlots({
      freeSlots: [{ start: 0, end: 20 * m }, slot(1, 3)],
      now: 0,
      dueAt: null,
      neededMin: 90,
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.blocks[0]!.start).toBe(h);
  });

  it("splits long work across slots one step per slot when nothing fits", () => {
    const r = rankSlots({
      freeSlots: [slot(1, 2), slot(3, 4.5), slot(6, 7)],
      now: 0,
      dueAt: null,
      neededMin: 180,
      steps: [
        { id: "a", estimate_min: 60 },
        { id: "b", estimate_min: 90 },
        { id: "c", estimate_min: 30 },
      ],
    });
    expect(r[0]!.kind).toBe("split");
    expect(r[0]!.blocks.map((b) => [b.step_id, b.start / h])).toEqual([
      ["a", 1],
      ["b", 3],
      ["c", 6],
    ]);
  });

  it("falls back to the biggest partial slots when nothing fits and no split works", () => {
    const r = rankSlots({ freeSlots: [slot(1, 2), slot(3, 5)], now: 0, dueAt: null, neededMin: 240 });
    expect(r.map((s) => [s.kind, s.coversMin])).toEqual([
      ["partial", 120],
      ["partial", 60],
    ]);
  });

  it("returns nothing when no work is left", () => {
    expect(rankSlots({ freeSlots: [slot(0, 5)], now: 0, dueAt: null, neededMin: 0 })).toEqual([]);
  });
});
