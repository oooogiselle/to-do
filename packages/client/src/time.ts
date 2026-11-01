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
  const z = new TZDate(due.getTime(), tz);
  const endOfDay = z.getHours() === 23 && z.getMinutes() === 59;
  return relDay(due, tz, now) + (endOfDay ? "" : ` ${fmtTime(due, tz)}`);
}

/** Day and time of an instant: "Today 3:30 PM", "Thu 2:00 PM", "Oct 21 9:00 AM". */
export function fmtWhen(instant: number | string | Date, tz: string, now = Date.now()): string {
  const d = new Date(instant);
  return `${relDay(d, tz, now)} ${fmtTime(d, tz)}`;
}

/** A slot's day and time range: "Today, 3–4:30pm", "Thu, Oct 22, 9–10am". */
export function fmtSlot(start: number, end: number, tz: string, now = Date.now()): string {
  const day = localDate(new Date(start), tz);
  const dayLabel = day === localDate(new Date(now), tz) ? "Today" : fmtDay(day, tz);
  return `${dayLabel}, ${fmtTime(start, tz)}–${fmtTime(end, tz)}`;
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the coming week, else "Oct 21". */
function relDay(d: Date, tz: string, now: number): string {
  const today = localDate(new Date(now), tz);
  const day = localDate(d, tz);
  const dayDiff = Math.round(
    (zonedInstant(day, "12:00", tz).getTime() - zonedInstant(today, "12:00", tz).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff === -1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions =
    dayDiff > 1 && dayDiff < 7
      ? { weekday: "short", timeZone: tz }
      : { month: "short", day: "numeric", timeZone: tz };
  return new Intl.DateTimeFormat("en-US", opts).format(d);
}

/** "HH:mm" (24h) of `instant` as seen in `tz`, for <input type="time">. */
export function localTime(instant: number | string | Date, tz: string): string {
  const z = new TZDate(new Date(instant).getTime(), tz);
  return `${String(z.getHours()).padStart(2, "0")}:${String(z.getMinutes()).padStart(2, "0")}`;
}

export type DueTone = "overdue" | "today" | "soon" | "later";

/** How urgent a due date reads: past due, due today, due tomorrow, or later. */
export function dueTone(dueAt: string, tz: string, now = Date.now()): DueTone {
  const due = new Date(dueAt).getTime();
  if (due < now) return "overdue";
  const dayDiff = Math.round(
    (zonedInstant(localDate(new Date(due), tz), "12:00", tz).getTime() -
      zonedInstant(localDate(new Date(now), tz), "12:00", tz).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "soon";
  return "later";
}

