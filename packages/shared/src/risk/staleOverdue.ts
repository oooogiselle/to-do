import type { Task } from "../schemas";
import { isRecurring } from "../recurrence/recurrence";

/** Overdue by more than this many days, a to-do is stale: it stops being pressing, and To-dos asks whether to delete it. */
export const STALE_OVERDUE_DAYS = 3;

const DAY = 86_400_000;

type StaleFields = Pick<Task, "status" | "due_at" | "overdue_kept_due" | "repeat" | "repeat_days">;

/**
 * An open, one-off to-do that's more than 3 days past due and that the user hasn't chosen to
 * keep at this due date. A new due date that lapses again counts again.
 */
export function isStaleOverdue(task: StaleFields, nowMs: number): boolean {
  if (task.status !== "open" || !task.due_at || isRecurring(task)) return false;
  const due = Date.parse(task.due_at);
  if (!(nowMs - due > STALE_OVERDUE_DAYS * DAY)) return false;
  return !task.overdue_kept_due || Date.parse(task.overdue_kept_due) !== due;
}
