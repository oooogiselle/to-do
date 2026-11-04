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
import { PriorityMark } from "@/components/ui/priority-mark";
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

  const card = (item: RailItem) => (
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
    />
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-paper px-2.5 py-2">
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
            className="rounded-md border border-line bg-surface px-1 py-0.5 font-bold text-ink"
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
        <ul className="space-y-2.5">{atRisk.map(card)}</ul>
      ) : (
        <p className="px-1 pb-2 text-[12px] text-faint">
          Nothing due in the next {days} days is short on time.
        </p>
      )}

      <h3 className={`${heading} mt-3 text-muted`}>Needs time · {needsTime.length}</h3>
      {needsTime.length ? (
        <ul className="space-y-2.5">{needsTime.map(card)}</ul>
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
          {undatedOpen && <ul className="space-y-2.5">{undated.map(card)}</ul>}
        </section>
      )}
    </div>
  );
}

/** What the card's footer says about the time this task still needs. */
function statusLine(item: RailItem, unscheduled: boolean) {
  const { task, neededMin, freeMin, atRisk, overdue } = item;
  if (overdue) return `${formatMinutes(neededMin)} of work left`;
  if (atRisk)
    return `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`;
  if (!task.due_at) return unscheduled ? "Not scheduled yet" : null;
  const open = `${formatMinutes(freeMin)} open before it's due`;
  return unscheduled ? `Not scheduled yet, ${open}` : open;
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
}) {
  const { item } = props;
  const { task, steps, neededMin, atRisk, estimated, plannedAt } = item;
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
  const status = statusLine(item, unscheduled);

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="draggable task"
      className={`@container relative cursor-grab select-none [-webkit-touch-callout:none] rounded-xl border pl-3.5 transition-opacity active:cursor-grabbing ${
        isDragging
          ? "border-[1.5px] border-dashed border-grape bg-grape-bg opacity-70"
          : `bg-surface shadow-card ${atRisk ? "border-[#f0d5cc]" : "border-line-soft"}`
      }`}
    >
      <span
        className="absolute top-2 bottom-2 left-1.5 w-1 rounded-full"
        style={{ background: c.solid }}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="block w-full pt-2.5 pr-2.5 pb-2 text-left"
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug font-extrabold text-ink">
            {task.title}
          </span>
          <span
            className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white"
            title={
              estimated
                ? "Time left to schedule"
                : "No estimate yet, so it uses your default block length"
            }
          >
            {formatMinutes(minutes)}
            {!estimated && "?"}
          </span>
        </span>
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {props.listName && (
            <span
              className="flex max-w-full min-w-0 items-center gap-1 text-[11px] font-bold"
              style={{ color: c.ink }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.solid }} />
              <span className="truncate">{props.listName}</span>
            </span>
          )}
          <DueChip
            dueAt={task.due_at}
            tz={props.tz}
            now={props.now}
            className="shrink-0 !text-[10px] !font-bold"
          />
          <PriorityMark priority={task.priority} />
        </span>
        {plannedAt !== undefined && (
          <span className="mt-1 block text-[11px] font-semibold text-faint">
            Was planned {fmtWhen(plannedAt, props.tz, props.now)}, not done yet
          </span>
        )}
      </button>

      {steps.length > 0 && (
        <ul className="-mt-0.5 mr-2.5 mb-1.5 space-y-0.5">
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

      <div className="mr-2.5 flex items-center gap-2 border-t border-line-soft py-1.5">
        <p
          className={`min-w-0 flex-1 text-[11px] leading-snug font-semibold ${atRisk ? "text-risk" : "text-muted"}`}
        >
          {status}
        </p>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openTask(task.id, { panel: "schedule" })}
          aria-label="Find time"
          title="Find time"
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-grape-ink hover:bg-[#ece8f8]"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          <span className="@max-[15rem]:hidden">Find time</span>
        </button>
      </div>
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
      className={`flex cursor-grab select-none [-webkit-touch-callout:none] items-center justify-between gap-2 rounded-lg bg-row px-2 py-1 text-[11px] hover:bg-row-hover active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
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
