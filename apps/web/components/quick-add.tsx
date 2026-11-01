"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { parseQuickAdd, type Priority } from "@tt/shared";
import { setNotice, tempId, useCreateTask, useModel } from "@tt/client";
import { PREFILL_KEY } from "@/components/import/import-view";
import { DuePicker } from "@/components/due-picker";
import { ListPicker } from "@/components/list-picker";

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "",
  low: "Low",
  med: "Medium",
  high: "High",
};

const PRIORITY_STYLE: Record<Exclude<Priority, "none">, { bg: string; fg: string }> = {
  high: { bg: "#f9ece7", fg: "#a04b35" },
  med: { bg: "#faf3df", fg: "#7a5e1e" },
  low: { bg: "#e7eef8", fg: "#2e4f80" },
};

// Long text, several lines, or a comma/semicolon-separated list is probably several tasks:
// suggest AI extraction ("cs61 lab fri, email prof, buy poster board").
const LONG_TEXT = 200;
const looksLikeSeveral = (t: string) =>
  t.includes("\n") || t.length > LONG_TEXT || (t.match(/[,;]/g)?.length ?? 0) >= 2;

/** A picker's choice and the typed value it replaced. */
type Picked = { value: string | null; over: string | null };
const resolve = (picked: Picked | null, typed: string | null) =>
  picked && picked.over === typed ? picked.value : typed;

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const router = useRouter();
  const [text, setText] = useState("");
  // A date or list chosen in a picker overrides the one typed in the text, until the typed
  // one changes: whichever was set last wins.
  const [pickedDue, setPickedDue] = useState<Picked | null>(null);
  const [pickedList, setPickedList] = useState<Picked | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setPickedDue(null);
    setPickedList(null);
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

  const typedDue = parsed?.due_at ?? null;
  const dueAt = resolve(pickedDue, typedDue);
  const duePicker = (
    <DuePicker
      value={dueAt}
      onChange={(v) => {
        setPickedDue({ value: v, over: typedDue });
        inputRef.current?.focus();
      }}
      tz={settings.timezone}
      className="text-sm"
    />
  );

  const typedList = parsed?.list_id ?? null;
  const listId = resolve(pickedList, typedList);
  const listPicker = (
    <ListPicker
      value={listId && listById.has(listId) ? listId : null}
      onChange={(v) => {
        setPickedList({ value: v, over: typedList });
        inputRef.current?.focus();
      }}
      lists={lists}
      className="text-sm"
    />
  );

  const addInstantly = () => {
    if (!parsed) return;
    const listName = (listId && listById.get(listId)?.name) || undefined;
    createTask.mutate(
      { tempId: tempId(), body: { ...parsed, due_at: dueAt, list_id: listId } },
      {
        onSuccess: (task) =>
          setNotice({ kind: "added", taskId: task.id, label: task.title, listName }),
      },
    );
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

  const priority = parsed?.priority ?? "none";
  const listHints = lists.map((l) => `#${l.name.toLowerCase().replace(/\s+/g, "")}`).join(", ");

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a task"
        className="animate-pop-in w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-[0_24px_60px_rgba(21,23,43,0.3)]"
      >
        <div className="flex h-1.5" aria-hidden>
          <span className="flex-1 bg-coral" />
          <span className="flex-1 bg-sun" />
          <span className="flex-1 bg-mint" />
          <span className="flex-1 bg-sky" />
          <span className="flex-1 bg-grape" />
        </div>
        <div className="p-4">
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
            className="block w-full resize-none bg-transparent text-xl font-bold text-ink outline-none placeholder:font-semibold placeholder:text-[#b5b9cb]"
          />
          <div className="mt-3 flex min-h-[30px] flex-wrap items-center gap-1.5 text-[13px]">
            {long ? (
              <>
                <span className="font-semibold text-muted">Looks like more than one task.</span>
                <button
                  onClick={extractWithAi}
                  className="flex items-center gap-1.5 rounded-lg bg-sun px-2.5 py-1 font-extrabold text-[#4a3a12] hover:bg-[#d9ae48]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Find tasks with AI
                </button>
              </>
            ) : (
              <>
                {listPicker}
                {duePicker}
                {priority !== "none" && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: PRIORITY_STYLE[priority].bg, color: PRIORITY_STYLE[priority].fg }}
                  >
                    {PRIORITY_LABEL[priority]} priority
                  </span>
                )}
                {!parsed && (
                  <span className="text-[13px] text-[#8a8fa6]">
                    Type a task. Add a list, a due date and a priority to set them.
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line bg-[#f7f8fb] px-4 py-2.5 text-[12px] font-semibold text-[#7a7f96]">
          <span className="hidden min-w-0 truncate sm:inline">
            {long ? "⌘Enter or Enter to split with AI" : lists.length ? `Lists: ${listHints}` : "Enter to add, ⌘Enter to split with AI"}
          </span>
          {!long && (
            <button
              type="button"
              onClick={addInstantly}
              disabled={!parsed}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              Add task
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
