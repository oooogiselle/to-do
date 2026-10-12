"use client";

import { useMemo, useState } from "react";
import { formatMinutes, type List, type Priority, type Task } from "@tt/shared";
import { isTemp, useCreateList, useModel } from "@/lib/client/data";
import { useCompletion } from "@/lib/client/completion";
import { fmtDue } from "@/lib/client/time";
import { useOpenTask } from "@/components/app-shell";

type Sort = "due" | "priority";
const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2, none: 3 };
const PRIORITY_MARK: Record<Priority, string> = { high: "!!!", med: "!!", low: "!", none: "" };
const LIST_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#64748b"];

const byDue = (a: Task, b: Task) =>
  (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity);
const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b);

export function Inbox() {
  const { lists, tasks, blocks, settings, isLoading } = useModel();
  const [sort, setSort] = useState<Sort>("due");
  const [showDone, setShowDone] = useState(false);
  const now = Date.now();

  const scheduled = useMemo(
    () => new Set(blocks.filter((b) => Date.parse(b.end) > now).map((b) => b.task_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks],
  );

  const groups = useMemo(() => {
    const visible = tasks.filter((t) => t.status === "open" || (showDone && t.status === "done"));
    const sorted = [...visible].sort(sort === "due" ? byDue : byPriority);
    const withList: { list: List | null; tasks: Task[] }[] = [
      {
        list: null,
        tasks: sorted.filter((t) => !t.list_id || !lists.some((l) => l.id === t.list_id)),
      },
      ...lists.map((list) => ({ list, tasks: sorted.filter((t) => t.list_id === list.id) })),
    ];
    return withList.filter((g) => g.list || g.tasks.length);
  }, [tasks, lists, sort, showDone]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <div className="ml-auto flex items-center gap-3 text-muted">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
              />
              Show done
            </label>
            <label className="flex items-center gap-1.5">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
              >
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.list?.id ?? "none"}>
                <h2 className="mb-1.5 flex items-center gap-2 font-semibold">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: g.list?.color ?? "var(--line-strong)" }}
                    aria-hidden
                  />
                  {g.list?.name ?? "No list"}
                  <span className="font-normal text-muted">{g.tasks.length}</span>
                </h2>
                {g.tasks.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        tz={settings.timezone}
                        unscheduled={!scheduled.has(t.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 text-muted">No open tasks.</p>
                )}
              </section>
            ))}
            {!tasks.length && (
              <p className="text-muted">No tasks yet. Press ⌘K to add your first one.</p>
            )}
            <NewListForm count={lists.length} />
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, tz, unscheduled }: { task: Task; tz: string; unscheduled: boolean }) {
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const overdue = !done && task.due_at && Date.parse(task.due_at) < Date.now();
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <input
        type="checkbox"
        aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        checked={done}
        disabled={isTemp(task.id)}
        onChange={(e) => setTaskDone(task.id, e.target.checked)}
        className="size-4 accent-[var(--now)]"
      />
      <button
        onClick={() => !isTemp(task.id) && openTask(task.id)}
        className={`min-w-0 flex-1 truncate text-left ${done ? "text-muted line-through" : "hover:underline"}`}
      >
        {task.title}
      </button>
      {task.priority !== "none" && (
        <span
          className={`text-xs font-semibold ${task.priority === "high" ? "text-risk" : "text-muted"}`}
          title={`${task.priority} priority`}
        >
          {PRIORITY_MARK[task.priority]}
        </span>
      )}
      {unscheduled && !done && task.estimate_min && (
        <span
          className="rounded bg-paper px-1.5 py-0.5 text-xs text-muted"
          title="Estimate, not scheduled yet"
        >
          {formatMinutes(task.estimate_min)}
        </span>
      )}
      {task.due_at && (
        <span
          className={`w-28 shrink-0 text-right text-xs ${overdue ? "text-risk" : "text-muted"}`}
        >
          {fmtDue(task.due_at, tz)}
        </span>
      )}
    </li>
  );
}

function NewListForm({ count }: { count: number }) {
  const createList = useCreateList();
  const [name, setName] = useState("");
  const [color, setColor] = useState(LIST_COLORS[count % LIST_COLORS.length]!);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createList.mutate({
      tempId: `temp-${crypto.randomUUID()}`,
      body: { name: name.trim(), color, sort_order: count },
    });
    setName("");
    setColor(LIST_COLORS[(count + 1) % LIST_COLORS.length]!);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <label htmlFor="new-list" className="sr-only">
        New list name
      </label>
      <input
        id="new-list"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New list, e.g. CS61"
        className="rounded-md border border-line bg-surface px-2.5 py-1.5 outline-none focus:border-line-strong"
      />
      <div role="radiogroup" aria-label="List color" className="flex gap-1">
        {LIST_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className={`size-5 rounded-full ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <button
        type="submit"
        className="rounded-md border border-line-strong px-3 py-1.5 hover:border-ink"
      >
        Add list
      </button>
    </form>
  );
}
