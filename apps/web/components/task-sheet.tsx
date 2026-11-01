"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { formatMinutes, swatch, type Priority, type Step, type Task } from "@tt/shared";
import {
  isTemp,
  NO_COLOR,
  taskColor,
  tempId,
  useCompletion,
  useCreateStep,
  useDeleteTask,
  useModel,
  useUpdateStep,
  useUpdateTask,
} from "@tt/client";
import { DuePicker } from "./due-picker";
import { ColorPicker } from "./color-picker";
import { TaskCheck } from "./ui/task-check";
import { BreakdownPanel } from "./task-sheet/breakdown-panel";
import { SchedulePanel } from "./task-sheet/schedule-panel";
import { ScheduledBlocks } from "./task-sheet/scheduled-blocks";

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "none", label: "None", color: "#8a8fa6" },
  { value: "low", label: "Low", color: "var(--tt-sky)" },
  { value: "med", label: "Med", color: "#c99a35" },
  { value: "high", label: "High", color: "var(--tt-coral)" },
];
const ESTIMATES = [15, 30, 60, 90, 120, 180];

const label = "mb-1.5 block text-[11px] font-bold tracking-wider text-[#8a8fa6] uppercase";
const field =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky focus:ring-2 focus:ring-sky/20";

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

/** The big title: wraps onto more lines, saves on blur or Enter. */
function TitleField({
  value,
  onCommit,
  done,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  done: boolean;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      aria-label="Title"
      rows={1}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
      onBlur={() => draft !== value && draft.trim() && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") setDraft(value);
      }}
      className={`w-full resize-none bg-transparent text-[22px] leading-tight font-extrabold tracking-tight outline-none placeholder:opacity-50 ${done ? "line-through opacity-70" : ""}`}
    />
  );
}

