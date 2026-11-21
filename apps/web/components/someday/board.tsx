"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { localDate, swatch, type Horizon, type Step } from "@tt/shared";
import { HORIZON_ORDER, isTemp, useCompletion, useModel, useUpdateTask, type SomedayItem } from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { TaskCheck } from "@/components/ui/task-check";
import { AddTodayIcon, cardFact, horizonLabel, ItemMenu, KindChip, Meta, PaneHead } from "./item-parts";

type ColumnId = `col-${Horizon | "none"}`;
const columnId = (h: Horizon | null): ColumnId => `col-${h ?? "none"}`;

/**
 * By timeframe: one pane per timeframe. Drag a card to another column to change when you mean
 * to get to it; ⋯ → Move to does the same without dragging.
 */
export function SomedayBoard({ items }: { items: SomedayItem[] }) {
  const { stepsByTask } = useModel();
  const updateTask = useUpdateTask();
  const [active, setActive] = useState<SomedayItem | null>(null);
  const [overCol, setOverCol] = useState<ColumnId | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const item = items.find((i) => i.task.id === e.active.id);
    setActive(null);
    setOverCol(null);
    const to = e.over?.data.current?.horizon as Horizon | null | undefined;
    if (!item || to === undefined || to === item.task.horizon) return;
    updateTask.mutate({ id: item.task.id, patch: { horizon: to } });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActive(items.find((i) => i.task.id === e.active.id) ?? null)}
      onDragOver={(e) => setOverCol((e.over?.id as ColumnId | undefined) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActive(null);
        setOverCol(null);
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {HORIZON_ORDER.map((h) => (
          <Column
            key={h ?? "none"}
            horizon={h}
            items={items.filter((i) => i.task.horizon === h)}
            stepsByTask={stepsByTask}
            dropHere={!!active && overCol === columnId(h) && active.task.horizon !== h}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="rotate-[-1.5deg] rounded-md bg-surface shadow-pop ring-1 ring-line">
            <CardBody item={active} steps={stepsByTask.get(active.task.id) ?? []} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  horizon,
  items,
  stepsByTask,
  dropHere,
}: {
  horizon: Horizon | null;
  items: SomedayItem[];
  stepsByTask: Map<string, Step[]>;
  dropHere: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: columnId(horizon), data: { horizon } });
  return (
    <section
      ref={setNodeRef}
      aria-label={horizonLabel(horizon)}
      className="flex min-h-40 flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-card lg:min-h-0"
    >
      <PaneHead title={horizonLabel(horizon)} count={items.filter((i) => i.task.status === "open").length} />
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {items.map((item) => (
          <Card key={item.task.id} item={item} steps={stepsByTask.get(item.task.id) ?? []} />
        ))}
        {dropHere && <li aria-hidden className="mx-0.5 h-0.5 rounded-full bg-grape" />}
        {items.length === 0 && !dropHere && <li className="px-2.5 py-2 text-[11px] text-faint">Nothing here yet</li>}
      </ul>
    </section>
  );
}

function Card({ item, steps }: { item: SomedayItem; steps: Step[] }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: item.task.id,
    disabled: isTemp(item.task.id),
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="listitem"
      aria-roledescription="Draggable card"
      className={`group relative cursor-grab touch-manipulation rounded-md bg-row transition-colors select-none hover:bg-row-hover active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <CardBody item={item} steps={steps} />
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 rounded-md bg-row-hover opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 no-hover:opacity-100">
        <AddTodayIcon task={item.task} steps={steps} />
        <ItemMenu item={item} />
      </div>
    </li>
  );
}

/** A card's contents: check 14, title 12/500, the kind chip and one fact (My day list-pane row). */
function CardBody({ item, steps }: { item: SomedayItem; steps: Step[] }) {
  const { task, list } = item;
  const { settings } = useModel();
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const today = localDate(new Date(), settings.timezone);
  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2.5 px-2.5 py-2">
      <span className="pt-0.5">
        <TaskCheck
          size={14}
          done={done}
          color={swatch(task.color ?? list.color).solid}
          onToggle={() => setTaskDone(task.id, !done)}
          label={task.title}
          disabled={isTemp(task.id)}
        />
      </span>
      <span className="min-w-0">
        <button
          type="button"
          onClick={() => !isTemp(task.id) && openTask(task.id)}
          className={`block text-left text-[12px] leading-snug font-medium focus-visible:underline ${done ? "text-faint line-through" : "text-ink"}`}
        >
          {task.title}
        </button>
        <Meta parts={[<KindChip key="k" kind={task.idea_kind} />, cardFact(item, steps, today)]} />
      </span>
    </div>
  );
}
