"use client";

import { PageHeader } from "./page-header";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ListFilter, Pencil, Plus, Sparkles, X } from "lucide-react";
import {
  completedAt,
  formatMinutes,
  isRecurring,
  localDate,
  repeatLabel,
  swatch,
  weekProgress,
  type List,
  type Step,
  type Task,
} from "@tt/shared";
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
import { DueDrawer } from "@/components/due-drawer";
import { DueChip } from "@/components/ui/due-chip";
import { InlineAdd } from "@/components/ui/inline-add";
import { PriorityMark } from "@/components/ui/priority-mark";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { TaskCheck } from "@/components/ui/task-check";
import { useDismiss } from "@/components/ui/use-dismiss";
import { useListParam } from "@/components/use-list-param";

/**
 * One grid for every row, heading and add row on To-dos (DESIGN.md, Layout pieces):
 * check / title / due / estimate / priority. Phones drop the estimate column.
 */
const GRID =
  "grid grid-cols-[16px_minmax(0,1fr)_auto_24px] items-center gap-3.5 px-3 sm:grid-cols-[16px_minmax(0,1fr)_128px_64px_40px]";

const controlBtn =
  "flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-row";

export function Inbox() {
  const { lists, listById, tasks: allTasks, settings, isLoading, stepsByTask, planByDate } = useModel();
  // Someday ideas have their own page.
  const tasks = allTasks.filter((t) => !isSomedayTask(t, listById));
  const someday = useSomeday();
  const [sort, setSort] = useState<InboxSort>("due");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const { groups, nextBlock } = useInbox(sort, showDone);
  // A sidebar list link (?list=<id>) shows just that list.
  const [listParam] = useListParam();
  const current = groups.find((g) => g.list && g.list.id === listParam)?.list ?? null;
  const shown = current ? groups.filter((g) => g.list?.id === current.id) : groups;

  const tz = settings.timezone;
  const now = Date.now();
  const inMyDay = new Set((planByDate.get(localDate(new Date(now), tz)) ?? []).map((i) => i.task_id));
  const scope = current ? tasks.filter((t) => t.list_id === current.id) : tasks;
  const openTasks = scope.filter((t) => t.status === "open");
  const doneWeek = weekProgress(scope, now, tz).done;
  const workMin = openTasks.reduce((sum, t) => sum + (t.estimate_min ?? 0), 0);
  const openIn = (list: List | null) =>
    tasks.filter(
      (t) =>
        t.status === "open" &&
        (list ? t.list_id === list.id : !t.list_id || !lists.some((l) => l.id === t.list_id)),
    ).length;
  const meta = [
    `${openTasks.length} open`,
    `${doneWeek} done this week`,
    ...(current && workMin ? [`${formatMinutes(workMin)} of work`] : []),
  ].join(" · ");

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-9">
          <div className="px-3">
            <PageHeader
              title={current ? current.name : "All lists"}
              crumb="To-dos"
              back={current ? { href: "/to-dos", label: "All lists" } : undefined}
              icon={
                current ? (
                  <span className="grid w-4 shrink-0 place-items-center" aria-hidden>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: swatch(current.color).solid }}
                    />
                  </span>
                ) : undefined
              }
              description={<span className={current ? "pl-[30px]" : ""}>{meta}</span>}
            >
              <ViewMenu sort={sort} onSort={setSort} showDone={showDone} onShowDone={setShowDone} />
              {current ? (
                !isTemp(current.id) && (
                  <button type="button" onClick={() => setEditing(true)} className={controlBtn}>
                    <Pencil className="h-3.5 w-3.5 text-muted" />
                    Edit list
                  </button>
                )
              ) : (
                <button type="button" onClick={() => setCreating(true)} className={controlBtn}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  New list
                </button>
              )}
            </PageHeader>
          </div>

          {creating && !current && <NewListForm count={lists.length} onDone={() => setCreating(false)} />}
          {editing && current && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-line">
              <ListEditor list={current} openCount={openTasks.length} onDone={() => setEditing(false)} />
            </div>
          )}

          {isLoading ? (
            <p className="px-3 font-medium text-muted">Loading…</p>
          ) : !tasks.length && !lists.length ? (
            <EmptyState />
          ) : (
            shown.map((g) => (
              <ListSection
                key={g.list?.id ?? "none"}
                list={g.list}
                tasks={g.tasks}
                openCount={openIn(g.list)}
                single={!!current}
                tz={tz}
                now={now}
                nextBlock={nextBlock}
                inMyDay={inMyDay}
                stepsByTask={stepsByTask}
              />
            ))
          )}

          {!current && someday.lists.length > 0 && (
            <Link
              href="/someday"
              className="mt-4 grid grid-cols-[16px_minmax(0,1fr)] items-center gap-3.5 rounded-md px-3 py-2 text-[12px] text-chip-ink transition-colors hover:bg-row"
            >
              <Sparkles className="h-3.5 w-3.5 justify-self-center text-grape-ink" strokeWidth={2} aria-hidden />
              <span>
                {someday.openCount} idea{someday.openCount === 1 ? "" : "s"} in Someday
              </span>
            </Link>
          )}
        </div>
      </div>
      <DueDrawer />
    </div>
  );
}

