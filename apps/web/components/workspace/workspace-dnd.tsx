"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { DAY_MIN, instantAt, snap, tempId, useCreateBlock, useMoveBlock } from "@tt/client";
import type { DragItem, DropPreview, ScheduleItem, ZoneDropData } from "./dnd";
import type { PaneId, ZoneId } from "./layout";
import { DragCard } from "./drag-card";

type DragState = { active: DragItem | null; preview: DropPreview | null };

const DragStateContext = createContext<DragState>({ active: null, preview: null });

/** What's being dragged right now and where it would land. */
export const useDragState = () => useContext(DragStateContext);

const inside = (r: DOMRect, x: number, y: number) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/**
 * The calendar day column under the pointer, if it's actually visible there: a scrolled column
 * extends past its pane (under whatever sits below it) and under the sticky day headers.
 * Hit-tested from the live DOM, since dnd-kit's `over` lags a move behind.
 */
function columnAt(x: number, y: number) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-col]")) {
    if (!inside(el.getBoundingClientRect(), x, y)) continue;
    const scroll = el.closest<HTMLElement>("[data-grid-scroll]");
    if (!scroll) continue;
    const view = scroll.getBoundingClientRect();
    const header = scroll.querySelector<HTMLElement>("[data-grid-header]")?.offsetHeight ?? 0;
    if (!inside(view, x, y) || y < view.top + header) continue;
    return { el, col: el.dataset.col!, day: el.dataset.day!, hourPx: Number(el.dataset.hourPx) };
  }
  return null;
}

// Keeps the floating card just below-right of the cursor so the drop slot stays visible.
const followCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect || !("clientX" in activatorEvent)) return transform;
  const e = activatorEvent as PointerEvent;
  return {
    ...transform,
    x: transform.x + e.clientX - draggingNodeRect.left + 14,
    y: transform.y + e.clientY - draggingNodeRect.top + 12,
  };
};

/**
 * One drag-and-drop context for the whole workspace. Drag a task or step from any pane onto a
 * calendar pane's day column to schedule it, drag a block to reschedule it (into another
 * calendar pane too), or drag a pane by its handle into a column to rearrange.
 * Drops snap to 15 minutes; blocks keep the point where they were grabbed.
 */
export function WorkspaceDnd({
  tz,
  onPaneDrop,
  children,
}: {
  tz: string;
  onPaneDrop: (pane: PaneId, zone: ZoneId) => void;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<DragItem | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  // Minutes between a dragged block's top and where the pointer grabbed it.
  const grabMin = useRef(0);
  // Live pointer position. dnd-kit's `delta` folds in scroll adjustments, so it can't be
  // used to find the pointer inside a scrolled grid.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!active) return;
    const track = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", track, { capture: true });
    return () => window.removeEventListener("pointermove", track, { capture: true });
  }, [active]);
  const createBlock = useCreateBlock();
  const moveBlock = useMoveBlock();

  // Small distance threshold so clicks (open task) still work on draggable items.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Panes drop on columns; work drops on the day column under the pointer.
  const collisionDetection: CollisionDetection = (args) => {
    const item = args.active.data.current as DragItem | undefined;
    if (item?.kind === "pane") {
      return pointerWithin({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => (c.data.current as ZoneDropData | undefined)?.kind === "zone",
        ),
      });
    }
    const hit = columnAt(pointer.current.x, pointer.current.y);
    return hit ? [{ id: hit.col }] : [];
  };

  const previewFor = (item: ScheduleItem): DropPreview | null => {
    const hit = columnAt(pointer.current.x, pointer.current.y);
    if (!hit) return null;
    const y = pointer.current.y - hit.el.getBoundingClientRect().top;
    const raw = snap((y / hit.hourPx) * 60 - grabMin.current);
    const startMin = Math.min(Math.max(raw, 0), DAY_MIN - item.minutes);
    const end = instantAt(hit.day, startMin + item.minutes, tz);
    return { col: hit.col, day: hit.day, startMin, minutes: item.minutes, past: end <= Date.now() };
  };

  const reset = () => {
    setActive(null);
    setPreview(null);
    grabMin.current = 0;
  };

  const onDragStart = (e: DragStartEvent) => {
    const item = (e.active.data.current as DragItem) ?? null;
    const a = e.activatorEvent as PointerEvent;
    pointer.current = { x: a.clientX, y: a.clientY };
    const top = e.active.rect.current.initial?.top;
    grabMin.current =
      item?.kind === "block" && top !== undefined
        ? ((a.clientY - top) / item.sourceHourPx) * 60
        : 0;
    setActive(item);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const item = e.active.data.current as DragItem | undefined;
    if (item?.kind === "pane") {
      const { x, y } = pointer.current;
      const zone = [...document.querySelectorAll<HTMLElement>("[data-zone]")].find((el) =>
        inside(el.getBoundingClientRect(), x, y),
      )?.dataset.zone as ZoneId | undefined;
      if (zone) onPaneDrop(item.paneId, zone);
      return reset();
    }
    if (!item) return reset();
    const drop = previewFor(item);
    reset();
    if (!drop || drop.past) return;
    const start = new Date(instantAt(drop.day, drop.startMin, tz)).toISOString();
    const end = new Date(instantAt(drop.day, drop.startMin + drop.minutes, tz)).toISOString();
    if (item.kind === "block") {
      moveBlock.mutate({ id: item.blockId, start, end });
    } else {
      createBlock.mutate({
        tempId: tempId(),
        body: {
          task_id: item.taskId,
          step_id: item.kind === "step" ? item.stepId : null,
          start,
          end,
        },
      });
    }
  };

  const error = createBlock.error ?? moveBlock.error;

  return (
    <DragStateContext.Provider value={{ active, preview }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={(e) => {
          const item = e.active.data.current as DragItem | undefined;
          if (!item || item.kind === "pane") return;
          const next = previewFor(item);
          setPreview((prev) =>
            prev && next && prev.col === next.col && prev.startMin === next.startMin
              ? prev
              : next,
          );
        }}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
        autoScroll={{ threshold: { x: 0.1, y: 0.15 } }}
      >
        {children}
        <DragOverlay dropAnimation={null} modifiers={[followCursor]}>
          {active && <DragCard item={active} preview={preview} tz={tz} />}
        </DragOverlay>
      </DndContext>
      {error && (
        <div
          role="alert"
          className="animate-pop-in fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-[14px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_18px_40px_rgba(21,23,43,0.3)]"
        >
          <span>Couldn&apos;t schedule that: {error.message}</span>
          <button
            onClick={() => {
              createBlock.reset();
              moveBlock.reset();
            }}
            className="rounded-lg px-2 py-1 font-bold text-white/70 hover:bg-white/10 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}
    </DragStateContext.Provider>
  );
}
