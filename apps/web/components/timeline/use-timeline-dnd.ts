"use client";

import { useEffect, useRef, useState } from "react";
import {
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { tempId, useCreateBlock, useMoveBlock } from "@/lib/client/data";
import type { DragItem, DropPreview } from "./dnd";
import { DAY_MIN, HOUR_PX, instantAt, snap } from "./geometry";

/**
 * Drag tasks/steps from the Due rail onto a day column to schedule them, or drag an existing
 * block to reschedule it. Drops snap to 15 minutes; blocks keep the point where you grabbed them.
 */
export function useTimelineDnd(tz: string) {
  const [active, setActive] = useState<DragItem | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  // Minutes between a dragged block's top and where the pointer grabbed it.
  const grabMin = useRef(0);
  // Live pointer position. dnd-kit's `delta` folds in scroll adjustments, so it can't be
  // used to find the pointer inside the scrolled grid.
  const pointer = useRef(0);
  useEffect(() => {
    if (!active) return;
    const track = (e: PointerEvent) => (pointer.current = e.clientY);
    window.addEventListener("pointermove", track, { capture: true });
    return () => window.removeEventListener("pointermove", track, { capture: true });
  }, [active]);
  const createBlock = useCreateBlock();
  const moveBlock = useMoveBlock();

  // Small distance threshold so clicks (open task) still work on draggable items.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const previewFor = (e: DragMoveEvent | DragEndEvent): DropPreview | null => {
    const item = e.active.data.current as DragItem | undefined;
    const day = e.over?.id as string | undefined;
    if (!item || !day) return null;
    const column = document.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!column) return null;
    const y = pointer.current - column.getBoundingClientRect().top;
    const grab = item.kind === "block" ? grabMin.current : 0;
    const raw = snap((y / HOUR_PX) * 60 - grab);
    const startMin = Math.min(Math.max(raw, 0), DAY_MIN - item.minutes);
    const end = instantAt(day, startMin + item.minutes, tz);
    return { day, startMin, minutes: item.minutes, past: end <= Date.now() };
  };

  return {
    sensors,
    active,
    preview,
    collisionDetection: pointerWithin,
    onDragStart: (e: DragStartEvent) => {
      const item = (e.active.data.current as DragItem) ?? null;
      pointer.current = (e.activatorEvent as PointerEvent).clientY;
      const top = e.active.rect.current.initial?.top;
      grabMin.current =
        item?.kind === "block" && top !== undefined
          ? (((e.activatorEvent as PointerEvent).clientY - top) / HOUR_PX) * 60
          : 0;
      setActive(item);
    },
    onDragMove: (e: DragMoveEvent) => setPreview(previewFor(e)),
    onDragCancel: () => {
      setActive(null);
      setPreview(null);
    },
    onDragEnd: (e: DragEndEvent) => {
      const item = e.active.data.current as DragItem | undefined;
      const drop = previewFor(e);
      setActive(null);
      setPreview(null);
      if (!item || !drop || drop.past) return;
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
    },
    error: createBlock.error ?? moveBlock.error,
    resetError: () => {
      createBlock.reset();
      moveBlock.reset();
    },
  };
}
