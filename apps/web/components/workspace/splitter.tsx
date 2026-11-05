"use client";

import { useRef, useState } from "react";

/** A drag handle between panes; arrow keys nudge it 16px. */
export function Splitter({
  orientation,
  label,
  onResize,
}: {
  orientation: "vertical" | "horizontal";
  label: string;
  onResize: (delta: number) => void;
}) {
  const last = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const vertical = orientation === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = vertical ? e.clientX : e.clientY;
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const pos = vertical ? e.clientX : e.clientY;
        const delta = pos - last.current;
        if (delta) {
          onResize(delta);
          last.current = pos;
        }
      }}
      onPointerUp={(e) => {
        last.current = null;
        setActive(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const fwd = vertical ? "ArrowRight" : "ArrowDown";
        if (e.key === back || e.key === fwd) {
          e.preventDefault();
          e.stopPropagation();
          onResize(e.key === back ? -16 : 16);
        }
      }}
      className={`group shrink-0 touch-none items-center justify-center select-none focus:outline-none ${
        vertical ? "hidden w-2.5 cursor-col-resize lg:flex" : "hidden h-3.5 cursor-row-resize lg:flex"
      }`}
    >
      <div
        className={`flex gap-[3px] rounded-full p-1 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-grape ${
          vertical ? "flex-col" : ""
        } ${active ? "bg-[#e4dff5]" : "group-hover:bg-chip"}`}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 w-1 rounded-full ${active ? "bg-grape" : "bg-line-strong"}`} />
        ))}
      </div>
    </div>
  );
}
