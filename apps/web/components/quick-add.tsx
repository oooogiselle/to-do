"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseQuickAdd, type Priority } from "@tt/shared";
import { useCreateTask, useModel } from "@/lib/client/data";
import { fmtDue } from "@/lib/client/time";
import { PREFILL_KEY } from "@/components/import/import-view";

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "",
  low: "Low",
  med: "Medium",
  high: "High",
};

// Long text, several lines, or a comma/semicolon-separated list is probably several tasks:
// suggest AI extraction ("cs61 lab fri, email prof, buy poster board").
const LONG_TEXT = 200;
const looksLikeSeveral = (t: string) =>
  t.includes("\n") || t.length > LONG_TEXT || (t.match(/[,;]/g)?.length ?? 0) >= 2;

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text, open]);

  const long = looksLikeSeveral(text.trim());
  const parsed = useMemo(
    () =>
      text.trim() && !long
        ? parseQuickAdd(text, { lists, now: new Date(), timezone: settings.timezone })
        : null,
    [text, long, lists, settings.timezone],
  );

  if (!open) return null;

  const addInstantly = () => {
    if (!parsed) return;
    createTask.mutate({ tempId: `temp-${crypto.randomUUID()}`, body: parsed });
    onClose();
  };

  const extractWithAi = () => {
    if (!text.trim()) return;
    try {
      sessionStorage.setItem(PREFILL_KEY, text);
    } catch {}
    onClose();
    router.push("/import");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey || long) extractWithAi();
    else addInstantly();
  };

  const list = parsed?.list_id ? listById.get(parsed.list_id) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl">
        <label htmlFor="quick-add" className="sr-only">
          New task
        </label>
        <textarea
          id="quick-add"
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="cs61 lab report fri 11pm high"
          autoComplete="off"
          className="block w-full resize-none bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-muted/70"
        />
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-muted">
          {long ? (
            <>
              <span>Looks like more than one task.</span>
              <button
                onClick={extractWithAi}
                className="ml-auto rounded-md bg-ink px-2.5 py-1 text-paper hover:opacity-90"
              >
                Find tasks with AI
              </button>
              <span className="text-xs">Enter</span>
            </>
          ) : parsed ? (
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
              <span className="ml-auto text-xs">Enter to add, ⌘Enter to split with AI</span>
            </>
          ) : (
            <span>Type a task. Add a list, a due date and a priority to set them.</span>
          )}
        </div>
      </div>
    </div>
  );
}
