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

/** How pressing one deadline is: past it, short on free time before it, and when to start. */
export type Urgency = { overdue: boolean; atRisk: boolean; startBy: number | null };

/** Urgency of `neededMin` of unscheduled work due at `dueAt`, given free time from now on. */
export function deadlineUrgency(opts: {
  dueAt: number;
  neededMin: number;
  freeSlots: Interval[];
  now: number;
}): Urgency {
  if (opts.dueAt < opts.now) return { overdue: true, atRisk: true, startBy: null };
  const { atRisk } = dueRisk({
    dueAt: opts.dueAt,
    remainingEstimateMin: opts.neededMin,
    scheduledMin: 0,
    freeSlots: opts.freeSlots,
  });
  return { overdue: false, atRisk, startBy: atRisk ? null : latestStart(opts) };
}

/** The more pressing of two urgencies: either one overdue or at risk, and the earlier start. */
export function combineUrgency(a: Urgency, b: Urgency): Urgency {
  const starts = [a.startBy, b.startBy].filter((t): t is number => t !== null);
  return {
    overdue: a.overdue || b.overdue,
    atRisk: a.atRisk || b.atRisk,
    startBy: starts.length ? Math.min(...starts) : null,
  };
}

export type ComingUpReason = "overdue" | "at-risk" | "start-today" | "started" | "upcoming";

/** Why a deadline needs attention on a day ending at `dayEnd`, ignoring start dates. */
export function urgencyReason(u: Urgency, dayEnd: number): Exclude<ComingUpReason, "started"> {
  if (u.overdue) return "overdue";
  if (u.atRisk) return "at-risk";
  if (u.startBy !== null && u.startBy < dayEnd) return "start-today";
  return "upcoming";
}

export type ComingUpCandidate = Urgency & {
  task: { start_date: string | null };
  /** The task's deadline, or its earliest open step's if that's sooner; null when undated. */
  dueAt: number | null;
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
    const { start_date } = item.task;
    const urgent = item.overdue || item.atRisk;
    if (start_date && start_date > opts.date && !urgent) continue;
    const started = !!start_date && start_date <= opts.date;
    let reason: ComingUpReason = urgencyReason(item, opts.dayEnd);
    if (reason === "upcoming") {
      if (started) reason = "started";
      else if (item.dueAt === null || item.dueAt >= opts.horizonEnd) continue;
    }
    out.push({ ...item, reason });
  }
  const key = (i: ComingUpCandidate) => i.startBy ?? i.dueAt ?? Infinity;
  return out.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || key(a) - key(b));
}