/** Sort order and Show done, folded into one quiet control. */
function ViewMenu({
  sort,
  onSort,
  showDone,
  onShowDone,
}: {
  sort: InboxSort;
  onSort: (v: InboxSort) => void;
  showDone: boolean;
  onShowDone: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Sort and show done"
        className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-chip-ink transition-colors hover:bg-row-hover hover:text-ink"
      >
        <ListFilter className="h-3.5 w-3.5 text-muted" aria-hidden />
        {sort === "due" ? "Due date" : "Priority"}
        {showDone && <span className="font-normal text-muted">· done shown</span>}
        <ChevronDown className="h-3 w-3 text-faint" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="View options"
          className="animate-pop-in absolute top-9 right-0 z-50 w-60 space-y-3 rounded-2xl border border-line-soft bg-surface p-3 shadow-pop"
        >
          <div>
            <p className="pb-1.5 text-[12px] font-semibold text-ink">Sort by</p>
            <Segmented
              label="Sort"
              size="sm"
              value={sort}
              onChange={onSort}
              options={[
                { value: "due", label: "Due date" },
                { value: "priority", label: "Priority" },
              ]}
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px] font-medium text-ink">
            Show done
            <Switch checked={showDone} onChange={onShowDone} label="Show done" />
          </label>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">No to-dos yet.</p>
      <p className="mt-1 text-sm font-medium text-accent">Press ⌘K to add your first one.</p>
    </div>
  );
}

/** One list on To-dos: its heading (unless it's the only one shown), rows and add row. */
function ListSection({
  list,
  tasks,
  openCount,
  single,
  tz,
  now,
  nextBlock,
  inMyDay,
  stepsByTask,
}: {
  list: List | null;
  tasks: Task[];
  openCount: number;
  single: boolean;
  tz: string;
  now: number;
  nextBlock: Map<string, number>;
  inMyDay: Set<string>;
  stepsByTask: Map<string, Step[]>;
}) {
  const [editing, setEditing] = useState(false);
  const c = swatch(list?.color ?? NO_COLOR);
  const name = list?.name ?? "No list";

  return (
    <section aria-label={name} className={single ? "border-t border-line" : ""}>
      {!single &&
        (editing && list ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line">
            <ListEditor list={list} openCount={openCount} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <h2 className="group flex items-center gap-3.5 border-b border-line px-3 pt-[18px] pb-2">
            <span className="grid w-4 shrink-0 place-items-center" aria-hidden>
              <span className="h-2 w-2 rounded-full" style={{ background: c.solid }} />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate text-[12px] font-semibold text-ink">{name}</span>
              <span className="text-[11px] font-normal text-faint">{openCount} open</span>
            </span>
            {list && !isTemp(list.id) && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={`Edit list ${list.name}`}
                title="Rename, recolor or delete"
                className="grid h-6 w-6 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-row-hover hover:text-ink focus:opacity-100 no-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </h2>
        ))}

      {tasks.length === 0 ? (
        <p className="py-2.5 pr-3 pl-[42px] text-[12px] text-faint">No open to-dos.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              color={c.solid}
              tz={tz}
              now={now}
              nextAt={nextBlock.get(t.id)}
              steps={stepsByTask.get(t.id) ?? []}
              inMyDay={inMyDay.has(t.id)}
            />
          ))}
        </ul>
      )}

      <InlineAdd
        grid
        listId={list?.id ?? null}
        listName={name}
        color={c.solid}
        placeholder={single ? `Add to ${name}, e.g. read chapter 3 fri 5pm high` : undefined}
      />
    </section>
  );
}

