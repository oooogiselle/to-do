import type { Repeat, Task } from "../schemas";
import { addDays } from "../time";

type RepeatFields = Pick<Task, "repeat" | "repeat_days">;

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Never",
  daily: "Daily",
  weekdays: "Weekdays",
  custom: "Custom",
};

/** Monday-first order for pickers; `day` is 0 = Sunday ... 6 = Saturday. */
export const WEEKDAY_OPTIONS = [
  { day: 1, short: "M", name: "Mon" },
  { day: 2, short: "T", name: "Tue" },
  { day: 3, short: "W", name: "Wed" },
  { day: 4, short: "T", name: "Thu" },
  { day: 5, short: "F", name: "Fri" },
  { day: 6, short: "S", name: "Sat" },
  { day: 0, short: "S", name: "Sun" },
] as const;

/** Day of the week (0 = Sunday) of a local "YYYY-MM-DD" date; no time zone involved. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Whether a task repeats. A custom repeat with no days never occurs, so it doesn't count. */
export function isRecurring(task: RepeatFields): boolean {
  return (
    task.repeat === "daily" ||
    task.repeat === "weekdays" ||
    (task.repeat === "custom" && task.repeat_days.length > 0)
  );
}

/** Short label: "Daily", "Weekdays", "Mon, Wed, Fri". */
export function repeatLabel(task: RepeatFields): string {
  if (task.repeat !== "custom") return REPEAT_LABEL[task.repeat];
  if (task.repeat_days.length === 7) return "Daily";
  return (
    WEEKDAY_OPTIONS.filter((o) => task.repeat_days.includes(o.day))
      .map((o) => o.name)
      .join(", ") || REPEAT_LABEL.none
  );
}

/** Whether a repeating task comes up on a local date. */
export function occursOn(task: RepeatFields, date: string): boolean {
  const day = weekdayOf(date);
  switch (task.repeat) {
    case "daily":
      return true;
    case "weekdays":
      return day !== 0 && day !== 6;
    case "custom":
      return task.repeat_days.includes(day);
    default:
      return false;
  }
}

/** Done state to show: per day for repeating tasks, otherwise the task's own status. */
export function isDoneOn(task: RepeatFields & Pick<Task, "done_dates" | "status">, date: string) {
  return isRecurring(task) ? task.done_dates.includes(date) : task.status === "done";
}

/** `done_dates` with `date` checked or unchecked, sorted, without duplicates. */
export function toggleDoneDate(doneDates: string[], date: string, done: boolean): string[] {
  const rest = doneDates.filter((d) => d !== date);
  return done ? [...rest, date].sort() : rest;
}

/**
 * Consecutive occurrences done up to `date`. Today counts once it's checked; until then the
 * streak is whatever ran up to yesterday, so it doesn't read as broken mid-day.
 */
export function streakOn(task: RepeatFields & Pick<Task, "done_dates">, date: string): number {
  if (!isRecurring(task)) return 0;
  const done = new Set(task.done_dates);
  let cursor = done.has(date) ? date : addDays(date, -1);
  let count = 0;
  for (let i = 0; i < 400; i++) {
    if (occursOn(task, cursor)) {
      if (!done.has(cursor)) break;
      count += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}
