"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  dueRisk,
  findFreeSlots,
  formatMinutes,
  type CalendarEvent,
  type Step,
  type Task,
} from "@tt/shared";
import { useModel } from "@/lib/client/data";
import { fmtDue } from "@/lib/client/time";
import { useOpenTask } from "@/components/app-shell";
import type { DragItem } from "./dnd";

// A dragged task becomes one block of its remaining work, capped so it stays one sitting.
const MAX_DRAG_BLOCK_MIN = 180;

type RailItem = {
  task: Task;
  steps: Step[];
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
      // Steps not yet done and without an upcoming block of their own.
      const scheduledSteps = new Set(
        blocks.filter((b) => b.step_id && Date.parse(b.end) > now).map((b) => b.step_id),
      );
      const openSteps = steps.filter((s) => !s.done && !scheduledSteps.has(s.id));
      out.push({ task, steps: openSteps, ...risk, atRisk: overdue || risk.atRisk, overdue });
    }
    return out.sort((a, b) => Date.parse(a.task.due_at!) - Date.parse(b.task.due_at!));
  }, [tasks, stepsByTask, blocks, events, settings, tz, from, to, now]);

  return (
    <aside
      aria-label="Due"
      className="flex max-h-[40vh] shrink-0 flex-col border-t border-line bg-surface lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l"
    >
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">Due</h2>
        {items.length > 0 && (
          <p className="text-xs text-muted">
            Drag a task or step onto the timeline to schedule it.
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-muted">
          Nothing left to schedule for these days. Press ⌘K to add a task with a due date.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {items.map((item) => (
            <RailTask
              key={item.task.id}
              item={item}
              color={(item.task.list_id && listById.get(item.task.list_id)?.color) || "#64748b"}
              tz={tz}
              now={now}
              defaultMin={settings.default_block_min}
              onOpen={() => openTask(item.task.id)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function RailTask(props: {
  item: RailItem;
  color: string;
  tz: string;
  now: number;
  defaultMin: number;
  onOpen: () => void;
}) {
  const { task, steps, neededMin, freeMin, atRisk, overdue } = props.item;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: {
      kind: "task",
      taskId: task.id,
      title: task.title,
      minutes: Math.min(neededMin, MAX_DRAG_BLOCK_MIN),
      color: props.color,
    } satisfies DragItem,
  });
  const tone = atRisk ? "text-risk" : "text-muted";
  return (
    <li className={isDragging ? "opacity-40" : ""}>
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={props.onOpen}
        className="w-full cursor-grab touch-none rounded-md px-2 py-2 text-left hover:bg-paper"
      >
        <div className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: props.color }}
            aria-hidden
          />
          <span className="truncate font-medium">{task.title}</span>
        </div>
        <div className={`mt-0.5 pl-4 text-xs ${tone}`}>
          {overdue ? "Overdue, was due " : "Due "}
          {fmtDue(task.due_at!, props.tz, props.now)}
        </div>
        <div className={`pl-4 text-xs ${tone}`}>
          {overdue
            ? `${formatMinutes(neededMin)} of work left`
            : atRisk
              ? `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`
              : `Needs ${formatMinutes(neededMin)}, ${formatMinutes(freeMin)} open before then`}
        </div>
      </button>
      {steps.length > 0 && (
        <ul className="mb-1 ml-6 border-l border-line">
          {steps.map((s) => (
            <RailStep
              key={s.id}
              step={s}
              task={task}
              color={props.color}
              defaultMin={props.defaultMin}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RailStep(props: { step: Step; task: Task; color: string; defaultMin: number }) {
  const { step, task } = props;
  const minutes = step.estimate_min ?? props.defaultMin;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `step-${step.id}`,
    data: {
      kind: "step",
      taskId: task.id,
      stepId: step.id,
      title: `${task.title} — ${step.title}`,
      minutes,
      color: props.color,
    } satisfies DragItem,
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab touch-none items-center justify-between gap-2 rounded-r px-2 py-1 text-xs hover:bg-paper ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="truncate">{step.title}</span>
      <span className="shrink-0 text-muted">{formatMinutes(minutes)}</span>
    </li>
  );
}
