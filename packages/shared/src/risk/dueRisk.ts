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

/**
 * The latest instant work can start and still fit `neededMin` of free time before `dueAt`,
 * filling free slots backward from the deadline. Null when the free time can't cover it.
 */
export function latestStart(opts: {
  dueAt: number;
  neededMin: number;
  freeSlots: Interval[];
}): number | null {
  let left = opts.neededMin * 60_000;
  if (left <= 0) return opts.dueAt;
  const before = opts.freeSlots
    .filter((s) => s.start < opts.dueAt)
    .map((s) => ({ start: s.start, end: Math.min(s.end, opts.dueAt) }))
    .sort((a, b) => b.end - a.end);
  for (const s of before) {
    const len = s.end - s.start;
    if (len >= left) return s.end - left;
    left -= len;
  }
  return null;
}

export type ComingUpReason = "overdue" | "at-risk" | "start-today" | "started" | "upcoming";

export type ComingUpCandidate = {
  task: { due_at: string | null; start_date: string | null };
  overdue: boolean;
  atRisk: boolean;
  /** From latestStart; null when undated, overdue, or it doesn't fit. */
  startBy: number | null;
};

const REASON_RANK: Record<ComingUpReason, number> = {
  overdue: 0,
  "at-risk": 1,
  "start-today": 2,
  started: 2,
  upcoming: 3,
};

/**
 * Which open to-dos My day should surface for `date`, most urgent first: overdue, short on
 * time, ones to start by the end of the day (or already started), then the rest due before
 * `horizonEnd` ordered by when they need starting. A future start date hides a task until
 * then unless it's overdue or at risk.
 */
export function rankComingUp<T extends ComingUpCandidate>(
  items: T[],
  opts: { date: string; dayEnd: number; horizonEnd: number },
): (T & { reason: ComingUpReason })[] {
  const out: (T & { reason: ComingUpReason })[] = [];
  for (const item of items) {
    const { start_date, due_at } = item.task;
    const urgent = item.overdue || item.atRisk;
    if (start_date && start_date > opts.date && !urgent) continue;
    const started = !!start_date && start_date <= opts.date;
    const due = due_at ? Date.parse(due_at) : null;
    let reason: ComingUpReason;
    if (item.overdue) reason = "overdue";
    else if (item.atRisk) reason = "at-risk";
    else if (item.startBy !== null && item.startBy < opts.dayEnd) reason = "start-today";
    else if (started) reason = "started";
    else if (due !== null && due < opts.horizonEnd) reason = "upcoming";
    else continue;
    out.push({ ...item, reason });
  }
  const key = (i: ComingUpCandidate) =>
    i.startBy ?? (i.task.due_at ? Date.parse(i.task.due_at) : Infinity);
  return out.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || key(a) - key(b));
}
