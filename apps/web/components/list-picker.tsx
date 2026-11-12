"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const current = lists.find((l) => l.id === value) ?? null;

  // The menu is fixed-position, like DuePicker's, so containers with overflow hidden (the
  // My day add modal, quick add) can't clip it. Pin it to the button: below if it fits, else
  // above, and kept inside the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!b) return;
      const w = pop?.offsetWidth ?? 192;
      const h = pop?.offsetHeight ?? 256;
      const gap = 4;
      const margin = 8;
      const below = window.innerHeight - b.bottom - gap - margin;
      const above = b.top - gap - margin;
      const top =
        h <= below || below >= above
          ? Math.min(b.bottom + gap, window.innerHeight - h - margin)
          : Math.max(b.top - gap - h, margin);
      const left = Math.min(Math.max(b.left, margin), window.innerWidth - w - margin);
      setPos({ top: Math.max(top, margin), left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

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
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-bold hover:bg-paper ${value === id ? "text-ink" : "text-chip-ink"}`}
      >
        <span
          className={`size-2 shrink-0 rounded-sm ${color ? "" : "border border-line-strong"}`}
          style={color ? { background: color } : undefined}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {value === id && <Check className="h-3.5 w-3.5 text-grape-ink" strokeWidth={3} aria-hidden />}
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
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-semibold ${current ? "border-line bg-surface text-ink" : "border-dashed border-line-strong text-muted"} hover:border-ink ${className}`}
      >
        {current && (
          <span className="size-2 rounded-sm" style={{ background: current.color }} aria-hidden />
        )}
        {current ? current.name : "Add list"}
      </button>
      {open && (
        <ul
          ref={popRef}
          role="menu"
          aria-label="List"
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
          className="animate-pop-in fixed z-[60] max-h-64 w-48 overflow-y-auto rounded-2xl border border-line-soft bg-surface p-1.5 text-ink shadow-pop"
        >
          {lists.map((l) => option(l.id, l.name, l.color))}
          {option(null, "No list")}
        </ul>
      )}
    </div>
  );
}
