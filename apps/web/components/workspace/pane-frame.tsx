"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, X } from "lucide-react";
import { useModel } from "@tt/client";
import { PaneContent } from "./pane-content";
import { usePaneLabel } from "./calendar-dates";
import { listIdOf, paneColor, type PaneId } from "./layout";
import type { DragItem } from "./dnd";

/** A pane in a side column: a header with a drag handle and close button, then its content. */
export function PaneFrame({
  pane,
  now,
  onClose,
}: {
  pane: PaneId;
  now: number;
  onClose: () => void;
}) {
  const { lists, tasks, listById } = useModel();
  const label = usePaneLabel(now)(pane);
  const listId = listIdOf(pane);
  const count =
    listId === undefined
      ? null
      : tasks.filter(
          (t) =>
            t.status === "open" &&
            (listId ? t.list_id === listId : !t.list_id || !listById.has(t.list_id)),
        ).length;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `pane-${pane}`,
    data: { kind: "pane", paneId: pane, label } satisfies DragItem,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[13px] border border-line-soft bg-surface shadow-[0_1px_2px_rgba(21,23,43,0.04)] transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[#f0f1f7] px-2.5 py-2">
        <button
          type="button"
          {...listeners}
          aria-label={`Move ${label} pane`}
          title="Drag to move"
          className="-ml-1 grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-[#b5b8c9] hover:bg-[#f0f1f7] hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="h-2 w-2 rounded-[3px]" style={{ background: paneColor(pane, lists) }} />
        <h2 className="flex-1 truncate text-[12px] font-extrabold text-ink">{label}</h2>
        {count !== null && (
          <span className="text-[10px] font-extrabold text-[#a0a3b5]">{count}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label} pane`}
          className="grid h-6 w-6 place-items-center rounded-md text-[#b5b8c9] hover:bg-[#f0f1f7] hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <PaneContent pane={pane} now={now} />
      </div>
    </section>
  );
}
