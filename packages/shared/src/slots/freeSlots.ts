import type { WorkingHours } from "../schemas";
import { addDays, localDate, localWeekday, zonedInstant } from "../time";

export type Interval = { start: number; end: number }; // epoch ms, end exclusive

export const MIN_SLOT_MIN = 15;

type BusyItem = { start: string | number | Date; end: string | number | Date; busy?: boolean };

const ms = (v: string | number | Date) => (typeof v === "number" ? v : new Date(v).getTime());

/** Working-hours windows for each local day touching [from, to), clipped to the range. */
export function workingWindows(
  workingHours: WorkingHours,
  tz: string,
  from: number,
  to: number,
): Interval[] {
  const out: Interval[] = [];
  let day = localDate(new Date(from), tz);
  const lastDay = localDate(new Date(to), tz);
  for (;;) {
    const noon = zonedInstant(day, "12:00", tz);
    const hours = workingHours[String(localWeekday(noon, tz)) as keyof WorkingHours];
    if (hours) {
      const start = Math.max(zonedInstant(day, hours.start, tz).getTime(), from);
      const end = Math.min(zonedInstant(day, hours.end, tz).getTime(), to);
      if (end > start) out.push({ start, end });
    }
    if (day === lastDay) break;
    day = addDays(day, 1);
  }
  return out;
}

/** Sorts and merges overlapping or touching intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/**
 * Free time = inside working hours, not covered by any busy item, at least `minMinutes` long.
 * `busy` takes gcal events (items with busy=false are ignored) and the app's own time blocks.
 */
export function findFreeSlots(
  busy: BusyItem[],
  opts: { workingHours: WorkingHours; timezone: string; from: number; to: number; minMinutes?: number },
): Interval[] {
  const minMs = (opts.minMinutes ?? MIN_SLOT_MIN) * 60_000;
  const blocked = mergeIntervals(
    busy
      .filter((b) => b.busy !== false)
      .map((b) => ({ start: ms(b.start), end: ms(b.end) }))
      .filter((b) => b.end > opts.from && b.start < opts.to),
  );
  const free: Interval[] = [];
  for (const win of workingWindows(opts.workingHours, opts.timezone, opts.from, opts.to)) {
    let cursor = win.start;
    for (const b of blocked) {
      if (b.end <= cursor) continue;
      if (b.start >= win.end) break;
      if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, win.end) });
      cursor = Math.max(cursor, b.end);
      if (cursor >= win.end) break;
    }
    if (cursor < win.end) free.push({ start: cursor, end: win.end });
  }
  return free.filter((s) => s.end - s.start >= minMs);
}

export function totalMinutes(intervals: Interval[]): number {
  return Math.round(intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / 60_000);
}
