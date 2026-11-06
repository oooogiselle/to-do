"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarPlus, Repeat, X } from "lucide-react";
import {
  formatMinutes,
  localDate,
  swatch,
  type DayPlanItem,
  type Step,
  type Task,
} from "@tt/shared";
import {
  dragMinutes,
  fmtTime,
  taskColor,
  useCompletion,
  useModel,
  useRemoveFromPlan,
  useUpdateTask,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { TaskCheck } from "@/components/ui/task-check";
import type { DragItem } from "./dnd";

const iconBtn =
  "grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-row-hover hover:text-ink focus-visible:outline-2";

/**
 * One planned to-do, or one step of a bigger to-do: drag it to reorder, or onto a day to give
 * it a time.
 */
export function PlanItem({
  item,
  task,
  step,
  date,
  paneKey,
}: {
  item: DayPlanItem;
  task: Task;
  /** Set when this item plans one step of `task`. */
  step?: Step;
  date: string;
  paneKey: string;
}) {
  const { blocks, listById, settings } = useModel();
  const tz = settings.timezone;
  const openTask = useOpenTask();
  const { setTaskDone, setStepDone } = useCompletion();
  const remove = useRemoveFromPlan();
  const update = useUpdateTask();

  const list = task.list_id ? listById.get(task.list_id) : undefined;
  const color = taskColor(task, listById);
  const c = swatch(color);
  const done = step ? step.done : task.status === "done";
  const title = step ? step.title : task.title;
  const estimate = (step ? step.estimate_min : task.estimate_min) ?? settings.default_block_min;
  // A step shows its own block; a whole task shows any of its blocks.
  const block = blocks
    .filter(
      (b) =>
        b.task_id === task.id &&
        (!step || b.step_id === step.id) &&
        localDate(new Date(b.start), tz) === date,
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];

  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `plan-${paneKey}-${item.id}`,
    data: (step
      ? {
          kind: "step",
          taskId: task.id,
          stepId: step.id,
          title: `${task.title} — ${step.title}`,
          minutes: dragMinutes(estimate),
          color,
          listName: list?.name,
          dueAt: step.due_at ?? task.due_at,
          planItemId: item.id,
        }
      : {
          kind: "task",
          taskId: task.id,
          title: task.title,
          minutes: dragMinutes(estimate),
          color,
          listName: list?.name,
          dueAt: task.due_at,
          planItemId: item.id,
        }) satisfies DragItem,
  });

  if (isDragging) {
    return (
      <li
        ref={setNodeRef}
        data-plan-item={item.id}
        className="flex h-11 items-center rounded border border-dashed px-2"
        style={{ borderColor: c.solid, background: c.tint }}
      >
        <span className="truncate text-[13px]" style={{ color: c.ink }}>
          {title}
        </span>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      data-plan-item={item.id}
      {...listeners}
      aria-roledescription="draggable to-do"
      className="group relative flex cursor-grab select-none [-webkit-touch-callout:none] items-center gap-3 border-b border-line-soft py-2.5 pr-1 pl-3 active:cursor-grabbing"
    >
      <span
        aria-hidden="true"
        className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full"
        style={{ background: c.solid, opacity: done ? 0.35 : 1 }}
      />
      <TaskCheck
        done={done}
        color={c.solid}
        onToggle={() => (step ? setStepDone(task.id, step.id, !done) : setTaskDone(task.id, !done))}
        label={title}
        size={16}
      />
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="min-w-0 flex-1 text-left focus-visible:underline"
      >
        <span
          className={`block truncate text-[13px] ${done ? "text-faint line-through" : "text-ink"}`}
        >
          {title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
          {step && <span className="truncate">{task.title}</span>}
          {step && <span aria-hidden="true">·</span>}
          {list && <span style={{ color: c.ink }}>{list.name}</span>}
          {list && <span aria-hidden="true">·</span>}
          <span>{formatMinutes(estimate)}</span>
          {block && (
            <span className="rounded bg-open-line/30 px-1.5 py-px text-[10px] text-open-ink">
              {fmtTime(block.start, tz)}–{fmtTime(block.end, tz)}
            </span>
          )}
        </span>
      </button>
      <div
        className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 no-hover:opacity-100 focus-within:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!block && !done && (
          <button
            type="button"
            onClick={() => openTask(task.id, { panel: "schedule" })}
            aria-label={`Find time for ${title}`}
            title="Find time"
            className={iconBtn}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
          </button>
        )}
        {!step && (
          <button
            type="button"
            onClick={() => {
              update.mutate({
                id: task.id,
                patch: { repeat: "daily", status: "open", done_dates: done ? [date] : [] },
              });
              remove.mutate(item.id);
            }}
            aria-label={`Repeat ${task.title} every day`}
            title="Make daily"
            className={iconBtn}
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => remove.mutate(item.id)}
          aria-label={`Remove ${title} from this day`}
          title="Remove from day"
          className={iconBtn}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
