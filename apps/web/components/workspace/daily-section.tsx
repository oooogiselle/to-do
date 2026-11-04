"use client";

import { useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { isDoneOn, repeatLabel, streakOn, swatch, type Task } from "@tt/shared";
import {
  taskColor,
  tempId,
  useCreateTask,
  useModel,
  useToggleRoutine,
  useUpdateTask,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { TaskCheck } from "@/components/ui/task-check";

/** Repeating to-dos that come up on `date`, checked off per day. */
export function DailySection({ date, routines }: { date: string; routines: Task[] }) {
  const { listById } = useModel();
  const openTask = useOpenTask();
  const toggle = useToggleRoutine();
  const update = useUpdateTask();
  const create = useCreateTask();
  const [draft, setDraft] = useState("");
  const doneCount = routines.filter((t) => isDoneOn(t, date)).length;

  return (
    <section aria-label="Daily to-dos">
      <header className="flex items-center gap-1.5 px-1 pb-1">
        <Repeat className="h-3 w-3 text-mint" aria-hidden="true" />
        <h3 className="text-[11px] tracking-[0.08em] text-faint uppercase">Every day</h3>
        <span className="ml-auto text-[11px] tabular-nums text-faint">
          {doneCount}/{routines.length}
        </span>
      </header>

      <ul>
        {routines.map((t) => {
          const done = isDoneOn(t, date);
          const streak = streakOn(t, date);
          const c = swatch(taskColor(t, listById));
          return (
            <li
              key={t.id}
              className="group relative flex items-center gap-3 border-b border-line-soft py-2.5 pr-1 pl-3"
            >
              <span
                aria-hidden="true"
                className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full"
                style={{ background: c.solid, opacity: done ? 0.35 : 1 }}
              />
              <TaskCheck
                done={done}
                color={c.solid}
                onToggle={() => toggle(t, date, !done)}
                label={t.title}
                size={16}
              />
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className="min-w-0 flex-1 text-left focus-visible:underline"
              >
                <span
                  className={`block truncate text-[13px] ${done ? "text-faint line-through" : "text-ink"}`}
                >
                  {t.title}
                </span>
              </button>
              <span className="shrink-0 text-[11px] text-faint">{repeatLabel(t)}</span>
              {streak > 1 && (
                <span
                  className="shrink-0 rounded-md border border-risk/20 bg-risk-bg px-1.5 py-px text-[11px] text-risk"
                  title={`${streak}-day streak`}
                >
                  {streak} days
                </span>
              )}
              <button
                type="button"
                onClick={() => update.mutate({ id: t.id, patch: { repeat: "none", repeat_days: [] } })}
                aria-label={`Stop repeating ${t.title}`}
                title="Stop repeating"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint opacity-0 transition-opacity group-hover:opacity-100 no-hover:opacity-100 hover:bg-row-hover hover:text-ink focus:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <form
        className="mt-1 flex items-center gap-3 rounded-lg py-2 pr-1 pl-3 hover:bg-row"
        onSubmit={(e) => {
          e.preventDefault();
          const title = draft.trim();
          if (!title) return;
          create.mutate({
            tempId: tempId(),
            body: { title, estimate_min: 15, repeat: "daily" },
          });
          setDraft("");
        }}
      >
        <Plus className="h-4 w-4 shrink-0 text-faint" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a daily to-do"
          aria-label="Add a daily to-do"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
        />
      </form>
    </section>
  );
}
