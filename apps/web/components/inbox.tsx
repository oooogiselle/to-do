"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMinutes, type List, type Priority, type Task } from "@tt/shared";
import {
  isTemp,
  tempId,
  useCreateList,
  useDeleteList,
  useModel,
  useUpdateList,
} from "@/lib/client/data";
import { useCompletion } from "@/lib/client/completion";
import { fmtDue, fmtWhen } from "@/lib/client/time";
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

  // Start of each task's next upcoming (or in-progress) block.
  const nextBlock = useMemo(() => {
    const next = new Map<string, number>();
    for (const b of blocks) {
      if (Date.parse(b.end) <= now) continue;
      const start = Date.parse(b.start);
      const prev = next.get(b.task_id);
      if (prev === undefined || start < prev) next.set(b.task_id, start);
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

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
          <Link
            href="/import"
            className="rounded-md border border-line px-2.5 py-1 text-muted hover:border-line-strong hover:text-ink"
          >
            Import tasks
          </Link>
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
                {g.list ? (
                  <ListHeading list={g.list} count={g.tasks.length} />
                ) : (
                  <h2 className="mb-1.5 flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full bg-line-strong" aria-hidden />
                    No list
                    <span className="font-normal text-muted">{g.tasks.length}</span>
                  </h2>
                )}
                {g.tasks.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        tz={settings.timezone}
                        nextAt={nextBlock.get(t.id)}
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

function TaskRow({ task, tz, nextAt }: { task: Task; tz: string; nextAt?: number }) {
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
      {!done && nextAt !== undefined && (
        <span
          className="rounded bg-paper px-1.5 py-0.5 text-xs text-muted"
          title="Next scheduled block"
        >
          {fmtWhen(nextAt, tz)}
        </span>
      )}
      {nextAt === undefined && !done && task.estimate_min && (
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

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="List color" className="flex gap-1">
      {LIST_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`size-5 rounded-full ${value === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function ListHeading({ list, count }: { list: List; count: number }) {
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);

  const startEditing = () => {
    setName(list.name);
    setColor(list.color);
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateList.mutate({ id: list.id, patch: { name: name.trim(), color } });
    setEditing(false);
  };

  if (!editing) {
    return (
      <h2 className="group mb-1.5 flex items-center gap-2 font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: list.color }} aria-hidden />
        {list.name}
        <span className="font-normal text-muted">{count}</span>
        {!isTemp(list.id) && (
          <button
            onClick={startEditing}
            aria-label={`Edit list ${list.name}`}
            className="text-xs font-normal text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-ink"
          >
            Edit
          </button>
        )}
      </h2>
    );
  }

  return (
    <form
      onSubmit={save}
      onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface p-2"
    >
      <label htmlFor={`list-name-${list.id}`} className="sr-only">
        List name
      </label>
      <input
        id={`list-name-${list.id}`}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-semibold outline-none focus:border-line-strong"
      />
      <ColorPicker value={color} onChange={setColor} />
      <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-paper hover:opacity-90">
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="px-1 text-muted hover:text-ink"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          const note = count
            ? ` Its ${count} open task${count === 1 ? "" : "s"} will move to No list.`
            : "";
          if (confirm(`Delete the list “${list.name}”?${note}`)) deleteList.mutate(list.id);
        }}
        className="ml-auto px-1 text-risk hover:underline"
      >
        Delete list
      </button>
    </form>
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
      tempId: tempId(),
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
      <ColorPicker value={color} onChange={setColor} />
      <button
        type="submit"
        className="rounded-md border border-line-strong px-3 py-1.5 hover:border-ink"
      >
        Add list
      </button>
    </form>
  );
}
