import { TZDate } from "@date-fns/tz";
import { localDate, zonedInstant } from "@tt/shared";

/** Minutes since local midnight of `day` in tz (may be negative or >1440 across midnights). */
export function minutesIntoDay(instant: number, day: string, tz: string): number {
  return (instant - zonedInstant(day, "00:00", tz).getTime()) / 60_000;
}

export function fmtTime(instant: number | string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .format(new Date(instant))
    .replace(":00", "")
    .replace(" ", "")
    .toLowerCase();
}

export function fmtDay(day: string, tz: string, style: "short" | "long" = "short"): string {
  const d = zonedInstant(day, "12:00", tz);
  return new Intl.DateTimeFormat("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    timeZone: tz,
  }).format(d);
}

/** "Today 11pm", "Tomorrow", "Fri 11:59pm", "Oct 20", with "overdue" handled by callers. */
export function fmtDue(dueAt: string, tz: string, now = Date.now()): string {
  const due = new Date(dueAt);
  const today = localDate(new Date(now), tz);
  const dueDay = localDate(due, tz);
  const z = new TZDate(due.getTime(), tz);
  const endOfDay = z.getHours() === 23 && z.getMinutes() === 59;
  const time = endOfDay ? "" : ` ${fmtTime(due, tz)}`;
  const dayDiff = Math.round(
    (zonedInstant(dueDay, "12:00", tz).getTime() - zonedInstant(today, "12:00", tz).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return `Today${time}`;
  if (dayDiff === 1) return `Tomorrow${time}`;
  if (dayDiff === -1) return `Yesterday${time}`;
  const opts: Intl.DateTimeFormatOptions =
    dayDiff > 1 && dayDiff < 7
      ? { weekday: "short", timeZone: tz }
      : { month: "short", day: "numeric", timeZone: tz };
  return new Intl.DateTimeFormat("en-US", opts).format(due) + time;
}
