"use client";

import { Fragment, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { PaneFrame } from "./pane-frame";
import { Splitter } from "./splitter";
import { useDragState } from "./workspace-dnd";
import type { ZoneDropData } from "./dnd";
import type { PaneId } from "./layout";

/** A side column of stacked panes, resizable between them; a drop target for moving panes. */
export function PaneColumn(props: {
  zone: "left" | "right";
  panes: PaneId[];
  width: number;
  weights: Record<string, number>;
  now: number;
  onResizeStack: (index: number, deltaPx: number, totalPx: number) => void;
  onClose: (pane: PaneId) => void;
}) {
  const { zone, panes, width, weights } = props;
  const { active } = useDragState();
  const stackRef = useRef<HTMLDivElement>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zone}`,
    data: { kind: "zone", zone } satisfies ZoneDropData,
  });
  const draggingPane = active?.kind === "pane";

  if (panes.length === 0 && !draggingPane) return null;

  return (
    <div
      ref={setNodeRef}
      data-zone={zone}
      style={{ "--col-w": `${panes.length ? width : 150}px` } as React.CSSProperties}
      className={`relative flex w-full shrink-0 flex-col rounded-[15px] transition-colors lg:h-auto lg:w-[var(--col-w)] ${
        panes.length > 1 ? "h-auto" : "h-[440px]"
      } ${draggingPane ? (isOver ? "bg-[#e9e5f7] ring-2 ring-grape" : "bg-line-soft") : ""}`}
    >
      {panes.length === 0 ? (
        <div className="grid min-h-24 flex-1 place-items-center rounded-[13px] border-2 border-dashed border-line-strong p-3 text-center text-[11px] font-bold text-[#8a8fa6]">
          Drop pane here
        </div>
      ) : (
        <div ref={stackRef} className="flex min-h-0 flex-1 flex-col gap-2.5 lg:gap-0">
          {panes.map((pane, i) => (
            <Fragment key={pane}>
              {i > 0 && (
                <Splitter
                  orientation="horizontal"
                  label="Resize panes"
                  onResize={(d) => props.onResizeStack(i - 1, d, stackRef.current?.clientHeight ?? 1)}
                />
              )}
              <div
                className="flex h-[440px] min-h-0 lg:h-auto"
                style={{ flex: `${weights[pane] ?? 1} 1 0%` }}
              >
                <PaneFrame pane={pane} now={props.now} onClose={() => props.onClose(pane)} />
              </div>
            </Fragment>
          ))}
        </div>
      )}
      {draggingPane && panes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-ink/85 py-1.5 text-center text-[11px] font-bold text-white">
          Drop to add here
        </div>
      )}
    </div>
  );
}
