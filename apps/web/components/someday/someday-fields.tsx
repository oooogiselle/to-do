"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { normalizeLink, type Horizon, type IdeaKind, type Task } from "@tt/shared";
import { HORIZON_LABEL, isTemp, useUpdateTask } from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { useAssistant } from "@/components/assistant/assistant-context";
import { Segmented } from "@/components/ui/segmented";
import { LinkChip } from "./link-chip";
import { ResearchSection } from "./research";

const label = "mb-1.5 block text-[11px] font-bold tracking-wider text-muted uppercase";

type Patch = Partial<Pick<Task, "link_url" | "idea_kind" | "horizon">>;

/** The task sheet's Someday section: the link, goal vs. learn, and a rough timeframe. */
export function SomedayFields({ task, onChange }: { task: Task; onChange: (patch: Patch) => void }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line-soft p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-extrabold text-ink">Someday</h3>
        <AskButton task={task} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <fieldset>
          <legend className={label}>Type</legend>
          <Segmented<IdeaKind | "none">
            label="Type"
            size="sm"
            value={task.idea_kind ?? "none"}
            onChange={(v) => onChange({ idea_kind: v === "none" ? null : v })}
            options={[
              { value: "none", label: "Idea" },
              { value: "goal", label: "Goal" },
              { value: "learn", label: "Learn" },
            ]}
          />
        </fieldset>
        <fieldset>
          <legend className={label}>Timeframe</legend>
          <Segmented<Horizon | "none">
            label="Timeframe"
            size="sm"
            value={task.horizon ?? "none"}
            onChange={(v) => onChange({ horizon: v === "none" ? null : v })}
            options={[
              { value: "none", label: "—" },
              { value: "month", label: HORIZON_LABEL.month },
              { value: "year", label: HORIZON_LABEL.year },
              { value: "someday", label: HORIZON_LABEL.someday },
            ]}
          />
        </fieldset>
      </div>
      <LinkField value={task.link_url} onCommit={(link_url) => onChange({ link_url })} />
      <ResearchSection task={task} />
      <TtNote task={task} />
    </section>
  );
}

/** Opens Ask tt. about this item, closing the sheet so the panel is in view. */
function AskButton({ task }: { task: Task }) {
  const { ask } = useAssistant();
  const openTask = useOpenTask();
  return (
    <button
      type="button"
      disabled={isTemp(task.id)}
      onClick={() => {
        openTask(null);
        ask(`Help me get started on ${task.title}`, { taskId: task.id });
      }}
      title="Ask tt. for first steps and places to start"
      className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] font-bold text-chip-ink hover:bg-row disabled:opacity-50"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Ask tt.
    </button>
  );
}

/** What tt. should keep in mind for this item, on top of the type's notes in Settings. */
function TtNote({ task }: { task: Task }) {
  const updateTask = useUpdateTask();
  const [draft, setDraft] = useState(task.assistant_note ?? "");
  useEffect(() => setDraft(task.assistant_note ?? ""), [task.assistant_note]);
  return (
    <div>
      <label htmlFor="tt-note" className={label}>
        Notes for tt.
      </label>
      <textarea
        id="tt-note"
        value={draft}
        rows={2}
        maxLength={1000}
        disabled={isTemp(task.id)}
        placeholder="e.g. I can only practice on weekends. Focus on conversation, not grammar."
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const text = draft.trim();
          if (text !== (task.assistant_note ?? "")) {
            updateTask.mutate({ id: task.id, patch: { assistant_note: text || null } });
          }
        }}
        className="block w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky focus:ring-2 focus:ring-sky/20"
      />
      <p className="mt-1 text-[12px] text-muted">
        tt. uses these with your{" "}
        <Link href="/settings" className="font-bold underline hover:text-ink">
          Settings
        </Link>{" "}
        notes when you ask about this item.
      </p>
    </div>
  );
}

/** Saves on blur or Enter. Adds https:// to a bare site; anything that isn't a link is undone. */
function LinkField({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    const next = normalizeLink(draft);
    if (next === undefined) return setInvalid(true);
    setInvalid(false);
    setDraft(next ?? "");
    if (next !== value) onCommit(next);
  };
  return (
    <div>
      <label htmlFor="task-link" className={label}>
        Link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="task-link"
          type="url"
          inputMode="url"
          value={draft}
          placeholder="Where you saw it: an article, video or course"
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(value ?? "");
          }}
          aria-invalid={invalid}
          aria-describedby={invalid ? "task-link-error" : undefined}
          className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-sky/20 ${invalid ? "border-risk" : "border-line focus:border-sky"}`}
        />
        {value && <LinkChip url={value} />}
      </div>
      {invalid && (
        <p id="task-link-error" className="mt-1 text-[12px] font-semibold text-risk">
          That doesn&apos;t look like a link.
        </p>
      )}
    </div>
  );
}
