import type { Task } from "../schemas";
import { isRecurring } from "../recurrence/recurrence";
import { localDate, weekStart, zonedInstant } from "../time";

type ProgressFields = Pick<Task, "status" | "completed_at" | "updated_at" | "repeat" | "repeat_days">;

/**
 * When a to-do was checked off. The database fills `completed_at`; right after a check-off the
 * optimistic copy doesn't have it yet, so its last edit stands in.
 */
export function completedAt(task: ProgressFields): string | null {
  if (task.status !== "done") return null;
  return task.completed_at ?? task.updated_at;
}

/** The instant the current week (Monday 00:00 in `tz`) started. */
export function weekStartInstant(now: number, tz: string): number {
  return zonedInstant(weekStart(localDate(new Date(now), tz), tz), "00:00", tz).getTime();
}

/**
 * Whether a to-do was checked off this week. Repeating to-dos are checked off per day
 * (done_dates) and never count.
 */
export function isDoneThisWeek(task: ProgressFields, now: number, tz: string): boolean {
  if (isRecurring(task)) return false;
  const at = completedAt(task);
  return at !== null && Date.parse(at) >= weekStartInstant(now, tz);
}

/**
 * A list's week so far: to-dos checked off this week and those still open (repeating ones
 * left out). The sidebar shows it as "done of (done + open)".
 */
export function weekProgress(tasks: ProgressFields[], now: number, tz: string) {
  let done = 0;
  let open = 0;
  for (const t of tasks) {
    if (isRecurring(t)) continue;
    if (t.status === "open") open++;
    else if (isDoneThisWeek(t, now, tz)) done++;
  }
  return { done, open, total: done + open };
}
