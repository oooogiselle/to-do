import type { Interval } from "../slots/freeSlots";
import { totalMinutes } from "../slots/freeSlots";

export type DueRisk = { neededMin: number; freeMin: number; atRisk: boolean };

/**
 * A task is at risk when the free time left before its deadline is less than the work not yet
 * scheduled. `freeSlots` should start at "now"; slots after the deadline are ignored.
 */
export function dueRisk(opts: {
  dueAt: number;
  remainingEstimateMin: number;
  scheduledMin: number;
  freeSlots: Interval[];
}): DueRisk {
  const neededMin = Math.max(0, opts.remainingEstimateMin - opts.scheduledMin);
  const before = opts.freeSlots
    .filter((s) => s.start < opts.dueAt)
    .map((s) => ({ start: s.start, end: Math.min(s.end, opts.dueAt) }));
  const freeMin = totalMinutes(before);
  return { neededMin, freeMin, atRisk: neededMin > 0 && freeMin < neededMin };
}
