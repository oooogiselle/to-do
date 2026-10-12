"use client";

import { useMemo } from "react";
import { dueRisk, findFreeSlots, formatMinutes, type CalendarEvent, type Task } from "@tt/shared";
import { useModel } from "@/lib/client/data";
import { fmtDue } from "@/lib/client/time";
import { useOpenTask } from "@/components/app-shell";

type RailItem = {
  task: Task;
  neededMin: number;
  freeMin: number;
  atRisk: boolean;
  overdue: boolean;
};

/**
 * Open tasks due in the visible range (plus anything overdue) that still have unscheduled
 * work. Flagged red when the open time left before the deadline can't cover that work.
 */
export function DueRail({
  from,
  to,
  now,
  events,
}: {
  from: number;
  to: number;
  now: number;
  events: CalendarEvent[];
}) {
  const { tasks, stepsByTask, blocks, listById, settings } = useModel();
  const openTask = useOpenTask();
  const tz = settings.timezone;

  const items = useMemo(() => {
    const free = findFreeSlots([...events, ...blocks], {
      workingHours: settings.working_hours,
      timezone: tz,
      from: now,
      to: Math.max(to, now),
    });
    const out: RailItem[] = [];
    for (const task of tasks) {
      if (task.status !== "open" || !task.due_at) continue;
      const due = Date.parse(task.due_at);
      const overdue = due < now;
      if (!overdue && (due < from || due >= to)) continue;

      const steps = stepsByTask.get(task.id) ?? [];
      const stepEst = steps
        .filter((s) => !s.done)
        .reduce((sum, s) => sum + (s.estimate_min ?? 0), 0);
      const remaining = steps.some((s) => s.estimate_min)
        ? stepEst
        : (task.estimate_min ?? settings.default_block_min);
      const scheduledMin = blocks
        .filter((b) => b.task_id === task.id && Date.parse(b.end) > now)
        .reduce(
          (sum, b) => sum + (Date.parse(b.end) - Math.max(Date.parse(b.start), now)) / 60_000,
          0,
        );
      const risk = dueRisk({
        dueAt: due,
        remainingEstimateMin: remaining,
        scheduledMin,
        freeSlots: free,
      });
      if (risk.neededMin <= 0) continue;
      out.push({ task, ...risk, atRisk: overdue || risk.atRisk, overdue });
    }
    return out.sort((a, b) => Date.parse(a.task.due_at!) - Date.parse(b.task.due_at!));
  }, [tasks, stepsByTask, blocks, events, settings, tz, from, to, now]);

  return (
    <aside
      aria-label="Due"
      className="flex max-h-[40vh] shrink-0 flex-col border-t border-line bg-surface lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l"
    >
      <h2 className="px-4 pt-3 pb-2 text-[15px] font-semibold tracking-tight">Due</h2>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-muted">
          Nothing left to schedule for these days. Press ⌘K to add a task with a due date.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {items.map(({ task, neededMin, freeMin, atRisk, overdue }) => {
            const list = task.list_id ? listById.get(task.list_id) : undefined;
            return (
              <li key={task.id}>
                <button
                  onClick={() => openTask(task.id)}
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-paper"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: list?.color ?? "var(--line-strong)" }}
                      aria-hidden
                    />
                    <span className="truncate font-medium">{task.title}</span>
                  </div>
                  <div className={`mt-0.5 pl-4 text-xs ${atRisk ? "text-risk" : "text-muted"}`}>
                    {overdue ? "Overdue, was due " : "Due "}
                    {fmtDue(task.due_at!, tz, now)}
                  </div>
                  <div className={`pl-4 text-xs ${atRisk ? "text-risk" : "text-muted"}`}>
                    {overdue
                      ? `${formatMinutes(neededMin)} of work left`
                      : atRisk
                        ? `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`
                        : `Needs ${formatMinutes(neededMin)}, ${formatMinutes(freeMin)} open before then`}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
