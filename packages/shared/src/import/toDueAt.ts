import { zonedInstant } from "../time";

const DEFAULT_TIME = "23:59";
const YEAR_MS = 365 * 86_400_000;

/**
 * Converts the AI's local wall-clock date/time into an instant in `tz`. Flags dates that
 * look wrong (unparseable, in the past for free text, or more than a year out) as uncertain.
 */
export function toDueAt(
  dueDate: string | null,
  dueTime: string | null,
  opts: { timezone: string; now: number; allowPast: boolean },
): { due_at: string | null; has_time: boolean; suspicious: string | null } {
  if (!dueDate) return { due_at: null, has_time: false, suspicious: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) {
    return { due_at: null, has_time: false, suspicious: `Couldn't read the date "${dueDate}"` };
  }
  const hasTime = !!dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime);
  const instant = zonedInstant(dueDate, hasTime ? dueTime! : DEFAULT_TIME, opts.timezone).getTime();
  let suspicious: string | null = null;
  if (!opts.allowPast && instant < opts.now) suspicious = "This date is in the past";
  else if (instant - opts.now > YEAR_MS) suspicious = "This date is more than a year away";
  return { due_at: new Date(instant).toISOString(), has_time: hasTime, suspicious };
}
