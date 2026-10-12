"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseQuickAdd, type Priority } from "@tt/shared";
import { useCreateTask, useModel } from "@/lib/client/data";
import { fmtDue } from "@/lib/client/time";

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "",
  low: "Low",
  med: "Medium",
  high: "High",
};

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parsed = useMemo(
    () =>
      text.trim()
        ? parseQuickAdd(text, { lists, now: new Date(), timezone: settings.timezone })
        : null,
    [text, lists, settings.timezone],
  );

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    createTask.mutate({ tempId: `temp-${crypto.randomUUID()}`, body: parsed });
    onClose();
  };

  const list = parsed?.list_id ? listById.get(parsed.list_id) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl"
      >
        <label htmlFor="quick-add" className="sr-only">
          New task
        </label>
        <input
          id="quick-add"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="cs61 lab report fri 11pm high"
          autoComplete="off"
          className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-muted/70"
        />
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-muted">
          {parsed ? (
            <>
              <span className="font-medium text-ink">{parsed.title}</span>
              {list && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: list.color }} />
                  {list.name}
                </span>
              )}
              {parsed.due_at && <span>Due {fmtDue(parsed.due_at, settings.timezone)}</span>}
              {parsed.priority !== "none" && (
                <span>{PRIORITY_LABEL[parsed.priority]} priority</span>
              )}
              <span className="ml-auto text-xs">Enter to add</span>
            </>
          ) : (
            <span>Type a task. Add a list, a due date and a priority to set them.</span>
          )}
        </div>
      </form>
    </div>
  );
}
