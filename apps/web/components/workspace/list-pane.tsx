"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { formatMinutes, type List, type Task } from "@tt/shared";
import { dragMinutes, fmtSlot, taskColor, useCompletion, useModel } from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { DueChip } from "@/components/ui/due-chip";
import { InlineAdd } from "@/components/ui/inline-add";
import { PriorityMark } from "@/components/ui/priority-mark";
import { TaskCheck } from "@/components/ui/task-check";
import type { DragItem } from "./dnd";

const byDue = (a: Task, b: Task) =>
  (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity) ||
  a.created_at.localeCompare(b.created_at);

/** Open tasks of one list (or of no list), each draggable onto a calendar. */
export function ListPane({ listId, pane, now }: { listId: string | null; pane: string; now: number }) {
  const { tasks, blocks, listById, settings } = useModel();
  const list = listId ? listById.get(listId) : null;

  const { open, doneCount } = useMemo(() => {
    const mine = tasks.filter((t) =>
      listId ? t.list_id === listId : !t.list_id || !listById.has(t.list_id),
    );
    return {
      open: mine.filter((t) => t.status === "open").sort(byDue),
      doneCount: mine.filter((t) => t.status === "done").length,
    };
  }, [tasks, listId, listById]);

  // Each task's upcoming blocks: the first one shows on the row, the total sets drag length.
  const upcoming = useMemo(() => {
    const m = new Map<string, { first: { start: number; end: number }; minutes: number }>();
    for (const b of blocks) {
      const start = Date.parse(b.start);
      const end = Date.parse(b.end);
      if (end <= now) continue;
      const prev = m.get(b.task_id);
      const minutes = (end - Math.max(start, now)) / 60_000;
      if (!prev) m.set(b.task_id, { first: { start, end }, minutes });
      else
        m.set(b.task_id, {
          first: start < prev.first.start ? { start, end } : prev.first,
          minutes: prev.minutes + minutes,
        });
    }
    return m;
  }, [blocks, now]);

  if (listId && !list) return <p className="p-4 text-sm text-muted">This list no longer exists.</p>;
  const name = list?.name ?? "No list";
  const color = list?.color ?? "var(--faint)";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {open.length ? (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
          {open.map((t) => (
            <ListPaneRow
              key={t.id}
              task={t}
              list={list ?? null}
              color={taskColor(t, listById)}
              pane={pane}
              now={now}
              tz={settings.timezone}
              defaultMin={settings.default_block_min}
              upcoming={upcoming.get(t.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid flex-1 place-items-center px-4 text-center text-[12px] text-faint">
          No open tasks.
        </div>
      )}
      {doneCount > 0 && (
        <p className="px-3.5 pb-1 text-[10px] font-semibold text-faint">{doneCount} done</p>
      )}
      <InlineAdd listId={listId} listName={name} color={color} />
    </div>
  );
}

function ListPaneRow(props: {
  task: Task;
  list: List | null;
  color: string;
  pane: string;
  now: number;
  tz: string;
  defaultMin: number;
  upcoming?: { first: { start: number; end: number }; minutes: number };
}) {
  const { task, color, upcoming } = props;
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const estimate = task.estimate_min ?? props.defaultMin;
  const left = estimate - (upcoming?.minutes ?? 0);
  const minutes = dragMinutes(left > 0 ? left : estimate);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `task-${task.id}-${props.pane}`,
    data: {
      kind: "task",
      taskId: task.id,
      title: task.title,
      minutes,
      color,
      listName: props.list?.name,
      dueAt: task.due_at,
    } satisfies DragItem,
  });

  if (isDragging) {
    return (
      <li
        ref={setNodeRef}
        className="rounded-xl border-[1.5px] border-dashed border-grape bg-grape-bg px-2.5 py-2"
      >
        <p className="text-[12px] leading-snug font-extrabold text-[#4b3f7a]">{task.title}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-grape italic">
          ↳ dragging onto calendar…
        </p>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-roledescription="draggable task"
      className="group flex cursor-grab select-none [-webkit-touch-callout:none] items-start gap-2 rounded-xl bg-row px-2.5 py-2 transition-colors hover:bg-row-hover active:cursor-grabbing"
    >
      <div className="pt-0.5">
        <TaskCheck
          done={false}
          color={color}
          onToggle={() => setTaskDone(task.id, true)}
          label={task.title}
          size={16}
        />
      </div>
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block text-[12px] leading-snug font-bold text-ink">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {upcoming ? (
            <span className="rounded-md bg-[#e6f2ec] px-1.5 py-0.5 text-[10px] font-bold text-[#2f6b52]">
              {fmtSlot(upcoming.first.start, upcoming.first.end, props.tz, props.now)}
            </span>
          ) : (
            <DueChip dueAt={task.due_at} tz={props.tz} now={props.now} className="!text-[10px] !font-bold" />
          )}
          {task.estimate_min && (
            <span className="text-[10px] font-semibold text-faint">
              {formatMinutes(task.estimate_min)}
            </span>
          )}
          <PriorityMark priority={task.priority} />
        </span>
      </button>
      <GripVertical
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-line-strong opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </li>
  );
}
