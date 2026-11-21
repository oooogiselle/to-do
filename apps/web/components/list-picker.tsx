"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { List } from "@tt/shared";
import { PALETTE, tempId, useCreateList } from "@tt/client";

/**
 * Button showing the list that opens a small menu of lists, styled to match DuePicker. The menu
 * ends with "New list", which creates a list and picks it.
 */
export function ListPicker({
  value,
  onChange,
  lists,
  emptyLabel = "Add list",
  className = "",
}: {
  value: string | null;
  onChange: (listId: string | null) => void;
  lists: List[];
  /** Button text when no list is picked. */
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // null: showing the "New list" row; a string: typing a new list's name.
  const [draft, setDraft] = useState<string | null>(null);
  const createList = useCreateList();
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
      setDraft(null);
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

  // Wait for the server's id before picking it, so a task never points at a temp list.
  const create = async () => {
    const name = draft?.trim();
    if (!name || createList.isPending) return;
    try {
      const list = await createList.mutateAsync({
        tempId: tempId(),
        body: {
          name,
          color: PALETTE[lists.length % PALETTE.length]!,
          sort_order: lists.length,
          kind: "normal",
        },
      });
      pick(list.id);
    } catch {
      // The optimistic row is rolled back; leave the name in the input to try again.
    }
  };

  const option = (id: string | null, name: string, color?: string) => (
    <li key={id ?? "none"}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={value === id}
        onClick={() => pick(id)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium hover:bg-paper ${value === id ? "text-ink" : "text-chip-ink"}`}
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
          if (draft !== null) setDraft(null);
          else setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-medium ${current ? "border-line bg-surface text-ink" : "border-dashed border-line-strong text-muted"} hover:border-ink ${className}`}
      >
        {current && (
          <span className="size-2 rounded-sm" style={{ background: current.color }} aria-hidden />
        )}
        {current ? current.name : emptyLabel}
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
          <li role="separator" className="mx-2 my-1 border-t border-line-soft" />
          <li>
            {draft === null ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => setDraft("")}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-chip-ink hover:bg-paper"
              >
                <Plus className="size-3 shrink-0" strokeWidth={3} aria-hidden />
                New list
              </button>
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // Inside quick add's form, Enter would otherwise add the task.
                    e.preventDefault();
                    e.stopPropagation();
                    void create();
                  }
                }}
                onBlur={() => !draft.trim() && setDraft(null)}
                disabled={createList.isPending}
                placeholder="List name"
                aria-label="New list name"
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] font-medium text-ink outline-none placeholder:font-medium placeholder:text-faint focus:border-sky disabled:opacity-60"
              />
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