/** "Done today", "Done yesterday", "Done Mon", "Done Nov 4". */
function doneLabel(at: string, tz: string, now: number): string {
  const day = localDate(new Date(at), tz);
  const today = localDate(new Date(now), tz);
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  if (diff <= 0) return "Done today";
  if (diff === 1) return "Done yesterday";
  const opts: Intl.DateTimeFormatOptions =
    diff < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
  return `Done ${new Intl.DateTimeFormat("en-US", opts).format(new Date(at))}`;
}

function TaskRow({
  task,
  color,
  tz,
  now,
  nextAt,
  steps,
  inMyDay,
}: {
  task: Task;
  color: string;
  tz: string;
  now: number;
  nextAt?: number;
  steps: Step[];
  inMyDay: boolean;
}) {
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const doneAt = completedAt(task);
  const stepsDone = steps.filter((s) => s.done).length;
  return (
    <li className={`${GRID} min-h-[42px] border-b border-line-soft py-2 transition-colors hover:bg-row`}>
      <TaskCheck
        size={16}
        done={done}
        color={task.color ?? color}
        onToggle={() => setTaskDone(task.id, !done)}
        label={task.title}
        disabled={isTemp(task.id)}
      />
      <button
        type="button"
        onClick={() => !isTemp(task.id) && openTask(task.id)}
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-left"
      >
        <span className={`text-[13px] font-medium ${done ? "text-faint line-through" : "text-ink"}`}>
          {task.title}
        </span>
        {!done && nextAt !== undefined && (
          <span
            className="rounded-md bg-open px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-open-ink"
            title="Next scheduled block"
          >
            {fmtWhen(nextAt, tz, now)}
          </span>
        )}
        {!done && steps.length > 0 && (
          <span className="text-[11px] whitespace-nowrap text-faint">
            {stepsDone} of {steps.length} steps
          </span>
        )}
        {!done && inMyDay && <span className="text-[11px] whitespace-nowrap text-faint">In My day</span>}
      </button>
      <span className="justify-self-end">
        {done ? (
          doneAt && <span className="text-[11px] whitespace-nowrap text-faint">{doneLabel(doneAt, tz, now)}</span>
        ) : task.due_at ? (
          <DueChip dueAt={task.due_at} tz={tz} now={now} />
        ) : isRecurring(task) ? (
          <span className="text-[11px] whitespace-nowrap text-faint" title="Repeats; checked off on My day">
            {repeatLabel(task)}
          </span>
        ) : (
          <span className="text-[11px] whitespace-nowrap text-faint">No date</span>
        )}
      </span>
      <span className="hidden text-right text-[11px] text-faint tabular-nums sm:block">
        {task.estimate_min ? formatMinutes(task.estimate_min) : ""}
      </span>
      <span className="flex justify-end">
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
        className="min-w-[140px] flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-accent/30"
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
          className="rounded-lg px-2 py-1 text-[13px] font-medium text-risk hover:bg-surface/60"
        >
          Delete list
        </button>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto rounded-lg px-2 py-1 text-[13px] font-medium text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button type="submit" className="rounded-xl bg-ink px-3 py-1.5 text-[13px] font-medium text-surface">
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
        className="min-w-[180px] flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-accent/30"
      />
      <ColorPicker value={color} onChange={(v) => v && setColor(v)} label="List color" size={28} />
      <SomedayToggle checked={someday} onChange={setSomeday} />
      <button type="submit" className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-surface">
        Create
      </button>
      <button
        type="button"
        onClick={onDone}
        aria-label="Cancel"
        className="grid h-9 w-9 place-items-center rounded-xl text-ink hover:bg-surface/60"
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
      className="flex w-full cursor-pointer items-center gap-2 text-[13px] font-medium text-ink"
      title="The AI suggests tasks from this list when you click open time"
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Someday list <span className="font-normal text-muted">(things to do when there&apos;s time)</span>
    </label>
  );
}
