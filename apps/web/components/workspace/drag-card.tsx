"use client";

import { GripVertical, PanelsTopLeft } from "lucide-react";
import { formatMinutes, swatch } from "@tt/shared";
import { fmtDay, fmtTime, instantAt } from "@tt/client";
import type { DragItem, DropPreview } from "./dnd";

/** The card that follows the cursor while dragging, saying where the drop would land. */
export function DragCard({
  item,
  preview,
  tz,
}: {
  item: DragItem;
  preview: DropPreview | null;
  tz: string;
}) {
  if (item.kind === "pane") {
    return (
      <div className="inline-flex -rotate-2 items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12px] font-bold whitespace-nowrap text-white shadow-sheet">
        <PanelsTopLeft className="h-4 w-4" />
        {item.label}
        <span className="font-semibold text-white/50">· drop on a column</span>
      </div>
    );
  }

  const c = swatch(item.color);
  const start = preview ? instantAt(preview.day, preview.startMin, tz) : null;
  const end = preview ? instantAt(preview.day, preview.startMin + preview.minutes, tz) : null;
  const late = end !== null && !!item.dueAt && end > Date.parse(item.dueAt);

  return (
    <div
      className="relative w-[220px] -rotate-2 cursor-grabbing rounded-xl bg-surface py-2 pr-3 pl-3 shadow-sheet"
      style={{ borderLeft: `5px solid ${c.solid}` }}
    >
      <GripVertical className="absolute top-2 right-2 h-3.5 w-3.5 text-line-strong" />
      <p className="pr-4 text-[12px] leading-snug font-extrabold text-ink">{item.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {item.listName && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: c.tint, color: c.ink }}
          >
            {item.listName}
          </span>
        )}
        <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
          {formatMinutes(item.minutes)}
        </span>
      </div>
      <p
        className={`mt-1.5 text-[11px] font-extrabold ${
          preview?.past || late ? "text-risk" : preview ? "text-grape-ink" : "text-faint"
        }`}
      >
        {!preview || start === null || end === null
          ? "Drop on a calendar to schedule"
          : preview.past
            ? "That time has passed"
            : `→ ${fmtDay(preview.day, tz).split(",")[0]} ${fmtTime(start, tz)} – ${fmtTime(end, tz)}${late ? " · after due" : ""}`}
      </p>
    </div>
  );
}
