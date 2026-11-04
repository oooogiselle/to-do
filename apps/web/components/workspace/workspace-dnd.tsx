"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { isRecurring } from "@tt/shared";
import {
  DAY_MIN,
  instantAt,
  positionBetween,
  snap,
  tempId,
  useAddToPlan,
  useCreateBlock,
  useModel,
  useMovePlanItem,
  useMoveBlock,
} from "@tt/client";
import type { DragItem, DropPreview, PlanTarget, ScheduleItem, ZoneDropData } from "./dnd";
import type { PaneId, ZoneId } from "./layout";
import { DragCard } from "./drag-card";

type DragState = {
  active: DragItem | null;
  preview: DropPreview | null;
  /** Where a to-do would land in the day plan, while it's dragged over it. */
  planTarget: PlanTarget | null;
};

const DragStateContext = createContext<DragState>({
  active: null,
  preview: null,
  planTarget: null,
});

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

/**
 * The day plan under the pointer, and the index a dropped to-do would take: after every item
 * whose middle is above the pointer. The dragged item itself doesn't count.
 */
function planAt(x: number, y: number, dragging?: string): PlanTarget | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-plan-zone]")) {
    if (!inside(el.getBoundingClientRect(), x, y)) continue;
    const items = [...el.querySelectorAll<HTMLElement>("[data-plan-item]")].filter(
      (i) => i.dataset.planItem !== dragging,
    );
    const index = items.filter((i) => {
      const r = i.getBoundingClientRect();
      return y > r.top + r.height / 2;
    }).length;
    return { date: el.dataset.planZone!, index };
  }
  return null;
}

/** Where a mouse, pointer or touch event happened. */
function pointOf(e: Event): { x: number; y: number } | null {
  if ("touches" in e) {
    const t = (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  return "clientX" in e ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY } : null;
}

// Keeps the floating card just below-right of the cursor so the drop slot stays visible.
const followCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const p = activatorEvent && pointOf(activatorEvent);
  if (!p || !draggingNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + p.x - draggingNodeRect.left + 14,
    y: transform.y + p.y - draggingNodeRect.top + 12,
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
  const [planTarget, setPlanTarget] = useState<PlanTarget | null>(null);
  // Minutes between a dragged block's top and where the pointer grabbed it.
  const grabMin = useRef(0);
  // Live pointer position. dnd-kit's `delta` folds in scroll adjustments, so it can't be
  // used to find the pointer inside a scrolled grid.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!active) return;
    const track = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    // A touch drag stops sending pointer events once the browser takes over the gesture.
    const trackTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pointer.current = { x: t.clientX, y: t.clientY };
    };
    window.addEventListener("pointermove", track, { capture: true });
    window.addEventListener("touchmove", trackTouch, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", track, { capture: true });
      window.removeEventListener("touchmove", trackTouch, { capture: true });
    };
  }, [active]);
  const createBlock = useCreateBlock();
  const moveBlock = useMoveBlock();
  const addToPlan = useAddToPlan();
  const movePlanItem = useMovePlanItem();
  const { taskById, planByDate } = useModel();

  // Mouse: a small distance threshold so clicks (open task) still work on draggable items.
  // Touch: press and hold to pick an item up, so swiping over it still scrolls the list.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

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

  /** The plan target for a dragged to-do, if it's over a plan. Routines can't be planned. */
  const planTargetFor = (item: DragItem): PlanTarget | null => {
    if (item.kind !== "task") return null;
    const task = taskById.get(item.taskId);
    if (!task || isRecurring(task)) return null;
    return planAt(pointer.current.x, pointer.current.y, item.planItemId);
  };

  const dropOnPlan = (item: Extract<DragItem, { kind: "task" }>, target: PlanTarget) => {
    const others = (planByDate.get(target.date) ?? []).filter((i) => i.id !== item.planItemId);
    // A task is on a day once: dropping it again moves the existing item.
    const existing = item.planItemId
      ? { id: item.planItemId }
      : others.find((i) => i.task_id === item.taskId);
    const rest = others.filter((i) => i.id !== existing?.id);
    const position = positionBetween(
      rest[target.index - 1]?.position,
      rest[target.index]?.position,
    );
    if (existing) {
      movePlanItem.mutate({ id: existing.id, patch: { plan_date: target.date, position } });
    } else {
      addToPlan.mutate({
        tempId: tempId(),
        body: { task_id: item.taskId, plan_date: target.date, position },
      });
    }
  };

  const reset = () => {
    setActive(null);
    setPreview(null);
    setPlanTarget(null);
    grabMin.current = 0;
  };

  const onDragStart = (e: DragStartEvent) => {
    const item = (e.active.data.current as DragItem) ?? null;
    const a = pointOf(e.activatorEvent) ?? pointer.current;
    pointer.current = a;
    const top = e.active.rect.current.initial?.top;
    grabMin.current =
      item?.kind === "block" && top !== undefined
        ? ((a.y - top) / item.sourceHourPx) * 60
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
    const toPlan = planTargetFor(item);
    if (toPlan && item.kind === "task") {
      reset();
      return dropOnPlan(item, toPlan);
    }
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

  const error = createBlock.error ?? moveBlock.error ?? addToPlan.error ?? movePlanItem.error;

  return (
    <DragStateContext.Provider value={{ active, preview, planTarget }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={(e) => {
          const item = e.active.data.current as DragItem | undefined;
          if (!item || item.kind === "pane") return;
          const nextPlan = planTargetFor(item);
          setPlanTarget((prev) =>
            prev?.date === nextPlan?.date && prev?.index === nextPlan?.index ? prev : nextPlan,
          );
          const next = nextPlan ? null : previewFor(item);
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
          className="animate-pop-in fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-sheet"
        >
          <span>Couldn&apos;t do that: {error.message}</span>
          <button
            onClick={() => {
              createBlock.reset();
              moveBlock.reset();
              addToPlan.reset();
              movePlanItem.reset();
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
