"use client";

import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { formatMinutes, type Step, type Task } from "@tt/shared";
import {
  dragMinutes,
  DUE_RANGES,
  fmtDue,
  fmtWhen,
  taskColor,
  useDueRail,
  useModel,
  type DueRange,
  type RailItem,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import type { DragItem } from "./dnd";

const RANGE_KEY = "dueRail.days";
const UNDATED_KEY = "dueRail.undatedOpen";

function savedRange(): DueRange {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    return (DUE_RANGES as readonly number[]).includes(n) ? (n as DueRange) : 14;
  } catch {
    return 14;
  }
}

/**
 * Open tasks due in the next 7/14/30 days (plus anything overdue) that still have
 * unscheduled work, soonest first. Flagged red when the open time left before the
 * deadline can't cover that work. Below them, a collapsed list of open tasks without a
 * due date, so every task can be dragged onto the timeline.
 */
export function DueRail({ now }: { now: number }) {
  const { listById, settings } = useModel();
  const openTask = useOpenTask();
  const tz = settings.timezone;
  const [days, setDays] = useState<DueRange>(14);
  const [undatedOpen, setUndatedOpen] = useState(false);
  useEffect(() => {
    setDays(savedRange());
    try {
      setUndatedOpen(localStorage.getItem(UNDATED_KEY) === "1");
    } catch {}
  }, []);
  const { items, undated, stepPlannedAt } = useDueRail(now, days);

  const toggleUndated = () => {
    const next = !undatedOpen;
    setUndatedOpen(next);
    try {
      localStorage.setItem(UNDATED_KEY, next ? "1" : "0");
    } catch {}
  };

  const railTask = (item: RailItem) => (
    <RailTask
      key={item.task.id}
      item={item}
      color={taskColor(item.task, listById)}
      tz={tz}
      now={now}
      defaultMin={settings.default_block_min}
      stepPlannedAt={stepPlannedAt}
      onOpen={() => openTask(item.task.id)}
    />
  );

  return (
    <aside
      aria-label="Due"
      className="flex max-h-[40vh] shrink-0 flex-col border-t border-line bg-surface lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l"
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">Due</h2>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="sr-only">Show tasks due in the</span>
            Next
            <select
              value={days}
              onChange={(e) => {
                const n = Number(e.target.value) as DueRange;
                setDays(n);
                try {
                  localStorage.setItem(RANGE_KEY, String(n));
                } catch {}
              }}
              className="rounded border border-line bg-paper px-1 py-0.5 text-ink"
            >
              {DUE_RANGES.map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </label>
        </div>
        {items.length + undated.length > 0 && (
          <p className="text-xs text-muted">
            Drag a task or step onto the timeline to schedule it.
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {items.length > 0 ? (
          <ul>{items.map(railTask)}</ul>
        ) : (
          <p className="px-2 pb-2 text-muted">
            Nothing due in the next {days} days needs time.
            {undated.length === 0 && " Press ⌘K to add a task."}
          </p>
        )}
        {undated.length > 0 && (
          <section className="mt-2 border-t border-line pt-2">
            <button
              onClick={toggleUndated}
              aria-expanded={undatedOpen}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-muted hover:text-ink"
            >
              <span
                aria-hidden
                className={`transition-transform ${undatedOpen ? "rotate-90" : ""}`}
              >
                ›
              </span>
              No due date
              <span className="font-normal">{undated.length}</span>
            </button>
            {undatedOpen && <ul>{undated.map(railTask)}</ul>}
          </section>
        )}
      </div>
    </aside>
  );
}

function RailTask(props: {
  item: RailItem;
  color: string;
  tz: string;
  now: number;
  defaultMin: number;
  stepPlannedAt: Map<string, number>;
  onOpen: () => void;
}) {
  const { task, steps, neededMin, freeMin, atRisk, overdue, estimated, plannedAt } = props.item;
  const minutes = dragMinutes(neededMin);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: {
      kind: "task",
      taskId: task.id,
      title: task.title,
      minutes,
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
        {task.due_at ? (
          <>
            <div className={`mt-0.5 pl-4 text-xs ${tone}`}>
              {overdue ? "Overdue, was due " : "Due "}
              {fmtDue(task.due_at, props.tz, props.now)}
            </div>
            <div className={`pl-4 text-xs ${tone}`}>
              {overdue
                ? `${formatMinutes(neededMin)} of work left`
                : atRisk
                  ? `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`
                  : `Needs ${formatMinutes(neededMin)}, ${formatMinutes(freeMin)} open before then`}
            </div>
          </>
        ) : (
          <div className="mt-0.5 pl-4 text-xs text-muted">Needs {formatMinutes(neededMin)}</div>
        )}
        {plannedAt !== undefined && (
          <div className="pl-4 text-xs text-muted">
            Was planned {fmtWhen(plannedAt, props.tz, props.now)}, not done yet
          </div>
        )}
        {!estimated && (
          <div className="pl-4 text-xs text-muted">
            No estimate yet, so it drags as {formatMinutes(minutes)}. Open it to set one.
          </div>
        )}
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
              plannedAt={props.stepPlannedAt.get(s.id)}
              tz={props.tz}
              now={props.now}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RailStep(props: {
  step: Step;
  task: Task;
  color: string;
  defaultMin: number;
  plannedAt?: number;
  tz: string;
  now: number;
}) {
  const { step, task } = props;
  const minutes = dragMinutes(step.estimate_min ?? props.defaultMin);
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
      <span className="min-w-0">
        <span className="block truncate">{step.title}</span>
        {props.plannedAt !== undefined && (
          <span className="block truncate text-muted">
            Was planned {fmtWhen(props.plannedAt, props.tz, props.now)}
          </span>
        )}
      </span>
      <span className="shrink-0 text-muted">{formatMinutes(minutes)}</span>
    </li>
  );
}
