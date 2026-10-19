"use client";

import { useEffect, useRef, useState } from "react";
import type { List } from "@tt/shared";

/** Button showing the list that opens a small menu of lists, styled to match DuePicker. */
export function ListPicker({
  value,
  onChange,
  lists,
  className = "",
}: {
  value: string | null;
  onChange: (listId: string | null) => void;
  lists: List[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = lists.find((l) => l.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      rootRef.current && !rootRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (id: string | null) => {
    setOpen(false);
    onChange(id);
  };

  const option = (id: string | null, name: string, color?: string) => (
    <li key={id ?? "none"}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={value === id}
        onClick={() => pick(id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-paper ${value === id ? "font-medium" : ""}`}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${color ? "" : "border border-line-strong"}`}
          style={color ? { background: color } : undefined}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {value === id && <span aria-hidden>✓</span>}
      </button>
    </li>
  );

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${current ? "border-line-strong text-ink" : "border-dashed border-line-strong text-muted"} hover:border-ink ${className}`}
      >
        {current && (
          <span className="size-2 rounded-full" style={{ background: current.color }} aria-hidden />
        )}
        {current ? current.name : "Add list"}
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="List"
          className="absolute top-full left-0 z-50 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-line-strong bg-surface p-1 text-ink shadow-xl"
        >
          {lists.map((l) => option(l.id, l.name, l.color))}
          {option(null, "No list")}
        </ul>
      )}
    </div>
  );
}
