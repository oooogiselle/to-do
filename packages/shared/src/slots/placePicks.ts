import { addDays, zonedInstant } from "../time";
import type { Interval } from "./freeSlots";

const MIN = 60_000;
const QUARTER = 15 * MIN;
/** A trimmed block shorter than this isn't worth offering. */
const MIN_TRIMMED = 30 * MIN;
/** Longer work prefers the user's focus window when the model didn't say when. */
const FOCUS_FROM_MIN = 45;

export type DayWindow = "morning" | "afternoon" | "evening";
const WINDOWS: Record<DayWindow, [string, string]> = {
  morning: ["06:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  evening: ["17:00", "23:00"],
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What the model asks for; the exact time is worked out here. */
export type PickRequest = {
  task_id: string;
  step_id: string | null;
  /** The local date asked for, or null for the earliest day that works. */
  date: string | null;
  /** "morning" | "afternoon" | "evening" | "HH:MM" | anything else for "whenever". */
  when: string;
  duration_min: number;
  reason: string;
};

/**
 * One day the planner can use: its free time (already kept clear of events and existing blocks
 * by the break), and the minutes of blocks already booked on it, for the daily cap.
 */
export type PlanDay = { date: string; free: Interval[]; bookedMin: number };

export type PlacePrefs = {
  focus?: DayWindow;
  max_session_min: number;
  break_min: number;
  daily_cap_min?: number;
};

export type FittedPick = { task_id: string; step_id: string | null; start: string; end: string; reason: string };
export type Unplaced = { task_id: string; step_id: string | null; reason: "no_time_before_due" | "no_time" };

const ceilQ = (t: number) => Math.ceil(t / QUARTER) * QUARTER;
const floorQ = (t: number) => Math.floor(t / QUARTER) * QUARTER;

/** `free` minus `taken`, both sorted lists of intervals. */
function subtract(free: Interval[], taken: Interval[]): Interval[] {
  let out = free;
  for (const t of taken) {
    out = out.flatMap((f) => {
      if (t.end <= f.start || t.start >= f.end) return [f];
      return [
        ...(t.start > f.start ? [{ start: f.start, end: t.start }] : []),
        ...(t.end < f.end ? [{ start: t.end, end: f.end }] : []),
      ];
    });
  }
  return out;
}

/** The earliest `len`-long block inside `gaps` and within [from, to). */
function earliest(gaps: Interval[], len: number, from = -Infinity, to = Infinity): number | null {
  for (const g of gaps) {
    const s = ceilQ(Math.max(g.start, from));
    if (s + len <= Math.min(g.end, to)) return s;
  }
  return null;
}

/** The `len`-long block inside `gaps` that starts closest to `target`. */
function nearest(gaps: Interval[], len: number, target: number): number | null {
  let best: number | null = null;
  for (const g of gaps) {
    const lo = ceilQ(g.start);
    const hi = floorQ(g.end - len);
    if (hi < lo) continue;
    const s = Math.min(hi, Math.max(lo, ceilQ(target)));
    if (best === null || Math.abs(s - target) < Math.abs(best - target)) best = s;
  }
  return best;
}

/**
 * Places the model's picks into real free time. The model decides what, for how long and roughly
 * when; this decides the exact block:
 * - a block is a quarter-hour multiple, at most the longest session, and never overlaps another
 *   (placed blocks keep the break between them);
 * - work on a task with an upcoming due date ends before it (overdue work can go anywhere);
 * - a day never goes over the daily cap of planned work;
 * - "HH:MM" starts as close to that time as fits, a window ("morning"...) is tried first, and
 *   longer work without a time goes in the focus window when there's one;
 * - with no day given, the earliest day that works; the same task comes back on other days,
 *   which spreads big work out (a day that was asked for can hold several sessions);
 * - when the whole length fits nowhere, the longest gap of 30+ minutes takes a shorter block.
 * Picks are handled in the model's order (most pressing first) and the result is sorted by start.
 */
export function placePicks(opts: {
  picks: PickRequest[];
  days: PlanDay[];
  /** Offered tasks and their open step ids; picks for anything else are dropped. */
  known: Map<string, Set<string>>;
  /** Due dates (epoch ms) by task. */
  dueOf: Map<string, number>;
  prefs: PlacePrefs;
  now: number;
  timezone: string;
  max?: number;
}): { placed: FittedPick[]; unplaced: Unplaced[] } {
  const { prefs, now, timezone: tz, max = 8 } = opts;
  const pad = prefs.break_min * MIN;
  const taken = new Map<string, Interval[]>(opts.days.map((d) => [d.date, []]));
  const placedMin = new Map<string, number>();
  const seen = new Set<string>();
  const placed: (FittedPick & { at: number })[] = [];
  const unplaced: Unplaced[] = [];

  for (const p of opts.picks) {
    if (placed.length === max) break;
    const steps = opts.known.get(p.task_id);
    if (!steps) continue;
    const step_id = p.step_id && steps.has(p.step_id) ? p.step_id : null;
    const due = opts.dueOf.get(p.task_id);
    const deadline = due !== undefined && due > now ? due : Infinity;
    // Round up, so a 50-minute task gets an hour rather than losing 5 minutes.
    const wantMin = Math.min(prefs.max_session_min, Math.max(15, Math.ceil(p.duration_min / 15) * 15));
    const when = p.when.trim().toLowerCase();
    const days = p.date ? opts.days.filter((d) => d.date === p.date) : opts.days;

    let done = false;
    for (const day of days) {
      const key = `${p.task_id}:${step_id ?? ""}:${day.date}`;
      // With no day given, a task already placed on a day moves on to the next, which spreads
      // repeated picks out. A day asked for can take several sessions.
      if (!p.date && seen.has(key)) continue;
      const capLeft =
        prefs.daily_cap_min === undefined
          ? Infinity
          : prefs.daily_cap_min - day.bookedMin - (placedMin.get(day.date) ?? 0);
      const len = Math.min(wantMin, Math.floor(capLeft / 15) * 15) * MIN;
      if (len < QUARTER) continue;

      const gaps = subtract(day.free, taken.get(day.date) ?? [])
        .map((g) => ({ start: Math.max(g.start, now), end: Math.min(g.end, deadline) }))
        .filter((g) => g.end - g.start >= QUARTER);
      if (!gaps.length) continue;

      const window = (w: DayWindow) =>
        [zonedInstant(day.date, WINDOWS[w][0], tz).getTime(), zonedInstant(day.date, WINDOWS[w][1], tz).getTime()] as const;
      const preferred: DayWindow | undefined =
        Object.hasOwn(WINDOWS, when) ? (when as DayWindow) : !HHMM.test(when) && wantMin > FOCUS_FROM_MIN ? prefs.focus : undefined;

      let start: number | null = null;
      let blockLen = len;
      if (HHMM.test(when)) {
        start = nearest(gaps, len, zonedInstant(day.date, when, tz).getTime());
      } else {
        if (preferred) start = earliest(gaps, len, ...window(preferred));
        start ??= earliest(gaps, len);
      }
      if (start === null) {
        // Nothing fits the whole length: offer a shorter block in the longest gap.
        const best = gaps
          .map((g) => ({ start: ceilQ(g.start), len: floorQ(g.end - ceilQ(g.start)) }))
          .sort((a, b) => b.len - a.len)[0];
        if (best && best.len >= Math.min(MIN_TRIMMED, len)) {
          start = best.start;
          blockLen = Math.min(best.len, len);
        }
      }
      if (start === null) continue;

      const end = start + blockLen;
      taken.get(day.date)!.push({ start: start - pad, end: end + pad });
      taken.get(day.date)!.sort((a, b) => a.start - b.start);
      placedMin.set(day.date, (placedMin.get(day.date) ?? 0) + blockLen / MIN);
      seen.add(key);
      placed.push({
        task_id: p.task_id,
        step_id,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        reason: p.reason.trim().slice(0, 200),
        at: start,
      });
      done = true;
      break;
    }
    if (!done) {
      // Blame the due date only when it cut into the days tried.
      const last = days[days.length - 1];
      const daysEnd = last ? zonedInstant(addDays(last.date, 1), "00:00", tz).getTime() : -Infinity;
      unplaced.push({
        task_id: p.task_id,
        step_id,
        reason: deadline < daysEnd ? "no_time_before_due" : "no_time",
      });
    }
  }

  return {
    placed: placed.sort((a, b) => a.at - b.at).map(({ at: _at, ...pick }) => pick),
    unplaced,
  };
}
