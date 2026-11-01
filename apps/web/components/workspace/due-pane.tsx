"use client";

import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { formatMinutes, swatch, type Step, type Task } from "@tt/shared";
import {
  dragMinutes,
  DUE_RANGES,
  fmtWhen,
  taskColor,
  useDueRail,
  useModel,
  type DueRange,
  type RailItem,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { DueChip } from "@/components/ui/due-chip";
import { PRIORITY_CHIP } from "@/components/ui/priority-mark";
import type { DragItem } from "./dnd";

const RANGE_KEY = "dueRail.days";
const UNDATED_KEY = "dueRail.undatedOpen";
const heading = "px-1 pt-1 pb-1.5 text-[10px] font-extrabold tracking-wider uppercase";

function savedRange(): DueRange {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    return (DUE_RANGES as readonly number[]).includes(n) ? (n as DueRange) : 14;
  } catch {
    return 14;
  }
}

/**
 * What needs time soon. "At risk": overdue, or not enough open time left before the deadline
 * for the work that isn't scheduled yet. "Needs time": everything else due in the next
 * 7/14/30 days with unscheduled work, then (collapsed) tasks without a due date.
 */
export function DuePane({ pane, now }: { pane: string; now: number }) {
  const { listById, settings } = useModel();
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
  const atRisk = items.filter((i) => i.atRisk);
  const needsTime = items.filter((i) => !i.atRisk);

  const toggleUndated = () => {
    const next = !undatedOpen;
    setUndatedOpen(next);
    try {
      localStorage.setItem(UNDATED_KEY, next ? "1" : "0");
    } catch {}
  };

  const card = (item: RailItem, highlighted = false) => (
    <DueCard
      key={item.task.id}
      item={item}
      pane={pane}
      color={taskColor(item.task, listById)}
      listName={item.task.list_id ? listById.get(item.task.list_id)?.name : undefined}
      tz={tz}
      now={now}
      defaultMin={settings.default_block_min}
      stepPlannedAt={stepPlannedAt}
      highlighted={highlighted}
    />
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-[11px] font-semibold text-faint">Drag onto a calendar to schedule</p>
        <label className="flex items-center gap-1 text-[11px] font-bold text-muted">
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
            className="rounded-md border border-line bg-white px-1 py-0.5 font-bold text-ink"
          >
            {DUE_RANGES.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className={`${heading} text-risk`}>At risk · {atRisk.length}</h3>
      {atRisk.length ? (
        <ul className="space-y-1.5">{atRisk.map((i, n) => card(i, n === 0))}</ul>
      ) : (
        <p className="px-1 pb-2 text-[12px] text-faint">
          Nothing due in the next {days} days is short on time.
        </p>
      )}

      <h3 className={`${heading} mt-3 text-muted`}>Needs time · {needsTime.length}</h3>
      {needsTime.length ? (
        <ul className="space-y-1.5">{needsTime.map((i) => card(i))}</ul>
      ) : (
        <p className="px-1 text-[12px] text-faint">
          Everything due in the next {days} days has time blocked.
        </p>
      )}

      {undated.length > 0 && (
        <section className="mt-3">
          <button
            onClick={toggleUndated}
            aria-expanded={undatedOpen}
            className={`${heading} flex w-full items-center gap-1 rounded-md text-left text-muted hover:text-ink`}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${undatedOpen ? "rotate-90" : ""}`}
              strokeWidth={3}
            />
            No due date · {undated.length}
          </button>
          {undatedOpen && <ul className="space-y-1.5">{undated.map((i) => card(i))}</ul>}
        </section>
      )}
    </div>
  );
}

function DueCard(props: {
  item: RailItem;
  pane: string;
  color: string;
  listName?: string;
  tz: string;
  now: number;
  defaultMin: number;
  stepPlannedAt: Map<string, number>;
  highlighted: boolean;
}) {
  const { task, steps, neededMin, freeMin, atRisk, overdue, estimated, plannedAt } = props.item;
  const openTask = useOpenTask();
  const minutes = dragMinutes(neededMin);
  const c = swatch(props.color);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `task-${task.id}-${props.pane}`,
    data: {
      kind: "task",
      taskId: task.id,
      title: task.title,
      minutes,
      color: props.color,
      listName: props.listName,
      dueAt: task.due_at,
    } satisfies DragItem,
  });
  const { blocks } = useModel();
  const unscheduled = !blocks.some((b) => b.task_id === task.id && Date.parse(b.end) > props.now);

  return (
    <li>
      <div
        ref={setNodeRef}
        {...listeners}
        aria-roledescription="draggable task"
        className={`cursor-grab touch-none rounded-[11px] py-2 pr-2 pl-2.5 transition-all active:cursor-grabbing ${
          isDragging
            ? "border-[1.5px] border-dashed border-grape bg-grape-bg opacity-70"
            : props.highlighted
              ? "shadow-[0_5px_12px_rgba(135,117,201,0.14)]"
              : ""
        }`}
        style={
          isDragging
            ? undefined
            : {
                background: props.highlighted ? "var(--grape-bg)" : "var(--row)",
                borderLeft: `4px solid ${c.solid}`,
              }
        }
      >
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="block w-full text-left"
        >
          <p className="text-[12px] leading-snug font-extrabold text-ink">{task.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {props.listName && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: c.tint, color: c.ink }}
              >
                {props.listName}
              </span>
            )}
            {task.priority !== "none" && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: PRIORITY_CHIP[task.priority].bg,
                  color: PRIORITY_CHIP[task.priority].fg,
                }}
              >
                {PRIORITY_CHIP[task.priority].label}
              </span>
            )}
            <DueChip dueAt={task.due_at} tz={props.tz} now={props.now} className="!text-[10px] !font-bold" />
            <span
              className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white"
              title={estimated ? "Work left to schedule" : "No estimate yet, so it uses your default block length"}
            >
              {formatMinutes(minutes)}
              {!estimated && "?"}
            </span>
            {unscheduled && (
              <span className="rounded-md bg-chip px-1.5 py-0.5 text-[10px] font-bold text-[#73768c]">
                Unscheduled
              </span>
            )}
          </div>
          {task.due_at && (
            <p className={`mt-1 text-[11px] font-semibold ${atRisk ? "text-risk" : "text-faint"}`}>
              {overdue
                ? `${formatMinutes(neededMin)} of work left`
                : atRisk
                  ? `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`
                  : `${formatMinutes(freeMin)} open before it's due`}
            </p>
          )}
          {plannedAt !== undefined && (
            <p className="mt-0.5 text-[11px] font-semibold text-faint">
              Was planned {fmtWhen(plannedAt, props.tz, props.now)}, not done yet
            </p>
          )}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openTask(task.id, { panel: "schedule" })}
          className="mt-1.5 flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-bold text-grape-ink hover:bg-[#ece8f8]"
        >
          <CalendarPlus className="h-3 w-3" />
          Find time
        </button>
      </div>
      {steps.length > 0 && (
        <ul className="mt-1 mb-1 ml-4 space-y-0.5 border-l-2 pl-1.5" style={{ borderColor: c.tint }}>
          {steps.map((s) => (
            <DueStep
              key={s.id}
              step={s}
              task={task}
              pane={props.pane}
              color={props.color}
              listName={props.listName}
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

function DueStep(props: {
  step: Step;
  task: Task;
  pane: string;
  color: string;
  listName?: string;
  defaultMin: number;
  plannedAt?: number;
  tz: string;
  now: number;
}) {
  const { step, task } = props;
  const minutes = dragMinutes(step.estimate_min ?? props.defaultMin);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `step-${step.id}-${props.pane}`,
    data: {
      kind: "step",
      taskId: task.id,
      stepId: step.id,
      title: `${task.title} — ${step.title}`,
      minutes,
      color: props.color,
      listName: props.listName,
      dueAt: task.due_at,
    } satisfies DragItem,
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="draggable step"
      className={`flex cursor-grab touch-none items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] hover:bg-row-hover active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{step.title}</span>
        {props.plannedAt !== undefined && (
          <span className="block truncate text-faint">
            Was planned {fmtWhen(props.plannedAt, props.tz, props.now)}
          </span>
        )}
      </span>
      <span className="shrink-0 font-bold text-faint">{formatMinutes(minutes)}</span>
    </li>
  );
}
