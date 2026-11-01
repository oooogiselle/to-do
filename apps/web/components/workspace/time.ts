import { addDays, localWeekday, zonedInstant } from "@tt/shared";

/** Monday of the week containing `day`. */
export function weekStart(day: string, tz: string) {
  const wd = localWeekday(zonedInstant(day, "12:00", tz), tz);
  return addDays(day, -((wd + 6) % 7));
}

/** Hour to scroll a calendar to on open: one before the earliest working-hours start. */
export function earliestStart(hours: Record<string, { start: string } | null>) {
  const starts = Object.values(hours).flatMap((h) => (h ? [parseInt(h.start, 10)] : []));
  return starts.length ? Math.max(0, Math.min(...starts) - 1) : 8;
}