export function TaskSheet({
  taskId,
  initialPanel = null,
  onClose,
}: {
  taskId: string;
  initialPanel?: "schedule" | null;
  onClose: () => void;
}) {
  const { taskById, stepsByTask, blocks, lists, listById, settings } = useModel();
  const task = taskById.get(taskId);
  const steps = stepsByTask.get(taskId) ?? [];
  const taskBlocks = blocks.filter((b) => b.task_id === taskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { setTaskDone } = useCompletion();
  const [panel, setPanel] = useState<"breakdown" | "schedule" | null>(initialPanel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) {
    return (
      <Sheet onClose={onClose} label="Task">
        <div className="flex justify-end p-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="px-6 text-muted">This task was deleted or hasn&apos;t loaded yet.</p>
      </Sheet>
    );
  }

  const saving = isTemp(task.id);
  const update = (patch: Partial<Task>) =>
    !saving && updateTask.mutate({ id: task.id, patch: patch as never });
  const stepTotal = steps.reduce((sum, s) => sum + (s.estimate_min ?? 0), 0);
  const list = task.list_id ? listById.get(task.list_id) : undefined;
  const c = swatch(taskColor(task, listById));
  const done = task.status === "done";

  return (
    <Sheet onClose={onClose} label={`Task: ${task.title}`}>
      <div className="px-5 pt-4 pb-5" style={{ background: c.solid, color: c.onSolid }}>
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-lg bg-black/15 px-2 py-1 text-[12px] font-bold">
            {list?.name ?? "No list"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-start gap-3">
          <div className="pt-1">
            <TaskCheck
              done={done}
              color={c.onSolid}
              checkColor={c.solid}
              onToggle={() => setTaskDone(task.id, !done)}
              label={task.title}
              size={24}
              disabled={saving}
            />
          </div>
          <TitleField
            value={task.title}
            onCommit={(title) => update({ title })}
            done={done}
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-list" className={label}>
              List
            </label>
            <select
              id="task-list"
              value={task.list_id && lists.some((l) => l.id === task.list_id) ? task.list_id : ""}
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
          </div>
          <div>
            <span className={label}>Due</span>
            <DuePicker
              value={task.due_at}
              onChange={(due_at) => update({ due_at })}
              tz={settings.timezone}
              className="w-full rounded-xl px-3 py-2 text-left text-sm"
            />
          </div>
        </div>

        <fieldset>
          <legend className={label}>Priority</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {PRIORITIES.map((p) => {
              const active = task.priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ priority: p.value })}
                  className="rounded-xl border-2 py-1.5 text-sm font-bold transition-colors"
                  style={{
                    borderColor: active ? p.color : "var(--line)",
                    background: active ? p.color : "#fff",
                    color: active ? "#fff" : "var(--chip-ink)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={label}>Time estimate</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {ESTIMATES.map((m) => {
              const active = task.estimate_min === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ estimate_min: active ? null : m })}
                  className={`rounded-lg px-2.5 py-1 text-[13px] font-bold transition-colors ${
                    active ? "bg-ink text-white" : "bg-chip text-chip-ink hover:bg-line"
                  }`}
                >
                  {formatMinutes(m)}
                </button>
              );
            })}
            <label className="flex items-center gap-1 text-[13px] font-semibold text-muted">
              <CommitInput
                aria-label="Estimate in minutes"
                inputMode="numeric"
                value={
                  task.estimate_min && !ESTIMATES.includes(task.estimate_min)
                    ? String(task.estimate_min)
                    : ""
                }
                onCommit={(v) => {
                  const n = parseInt(v, 10);
                  update({ estimate_min: Number.isFinite(n) && n > 0 ? n : null });
                }}
                placeholder="Other"
                className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-[13px] font-bold text-ink outline-none focus:border-sky"
              />
              min
            </label>
          </div>
          {stepTotal > 0 && stepTotal !== task.estimate_min && (
            <button
              type="button"
              onClick={() => update({ estimate_min: stepTotal })}
              className="mt-1.5 text-[12px] font-semibold text-muted underline hover:text-ink"
            >
              Use step total ({formatMinutes(stepTotal)})
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend className={label}>Color</legend>
          <ColorPicker
            label="Task color"
            value={task.color}
            onChange={(color) => update({ color })}
            inherit={{ color: list?.color || NO_COLOR, label: "Same as list" }}
            size={22}
          />
        </fieldset>

        <section className="rounded-2xl p-3.5" style={{ background: c.tint }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-extrabold" style={{ color: c.ink }}>
              On your calendar
            </h3>
            {panel !== "schedule" && (
              <button
                type="button"
                disabled={saving || task.status !== "open"}
                onClick={() => setPanel("schedule")}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50"
                style={{ background: c.solid, color: c.onSolid }}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Find time
              </button>
            )}
          </div>
          {panel === "schedule" ? (
            <SchedulePanel task={task} onClose={() => setPanel(null)} />
          ) : taskBlocks.length ? (
            <ScheduledBlocks
              blocks={taskBlocks}
              steps={steps}
              tz={settings.timezone}
              color={c.solid}
            />
          ) : (
            <p className="text-[13px]" style={{ color: c.ink }}>
              No time blocked yet. &ldquo;Find time&rdquo; suggests open slots before it&apos;s
              due, or drag it onto a calendar.
            </p>
          )}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className={`${label} mb-0`}>Steps</h3>
            {panel !== "breakdown" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPanel("breakdown")}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-grape-ink hover:bg-grape-bg disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Break down
              </button>
            )}
          </div>
          {panel === "breakdown" ? (
            <BreakdownPanel task={task} onClose={() => setPanel(null)} />
          ) : (
            <StepsEditor taskId={task.id} steps={steps} disabled={saving} color={c.solid} />
          )}
        </section>

        <NotesField task={task} onCommit={(notes) => update({ notes })} />
        {task.source_quote && (
          <p className="rounded-xl bg-paper px-3 py-2 text-[12px] text-muted">
            From your import: &ldquo;{task.source_quote}&rdquo;
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete “${task.title}”?`)) {
              deleteTask.mutate(task.id);
              onClose();
            }
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-risk hover:bg-risk-bg"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-[#2a2d4a]"
        >
          Done
        </button>
      </div>
    </Sheet>
  );
}

function NotesField({ task, onCommit }: { task: Task; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(task.notes);
  useEffect(() => setDraft(task.notes), [task.notes]);
  return (
    <div>
      <label htmlFor="task-notes" className={label}>
        Notes
      </label>
      <textarea
        id="task-notes"
        rows={4}
        value={draft}
        placeholder="Links, details, anything…"
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
  color,
}: {
  taskId: string;
  steps: Step[];
  disabled: boolean;
  color: string;
}) {
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const { setStepDone, deleteStep } = useCompletion();
  const [title, setTitle] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || disabled) return;
    const order = (steps.at(-1)?.order ?? -1) + 1;
    createStep.mutate({
      tempId: tempId(),
      body: { task_id: taskId, title: title.trim(), order },
    });
    setTitle("");
  };

  return (
    <div>
      <ul className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-paper">
            <TaskCheck
              done={s.done}
              color={color}
              size={18}
              label={s.title}
              disabled={isTemp(s.id)}
              onToggle={() => setStepDone(taskId, s.id, !s.done)}
            />
            <CommitInput
              aria-label="Step title"
              value={s.title}
              disabled={isTemp(s.id)}
              onCommit={(v) =>
                v.trim() && updateStep.mutate({ id: s.id, patch: { title: v.trim() } })
              }
              className={`min-w-0 flex-1 bg-transparent text-sm font-medium outline-none ${s.done ? "text-faint line-through" : "text-ink"}`}
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
              className="w-12 bg-transparent text-right text-[13px] font-semibold text-faint outline-none"
            />
            <button
              type="button"
              aria-label={`Delete step ${s.title}`}
              disabled={isTemp(s.id)}
              onClick={() => deleteStep(taskId, s.id)}
              className="grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-white hover:text-risk focus:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-1 flex items-center gap-2">
        <Plus className="ml-1 h-4 w-4 text-faint" />
        <input
          aria-label="New step"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a step"
          className="flex-1 bg-transparent py-1.5 text-sm font-medium text-ink outline-none placeholder:text-faint"
        />
      </form>
    </div>
  );
}

function Sheet({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex justify-end bg-ink/30"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="animate-sheet-in flex h-full w-full max-w-[460px] flex-col bg-surface shadow-[-12px_0_40px_rgba(21,23,43,0.18)]"
      >
        {children}
      </aside>
    </div>
  );
}
