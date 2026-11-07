"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Calendar, CalendarPlus, ChevronRight, Clock, Flag, type LucideIcon } from "lucide-react";
import { formatMinutes, swatch, type Step, type Task } from "@tt/shared";
import {
  dragMinutes,
  DUE_RANGES,
  dueTone,
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
const heading = "flex items-center gap-1.5 px-1 pt-1 pb-1.5 text-[11px] tracking-[0.08em] uppercase";

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
    <div className="h-full min-h-0 overflow-y-auto bg-paper px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-[11px] text-faint">Drag onto a calendar to schedule</p>
        <label className="flex items-center gap-1 text-[11px] text-muted">
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
            className="rounded-md border border-[#e4e4e7] bg-surface px-1 py-0.5 text-chip-ink"
          >
            {DUE_RANGES.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className={`${heading} text-risk`}>
        <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden />
        At risk · {atRisk.length}
      </h3>
      {atRisk.length ? (
        <ul className="space-y-2">{atRisk.map((item, i) => card(item, i === 0))}</ul>
      ) : (
        <p className="px-1 pb-2 text-[12px] text-faint">
          Nothing due in the next {days} days is short on time.
        </p>
      )}

      <h3 className={`${heading} mt-4 text-muted`}>Needs time · {needsTime.length}</h3>
      {needsTime.length ? (
        <ul className="space-y-2">{needsTime.map((item) => card(item))}</ul>
      ) : (
        <p className="px-1 text-[12px] text-faint">
          Everything due in the next {days} days has time blocked.
        </p>
      )}

      {undated.length > 0 && (
        <section className="mt-4">
          <button
            onClick={toggleUndated}
            aria-expanded={undatedOpen}
            className={`${heading} w-full gap-1 rounded-md text-left text-muted hover:text-ink`}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${undatedOpen ? "rotate-90" : ""}`}
              strokeWidth={3}
            />
            No due date · {undated.length}
          </button>
          {undatedOpen && <ul className="space-y-2">{undated.map((item) => card(item))}</ul>}
        </section>
      )}
    </div>
  );
}

const PRIORITY_LABEL = { high: "High", med: "Medium", low: "Low" } as const;

/** An outlined meta chip: small faint icon and a label. */
function MetaChip({
  icon: Icon,
  children,
  risk = false,
  title,
}: {
  icon: LucideIcon;
  children: ReactNode;
  risk?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border border-[#e4e4e7] bg-surface px-1.5 py-0.5 text-[11px] whitespace-nowrap ${risk ? "text-risk" : "text-chip-ink"}`}
    >
      <Icon className={`h-3 w-3 ${risk ? "text-coral" : "text-faint"}`} />
      {children}
    </span>
  );
}

/** The short status after the list name in the card's footer. */
function statusLine(item: RailItem, unscheduled: boolean): { text: string; risk: boolean } | null {
  const { neededMin, freeMin, atRisk, overdue } = item;
  if (overdue) return { text: `overdue, ${formatMinutes(neededMin)} left`, risk: true };
  if (atRisk)
    return {
      text: freeMin > 0 ? `only ${formatMinutes(freeMin)} open before due` : "no open time before due",
      risk: true,
    };
  if (unscheduled) return { text: "not on calendar", risk: false };
  return null;
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
  const { item } = props;
  const { task, steps, neededMin, estimated, plannedAt } = item;
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
  const tone = task.due_at ? dueTone(task.due_at, props.tz, props.now) : null;
  const dueLabel =
    task.due_at &&
    (tone === "overdue"
      ? `Overdue · ${fmtDue(task.due_at, props.tz, props.now)}`
      : fmtDue(task.due_at, props.tz, props.now));

  if (isDragging) {
    return (
      <li
        ref={setNodeRef}
        className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-3 py-2.5"
      >
        <p className="text-[13px] leading-snug text-faint">{task.title}</p>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="draggable task"
      className={`@container cursor-grab select-none [-webkit-touch-callout:none] rounded-xl border bg-surface px-3 py-2.5 transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] active:cursor-grabbing ${
        props.highlighted ? "border-line-strong shadow-[0_2px_6px_rgba(0,0,0,0.05)]" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="block w-full text-left focus:outline-none focus-visible:underline"
      >
        <span className="flex items-start gap-2 text-[13px] leading-snug text-ink">
          <span
            className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: c.solid }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">{task.title}</span>
        </span>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3.5">
        {dueLabel && (
          <MetaChip icon={Calendar} risk={tone === "overdue" || tone === "today"}>
            {dueLabel}
          </MetaChip>
        )}
        {task.priority !== "none" && (
          <MetaChip icon={Flag}>{PRIORITY_LABEL[task.priority]}</MetaChip>
        )}
        <MetaChip
          icon={Clock}
          title={
            estimated ? "Time left to schedule" : "No estimate yet, so it uses your default block length"
          }
        >
          {formatMinutes(minutes)}
          {!estimated && "?"}
          {!unscheduled && " left"}
        </MetaChip>
      </div>

      {plannedAt !== undefined && (
        <p className="mt-1.5 pl-3.5 text-[11px] text-faint">
          Was planned {fmtWhen(plannedAt, props.tz, props.now)}, not done yet
        </p>
      )}

      {steps.length > 0 && (
        <ul className="mt-2 space-y-1 pl-3.5">
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
              atRisk={item.stepUrgency.get(s.id)?.atRisk ?? false}
              tz={props.tz}
              now={props.now}
            />
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 pl-3.5">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-faint">
          {props.listName}
          {status && (
            <span className={status.risk ? "text-risk" : ""}>
              {props.listName ? " · " : ""}
              {status.text}
            </span>
          )}
        </p>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openTask(task.id, { panel: "schedule" })}
          aria-label="Find time"
          title="Find time"
          className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-chip-ink hover:bg-row-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
        >
          <CalendarPlus className="h-3 w-3" />
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
  /** The step's own deadline is past, or there isn't enough open time before it. */
  atRisk: boolean;
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
      dueAt: step.due_at ?? task.due_at,
    } satisfies DragItem,
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="draggable step"
      className={`flex cursor-grab select-none [-webkit-touch-callout:none] items-center justify-between gap-2 rounded-md border border-line-soft bg-row px-2 py-1 text-[11px] hover:bg-row-hover active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-ink">{step.title}</span>
        {props.plannedAt !== undefined && (
          <span className="block truncate text-faint">
            Was planned {fmtWhen(props.plannedAt, props.tz, props.now)}
          </span>
        )}
      </span>
      <span className="shrink-0 text-faint">
        {step.due_at && (
          <span className={props.atRisk ? "text-risk" : ""}>
            Due {fmtDue(step.due_at, props.tz, props.now)} ·{" "}
          </span>
        )}
        {formatMinutes(minutes)}
      </span>
    </li>
  );
}
