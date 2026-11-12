"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import type { z } from "zod";
import { parseQuickAdd, type TaskCreate } from "@tt/shared";
import { useModel } from "@tt/client";
import { DuePicker } from "@/components/due-picker";
import { ListPicker } from "@/components/list-picker";

type Body = z.infer<typeof TaskCreate>;
type Parsed = ReturnType<typeof parseQuickAdd>;

const label = "mb-1.5 block text-[11px] font-bold tracking-wider text-muted uppercase";

/**
 * Opens when a to-do is typed into My day: the typed text is parsed once to prefill the title,
 * list and due date, which can then be changed before the to-do is added.
 */
export function PlanAddModal({
  initial,
  dayLabel,
  onClose,
  onAdd,
}: {
  /** The typed text; null when closed. */
  initial: string | null;
  /** "My day" or "this day", for the add button. */
  dayLabel: string;
  onClose: () => void;
  onAdd: (body: Body) => void;
}) {
  const { lists, listById, settings } = useModel();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial === null) return;
    const p = parseQuickAdd(initial, { lists, now: new Date(), timezone: settings.timezone });
    setParsed(p);
    setTitle(p.title || initial.trim());
    setDueAt(p.due_at);
    setListId(p.list_id);
    requestAnimationFrame(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    // Parse only when the modal opens; later list or settings changes shouldn't reset edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (initial === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [initial, onClose]);

  if (initial === null || !parsed) return null;

  const canAdd = title.trim().length > 0;
  const add = () => {
    if (!canAdd) return;
    onAdd({
      ...parsed,
      title: title.trim(),
      due_at: dueAt,
      list_id: listId && listById.has(listId) ? listId : null,
    });
    onClose();
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Add a to-do to ${dayLabel}`}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="animate-pop-in w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-sheet"
      >
        <div className="flex h-1.5" aria-hidden>
          <span className="flex-1 bg-coral" />
          <span className="flex-1 bg-sun" />
          <span className="flex-1 bg-mint" />
          <span className="flex-1 bg-sky" />
          <span className="flex-1 bg-grape" />
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="plan-add-title" className="sr-only">
              Title
            </label>
            <input
              id="plan-add-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="To-do"
              autoComplete="off"
              className="block w-full bg-transparent text-xl font-bold text-ink outline-none placeholder:font-semibold placeholder:text-faint focus-visible:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>List</span>
              <ListPicker
                value={listId && listById.has(listId) ? listId : null}
                onChange={setListId}
                lists={lists}
                className="w-full rounded-xl px-3 py-2 text-left text-sm"
              />
            </div>
            <div>
              <span className={label}>Due</span>
              <DuePicker
                value={dueAt}
                onChange={setDueAt}
                tz={settings.timezone}
                className="w-full rounded-xl px-3 py-2 text-left text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-row px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canAdd}
            className="flex items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            Add to {dayLabel}
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
