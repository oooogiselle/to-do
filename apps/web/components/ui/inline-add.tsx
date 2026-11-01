"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { parseQuickAdd } from "@tt/shared";
import { tempId, useCreateTask, useModel } from "@tt/client";

/**
 * "Add to <list>" input at the bottom of a list. Due dates and priority words are read the
 * same way as quick add ("pset fri 5pm high"); the task always lands in this list.
 */
export function InlineAdd({
  listId,
  listName,
  color,
  size = "sm",
}: {
  listId: string | null;
  listName: string;
  color: string;
  size?: "sm" | "md";
}) {
  const { lists, settings } = useModel();
  const createTask = useCreateTask();
  const [draft, setDraft] = useState("");
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const parsed = parseQuickAdd(text, { lists, now: new Date(), timezone: settings.timezone });
    createTask.mutate({
      tempId: tempId(),
      body: {
        title: parsed.title || text,
        list_id: listId,
        due_at: parsed.due_at,
        priority: parsed.priority,
      },
    });
    setDraft("");
  };
  return (
    <form
      className={`flex items-center gap-2 border-t border-[#f0f1f7] ${size === "sm" ? "px-3 py-1.5" : "px-4 py-2"}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Plus
        className={size === "sm" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
        style={{ color }}
        strokeWidth={3}
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`Add to ${listName}`}
        aria-label={`Add task to ${listName}`}
        className={`min-w-0 flex-1 bg-transparent py-1 font-medium text-ink placeholder:text-[#a5a9bd] focus:outline-none ${size === "sm" ? "text-[12px]" : "text-sm"}`}
      />
    </form>
  );
}
