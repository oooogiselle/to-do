"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, X } from "lucide-react";
import { useModel } from "@tt/client";
import { AddPaneMenu } from "./add-pane-menu";
import { PaneContent } from "./pane-content";
import { usePaneLabel } from "./calendar-dates";
import { paneColor, type PaneId } from "./layout";
import { useDragState } from "./workspace-dnd";
import type { DragItem, ZoneDropData } from "./dnd";

/** The middle of the workspace: panes as tabs, one showing at a time. */
export function CenterTabs(props: {
  panes: PaneId[];
  active: PaneId | null;
  hidden: PaneId[];
  now: number;
  onSelect: (pane: PaneId) => void;
  onClose: (pane: PaneId) => void;
  onOpen: (pane: PaneId) => void;
}) {
  const { panes, active, hidden } = props;
  const { lists } = useModel();
  const label = usePaneLabel(props.now);
  const drag = useDragState();
  const { setNodeRef, isOver } = useDroppable({
    id: "zone-center",
    data: { kind: "zone", zone: "center" } satisfies ZoneDropData,
  });
  const draggingPane = drag.active?.kind === "pane";
  const current = active && panes.includes(active) ? active : (panes[0] ?? null);

  return (
    <div
      ref={setNodeRef}
      data-zone="center"
      className={`flex h-[640px] min-w-0 flex-1 flex-col rounded-[15px] transition-colors max-lg:order-first lg:h-auto ${
        draggingPane && isOver ? "bg-[#e9e5f7] ring-2 ring-grape" : ""
      }`}
    >
      <div
        role="tablist"
        aria-label="Center panes"
        className="relative z-10 -mb-px flex shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden px-2 pt-1"
      >
        {panes.map((p) => (
          <DraggableTab
            key={p}
            pane={p}
            label={label(p)}
            color={paneColor(p, lists)}
            active={p === current}
            onSelect={() => props.onSelect(p)}
            onClose={() => props.onClose(p)}
          />
        ))}
        <div className="pb-1">
          <AddPaneMenu hidden={hidden} onOpen={props.onOpen} />
        </div>
      </div>
      <div
        role="tabpanel"
        className={`relative min-h-0 flex-1 overflow-hidden rounded-[13px] border border-line bg-surface ${
          current === panes[0] ? "rounded-tl-none" : ""
        }`}
      >
        {current ? (
          <PaneContent key={current} pane={current} now={props.now} />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="text-sm font-extrabold text-ink">No pane open here</p>
              <p className="mt-1 text-[12px] text-[#7d8099]">
                Drag a pane in by its handle, or open one with +.
              </p>
            </div>
          </div>
        )}
        {draggingPane && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-ink/85 px-3 py-1.5 text-[11px] font-bold text-white">
            Drop to open as a tab
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableTab(props: {
  pane: PaneId;
  label: string;
  color: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `pane-${props.pane}`,
    data: { kind: "pane", paneId: props.pane, label: props.label } satisfies DragItem,
  });
  return (
    <div
      ref={setNodeRef}
      className={`group relative flex shrink-0 items-center rounded-t-[10px] border border-b-0 transition-colors ${
        props.active
          ? "border-line bg-surface text-ink"
          : "border-transparent text-[#7d8099] hover:bg-white/60 hover:text-ink"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.active}
        {...listeners}
        onClick={props.onSelect}
        className="flex cursor-grab touch-none items-center gap-1.5 py-2 pr-1 pl-2 text-[12px] font-extrabold active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3 opacity-40" aria-hidden />
        <span className="h-2 w-2 rounded-[3px]" style={{ background: props.color }} />
        {props.label}
      </button>
      <button
        type="button"
        onClick={props.onClose}
        aria-label={`Close ${props.label}`}
        className={`mr-1 grid h-5 w-5 place-items-center rounded text-[#a0a3b5] hover:bg-[#f0f1f7] hover:text-ink ${
          props.active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
