"use client";

import { PageHeader } from "./page-header";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardPaste, Pencil, Plus, Sparkles, X } from "lucide-react";
import { formatMinutes, swatch, type List, type Task } from "@tt/shared";
import {
  fmtWhen,
  isTemp,
  NO_COLOR,
  PALETTE,
  tempId,
  useCompletion,
  useCreateList,
  useDeleteList,
  isSomedayTask,
  useInbox,
  useModel,
  useSomeday,
  useUpdateList,
  type InboxSort,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { ColorPicker } from "@/components/color-picker";
import { DueChip } from "@/components/ui/due-chip";
import { InlineAdd } from "@/components/ui/inline-add";
import { PriorityMark } from "@/components/ui/priority-mark";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { TaskCheck } from "@/components/ui/task-check";

export function Inbox() {
  const { lists, listById, tasks: allTasks, settings, isLoading } = useModel();
  // Someday ideas have their own page.
  const tasks = allTasks.filter((t) => !isSomedayTask(t, listById));
  const someday = useSomeday();
  const [sort, setSort] = useState<InboxSort>("due");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const { groups, nextBlock } = useInbox(sort, showDone);
  const openTotal = tasks.filter((t) => t.status === "open").length;
  const doneTotal = tasks.filter((t) => t.status === "done").length;
  const openIn = (list: List | null) =>
    tasks.filter(
      (t) =>
        t.status === "open" &&
        (list ? t.list_id === list.id : !t.list_id || !lists.some((l) => l.id === t.list_id)),
    ).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <PageHeader title="To-dos" description={`${openTotal} open · ${doneTotal} done`}>
          <Segmented
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "due", label: "Due date" },
              { value: "priority", label: "Priority" },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-chip-ink">
            <Switch checked={showDone} onChange={setShowDone} label="Show done" />
            Show done
          </label>
          <Link
            href="/import"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:bg-row"
          >
            <ClipboardPaste className="h-4 w-4 text-sun" strokeWidth={2.5} />
            Import
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:bg-row"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            New list
          </button>
        </PageHeader>

        {creating && <NewListForm count={lists.length} onDone={() => setCreating(false)} />}

        {isLoading ? (
          <p className="font-semibold text-muted">Loading…</p>
        ) : !tasks.length && !lists.length ? (
          <EmptyState />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {groups.map((g) => (
              <ListCard
                key={g.list?.id ?? "none"}
                list={g.list}
                tasks={g.tasks}
                openCount={openIn(g.list)}
                tz={settings.timezone}
                nextBlock={nextBlock}
              />
            ))}
          </div>
        )}

        {someday.lists.length > 0 && (
          <Link
            href="/someday"
            className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-chip-ink hover:bg-row"
          >
            <Sparkles className="h-4 w-4 text-grape" strokeWidth={2} aria-hidden />
            <span>
              {someday.openCount} idea{someday.openCount === 1 ? "" : "s"} in Someday
              <span className="text-muted"> · goals and things to learn</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-base font-bold text-ink">No tasks yet.</p>
      <p className="mt-1 text-sm font-semibold text-coral">Press ⌘K to add your first one.</p>
    </div>
  );
}

function ListCard({
  list,
  tasks,
  openCount,
  tz,
  nextBlock,
}: {
  list: List | null;
  tasks: Task[];
  openCount: number;
  tz: string;
  nextBlock: Map<string, number>;
}) {
  const [editing, setEditing] = useState(false);
  const color = list?.color ?? NO_COLOR;
  const c = swatch(color);
  const name = list?.name ?? "No list";

  return (
    <section
      aria-label={name}
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {editing && list ? (
        <ListEditor list={list} openCount={openCount} onDone={() => setEditing(false)} />
      ) : (
        <header
          className="group flex items-center gap-3 px-4 py-3"
          style={{ background: c.solid, color: c.onSolid }}
        >
          <h2 className="truncate text-base font-extrabold tracking-tight">{name}</h2>
          <span className="shrink-0 rounded-full bg-black/15 px-2 py-0.5 text-[12px] font-bold">
            {openCount} open
          </span>
          {list && !isTemp(list.id) && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit list ${list.name}`}
              title="Rename, recolor or delete"
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg opacity-60 group-hover:opacity-100 hover:bg-black/10 focus:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </header>
      )}

      {tasks.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-row-hover">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} color={c.solid} tz={tz} nextAt={nextBlock.get(t.id)} />
          ))}
        </ul>
      )}

      <InlineAdd listId={list?.id ?? null} listName={name} color={c.solid} size="md" />
    </section>
  );
}

function TaskRow({
  task,
  color,
  tz,
  nextAt,
}: {
  task: Task;
  color: string;
  tz: string;
  nextAt?: number;
}) {
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const rowColor = task.color ?? color;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-row">
      <TaskCheck
        done={done}
        color={rowColor}
        onToggle={() => setTaskDone(task.id, !done)}
        label={task.title}
        disabled={isTemp(task.id)}
      />
      <button
        type="button"
        onClick={() => !isTemp(task.id) && openTask(task.id)}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"
      >
        <span
          className={`mr-1 text-sm font-semibold ${done ? "text-faint line-through" : "text-ink"}`}
        >
          {task.title}
        </span>
        {!done && <DueChip dueAt={task.due_at} tz={tz} />}
        {!done && nextAt !== undefined && (
          <span
            className="rounded-md bg-[#e6f2ec] px-1.5 py-0.5 text-[11px] font-semibold text-[#2f6b52]"
            title="Next scheduled block"
          >
            {fmtWhen(nextAt, tz)}
          </span>
        )}
      </button>
      {task.color && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: task.color }}
          title="Own color"
          aria-hidden
        />
      )}
      {task.estimate_min && (
        <span className="hidden text-[12px] font-semibold text-faint tabular-nums sm:inline">
          {formatMinutes(task.estimate_min)}
        </span>
      )}
      <span className="flex w-4 justify-center">
        <PriorityMark priority={task.priority} />
      </span>
    </li>
  );
}

export function ListEditor({
  list,
  openCount,
  onDone,
}: {
  list: List;
  openCount: number;
  onDone: () => void;
}) {
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const [someday, setSomeday] = useState(list.kind === "someday");
  const c = swatch(color);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        updateList.mutate({
          id: list.id,
          patch: { name: name.trim(), color, kind: someday ? "someday" : "normal" },
        });
        onDone();
      }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="flex flex-wrap items-center gap-2 border-b-2 p-3"
      style={{ borderColor: c.solid, background: c.tint }}
    >
      <label htmlFor={`list-name-${list.id}`} className="sr-only">
        List name
      </label>
      <input
        id={`list-name-${list.id}`}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-[140px] flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-sky/30"
      />
      <ColorPicker value={color} onChange={(v) => v && setColor(v)} label="List color" size={22} />
      <SomedayToggle checked={someday} onChange={setSomeday} />
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const note = openCount
              ? ` Its ${openCount} open task${openCount === 1 ? "" : "s"} will move to No list.`
              : "";
            if (confirm(`Delete the list “${list.name}”?${note}`)) deleteList.mutate(list.id);
          }}
          className="rounded-lg px-2 py-1 text-[13px] font-bold text-risk hover:bg-white/60"
        >
          Delete list
        </button>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto rounded-lg px-2 py-1 text-[13px] font-bold text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button type="submit" className="rounded-xl bg-ink px-3 py-1.5 text-[13px] font-bold text-white">
          Save
        </button>
      </div>
    </form>
  );
}

export function NewListForm({
  count,
  onDone,
  someday: initialSomeday = false,
}: {
  count: number;
  onDone: () => void;
  /** Start with the Someday box checked (the Someday page). */
  someday?: boolean;
}) {
  const createList = useCreateList();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[count % PALETTE.length]!);
  const [someday, setSomeday] = useState(initialSomeday);
  const c = swatch(color);
  return (
    <form
      className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3"
      style={{ borderColor: c.solid, background: c.tint }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        createList.mutate({
          tempId: tempId(),
          body: { name: name.trim(), color, sort_order: count, kind: someday ? "someday" : "normal" },
        });
        setName("");
        onDone();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name, e.g. CS61"
        aria-label="List name"
        className="min-w-[180px] flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-sky/30"
      />
      <ColorPicker value={color} onChange={(v) => v && setColor(v)} label="List color" size={28} />
      <SomedayToggle checked={someday} onChange={setSomeday} />
      <button type="submit" className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white">
        Create
      </button>
      <button
        type="button"
        onClick={onDone}
        aria-label="Cancel"
        className="grid h-9 w-9 place-items-center rounded-xl text-ink hover:bg-white/60"
      >
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

/** Marks a list as ideas for free time (no deadlines); the open-time suggestions draw on it. */
function SomedayToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="flex w-full cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink"
      title="The AI suggests tasks from this list when you click open time"
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Someday list <span className="font-normal text-muted">(things to do when there&apos;s time)</span>
    </label>
  );
}
