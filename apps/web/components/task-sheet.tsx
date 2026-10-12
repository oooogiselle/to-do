"use client";

import { useEffect, useState } from "react";
import { formatMinutes, type Priority, type Step, type Task } from "@tt/shared";
import {
  isTemp,
  useCreateStep,
  useDeleteStep,
  useDeleteTask,
  useModel,
  useUpdateStep,
  useUpdateTask,
} from "@/lib/client/data";
import { fromLocalInput, toLocalInput } from "@/lib/client/time";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "med", label: "Medium" },
  { value: "high", label: "High" },
];

const field =
  "w-full rounded-md border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-line-strong";

/** Text input that saves on blur or Enter, and resyncs when the stored value changes. */
function CommitInput({
  value,
  onCommit,
  className,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={className}
    />
  );
}

export function TaskSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { taskById, stepsByTask, lists, settings } = useModel();
  const task = taskById.get(taskId);
  const steps = stepsByTask.get(taskId) ?? [];
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) {
    return (
      <Sheet onClose={onClose}>
        <p className="p-6 text-muted">This task was deleted or hasn&apos;t loaded yet.</p>
      </Sheet>
    );
  }

  const saving = isTemp(task.id);
  const update = (patch: Partial<Task>) =>
    !saving && updateTask.mutate({ id: task.id, patch: patch as never });
  const stepTotal = steps.reduce((sum, s) => sum + (s.estimate_min ?? 0), 0);

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-3 border-b border-line p-4">
        <input
          type="checkbox"
          aria-label={task.status === "done" ? "Mark as not done" : "Mark as done"}
          checked={task.status === "done"}
          onChange={(e) => update({ status: e.target.checked ? "done" : "open" })}
          className="mt-1.5 size-4 accent-[var(--now)]"
        />
        <CommitInput
          aria-label="Title"
          value={task.title}
          onCommit={(title) => title.trim() && update({ title: title.trim() })}
          className={`flex-1 bg-transparent text-lg font-medium outline-none ${task.status === "done" ? "text-muted line-through" : ""}`}
        />
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 text-lg text-muted hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-3">
          <label htmlFor="task-list" className="text-muted">
            List
          </label>
          <select
            id="task-list"
            value={task.list_id ?? ""}
            onChange={(e) => update({ list_id: e.target.value || null })}
            className={field}
          >
            <option value="">No list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <label htmlFor="task-due" className="text-muted">
            Due
          </label>
          <input
            id="task-due"
            type="datetime-local"
            value={toLocalInput(task.due_at, settings.timezone)}
            onChange={(e) => update({ due_at: fromLocalInput(e.target.value, settings.timezone) })}
            className={field}
          />

          <span className="text-muted">Priority</span>
          <div role="radiogroup" aria-label="Priority" className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                role="radio"
                aria-checked={task.priority === p.value}
                onClick={() => update({ priority: p.value })}
                className={`rounded-md border px-2.5 py-1 ${task.priority === p.value ? "border-ink bg-ink text-paper" : "border-line text-muted hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label htmlFor="task-estimate" className="text-muted">
            Estimate
          </label>
          <div className="flex items-center gap-2">
            <CommitInput
              id="task-estimate"
              inputMode="numeric"
              value={task.estimate_min?.toString() ?? ""}
              onCommit={(v) => {
                const n = parseInt(v, 10);
                update({ estimate_min: Number.isFinite(n) && n > 0 ? n : null });
              }}
              placeholder="—"
              className={`${field} w-20`}
            />
            <span className="text-muted">min</span>
            {stepTotal > 0 && stepTotal !== task.estimate_min && (
              <button
                onClick={() => update({ estimate_min: stepTotal })}
                className="text-xs text-muted underline hover:text-ink"
              >
                Use step total ({formatMinutes(stepTotal)})
              </button>
            )}
          </div>
        </div>

        <NotesField task={task} onCommit={(notes) => update({ notes })} />

        <StepsEditor taskId={task.id} steps={steps} disabled={saving} />

        <div className="flex flex-wrap gap-2">
          <button
            disabled
            title="Coming with AI breakdown"
            className="rounded-md border border-line px-3 py-1.5 text-muted opacity-60"
          >
            Break down
          </button>
          <button
            disabled
            title="Coming with scheduling"
            className="rounded-md border border-line px-3 py-1.5 text-muted opacity-60"
          >
            Schedule
          </button>
        </div>
      </div>

      <div className="border-t border-line p-4">
        <button
          onClick={() => {
            if (confirm(`Delete “${task.title}”?`)) {
              deleteTask.mutate(task.id);
              onClose();
            }
          }}
          className="text-risk hover:underline"
        >
          Delete task
        </button>
      </div>
    </Sheet>
  );
}

function NotesField({ task, onCommit }: { task: Task; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(task.notes);
  useEffect(() => setDraft(task.notes), [task.notes]);
  return (
    <div className="space-y-1.5">
      <label htmlFor="task-notes" className="text-muted">
        Notes
      </label>
      <textarea
        id="task-notes"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== task.notes && onCommit(draft)}
        className={`${field} resize-y`}
      />
    </div>
  );
}

function StepsEditor({
  taskId,
  steps,
  disabled,
}: {
  taskId: string;
  steps: Step[];
  disabled: boolean;
}) {
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();
  const [title, setTitle] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || disabled) return;
    const order = (steps.at(-1)?.order ?? -1) + 1;
    createStep.mutate({
      tempId: `temp-${crypto.randomUUID()}`,
      body: { task_id: taskId, title: title.trim(), order },
    });
    setTitle("");
  };

  return (
    <div className="space-y-1.5">
      <span className="text-muted">Steps</span>
      <ul className="divide-y divide-line rounded-md border border-line">
        {steps.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 px-2.5 py-1.5">
            <input
              type="checkbox"
              aria-label={`Done: ${s.title}`}
              checked={s.done}
              disabled={isTemp(s.id)}
              onChange={(e) => updateStep.mutate({ id: s.id, patch: { done: e.target.checked } })}
              className="size-4 accent-[var(--now)]"
            />
            <CommitInput
              aria-label="Step title"
              value={s.title}
              disabled={isTemp(s.id)}
              onCommit={(v) =>
                v.trim() && updateStep.mutate({ id: s.id, patch: { title: v.trim() } })
              }
              className={`min-w-0 flex-1 bg-transparent outline-none ${s.done ? "text-muted line-through" : ""}`}
            />
            <CommitInput
              aria-label="Step estimate in minutes"
              inputMode="numeric"
              value={s.estimate_min?.toString() ?? ""}
              placeholder="min"
              disabled={isTemp(s.id)}
              onCommit={(v) => {
                const n = parseInt(v, 10);
                updateStep.mutate({
                  id: s.id,
                  patch: { estimate_min: Number.isFinite(n) && n > 0 ? n : null },
                });
              }}
              className="w-12 bg-transparent text-right text-muted outline-none"
            />
            <button
              aria-label={`Delete step ${s.title}`}
              disabled={isTemp(s.id)}
              onClick={() => deleteStep.mutate(s.id)}
              className="text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-risk"
            >
              ×
            </button>
          </li>
        ))}
        <li>
          <form onSubmit={add}>
            <input
              aria-label="New step"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a step"
              className="w-full bg-transparent px-2.5 py-1.5 outline-none placeholder:text-muted/70"
            />
          </form>
        </li>
      </ul>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-ink/10"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-label="Task details"
        className="flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface shadow-xl"
      >
        {children}
      </aside>
    </div>
  );
}
