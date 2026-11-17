import { SCHEDULING_DEFAULTS, SchedulingPrefs, type WorkingHours } from "../schemas";
import { addDays, localDate, zonedInstant } from "../time";
import { findFreeSlots } from "./freeSlots";
import type { PlacePrefs, PlanDay } from "./placePicks";

type Timed = { start: string; end: string };
type CalEvent = Timed & { busy?: boolean; all_day?: boolean };

/** The user's scheduling preferences (settings.scheduling), with defaults filled in. */
export function schedulingPrefs(raw: unknown): PlacePrefs {
  const parsed = SchedulingPrefs.safeParse(raw ?? {});
  const p = parsed.success ? parsed.data : {};
  return {
    focus: p.focus,
    max_session_min: p.max_session_min ?? SCHEDULING_DEFAULTS.max_session_min,
    break_min: p.break_min ?? SCHEDULING_DEFAULTS.break_min,
    daily_cap_min: p.daily_cap_min,
  };
}

/**
 * The days `placePicks` can fill: today (from `now`) and the next `days - 1`, each with its free
 * time kept `breakMin` away from events and existing blocks, and the minutes already booked on it
 * (for the daily cap). All-day events don't take time.
 */
export function buildPlanDays(opts: {
  events: CalEvent[];
  blocks: Timed[];
  workingHours: WorkingHours;
  timezone: string;
  now: number;
  days: number;
  breakMin: number;
}): PlanDay[] {
  const { timezone: tz, now, blocks } = opts;
  const startOf = (date: string) => zonedInstant(date, "00:00", tz).getTime();
  const today = localDate(new Date(now), tz);
  const pad = opts.breakMin * 60_000;
  const padded = [
    ...opts.events.filter((e) => !e.all_day).map((e) => ({ start: e.start, end: e.end, busy: e.busy })),
    ...blocks.map((b) => ({ start: b.start, end: b.end, busy: true })),
  ].map((b) => ({ start: Date.parse(b.start) - pad, end: Date.parse(b.end) + pad, busy: b.busy }));

  return Array.from({ length: opts.days }, (_, i) => {
    const date = addDays(today, i);
    const dayStart = startOf(date);
    const to = startOf(addDays(date, 1));
    const from = i === 0 ? Math.max(now, dayStart) : dayStart;
    const bookedMin = blocks.reduce((n, b) => {
      const s = Math.max(Date.parse(b.start), dayStart);
      const e = Math.min(Date.parse(b.end), to);
      return e > s ? n + (e - s) / 60_000 : n;
    }, 0);
    return {
      date,
      free: findFreeSlots(padded, { workingHours: opts.workingHours, timezone: tz, from, to, minMinutes: 15 }),
      bookedMin,
    };
  });
}
