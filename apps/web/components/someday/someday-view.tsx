"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Pencil, Plus, Sun, Trash2 } from "lucide-react";
import {
  localDate,
  splitLink,
  swatch,
  type Horizon,
  type IdeaKind,
  type List,
  type Task,
} from "@tt/shared";
import {
  endPosition,
  HORIZON_LABEL,
  contactLabel,
  IDEA_KIND_LABEL,
  isTemp,
  lastContact,
  setNotice,
  tempId,
  useAddSomeday,
  useAddToPlan,
  useCompletion,
  useDeleteTaskWithUndo,
  useLogContact,
  useModel,
  useResearchTask,
  useSomeday,
  useUpdateTask,
  type SomedayItem,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { useAssistant } from "@/components/assistant/assistant-context";
import { ListEditor, NewListForm } from "@/components/inbox";
import { PageHeader } from "@/components/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { TaskCheck } from "@/components/ui/task-check";
import { LinkChip } from "./link-chip";
import { ResearchSummary } from "./research";

type KindFilter = IdeaKind | "all";

const SECTION_HINT: Record<Horizon | "none", string> = {
  month: "Worth a spot soon",
  year: "Sometime this year",
  someday: "No rush at all",
  none: "No timeframe yet",
};

/** The list a sidebar link (/someday#<id>) points at, if any. */
function useHashList() {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setHash(window.location.hash.slice(1) || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return [hash, setHash] as const;
}

export function SomedayView() {
  const { lists: allLists, isLoading } = useModel();
  const [kind, setKind] = useState<KindFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hashList, setHashList] = useHashList();
  const { lists, sections, openCount } = useSomeday({ kind, showDone });

  const listFilter = lists.some((l) => l.id === hashList) ? hashList : null;
  const shown = useMemo(
    () =>
      listFilter
        ? sections
            .map((s) => ({ ...s, items: s.items.filter((i) => i.list.id === listFilter) }))
            .filter((s) => s.items.length)
        : sections,
    [sections, listFilter],
  );
  const filteredList = lists.find((l) => l.id === listFilter);
  const pickList = (id: string | null) => {
    history.replaceState(null, "", id ? `#${id}` : window.location.pathname);
    setHashList(id);
    setEditing(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <PageHeader
          title="Someday"
          description={`Long-term goals, things you want to learn and people to keep in touch with, for when there's time. ${openCount} open.`}
        >
          <Segmented<KindFilter>
            label="Show"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All" },
              { value: "goal", label: "Goals" },
              { value: "learn", label: "Learn" },
              { value: "people", label: "People" },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-chip-ink">
            <Switch checked={showDone} onChange={setShowDone} label="Show done" />
            Show done
          </label>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:bg-row"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            New list
          </button>
        </PageHeader>

        {creating && (
          <NewListForm count={allLists.length} someday onDone={() => setCreating(false)} />
        )}

        {lists.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented<string>
              label="List"
              size="sm"
              value={listFilter ?? "all"}
              onChange={(v) => pickList(v === "all" ? null : v)}
              options={[{ value: "all", label: "All lists" }, ...lists.map((l) => ({ value: l.id, label: l.name }))]}
            />
          </div>
        )}
        {filteredList && !isTemp(filteredList.id) && (
          <div className="mb-4">
            {editing ? (
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <ListEditor
                  list={filteredList}
                  openCount={shown.reduce((n, s) => n + s.items.filter((i) => i.task.status === "open").length, 0)}
                  onDone={() => setEditing(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit “{filteredList.name}”
              </button>
            )}
          </div>
        )}

        <Capture lists={lists} listId={listFilter} kindFilter={kind} />

        {isLoading ? (
          <p className="font-semibold text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <EmptyState filtered={kind !== "all" || !!listFilter} />
        ) : (
          <div className="space-y-8">
            {shown.map((s) => (
              <section key={s.horizon ?? "none"} aria-label={s.horizon ? HORIZON_LABEL[s.horizon] : "No timeframe"}>
                <h2 className="mb-3 flex items-baseline gap-2">
                  <span className="text-[15px] font-extrabold tracking-tight text-ink">
                    {s.horizon ? HORIZON_LABEL[s.horizon] : "Whenever"}
                  </span>
                  <span className="text-[12px] text-muted">{SECTION_HINT[s.horizon ?? "none"]}</span>
                </h2>
                <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {s.items.map((item) => (
                    <IdeaCard key={item.task.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One box for quick capture. A pasted link becomes the item's link (and switches the type to
 * Learn unless you picked one); text alongside it becomes the title.
 */
function Capture({
  lists,
  listId,
  kindFilter,
}: {
  lists: List[];
  listId: string | null;
  kindFilter: KindFilter;
}) {
  const addSomeday = useAddSomeday();
  const research = useResearchTask();
  const { ask } = useAssistant();
  const [text, setText] = useState("");
  const [researchNote, setResearchNote] = useState<string | null>(null);
  const [kind, setKind] = useState<IdeaKind | null>(null);
  const [horizon, setHorizon] = useState<Horizon | "none">("none");
  const [pickedList, setPickedList] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const parsed = useMemo(() => splitLink(text), [text]);
  // The type the item gets: what you picked, else the page filter, else Learn for a link.
  const effectiveKind: IdeaKind | null =
    kind ?? (kindFilter !== "all" ? kindFilter : parsed.link_url ? "learn" : null);
  const target = listId ?? (pickedList || lists.find((l) => !isTemp(l.id))?.id);

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    setFailed(false);
    setResearchNote(null);
    try {
      await addSomeday(
        {
          title: parsed.title,
          link_url: parsed.link_url,
          idea_kind: effectiveKind,
          horizon: horizon === "none" ? null : horizon,
        },
        {
          listId: target,
          onAdded: (task) => {
            setNotice({ kind: "added", taskId: task.id, label: task.title, listName: "Someday" });
            // Every new item gets web resources and a time estimate; the card fills in when done.
            // People items don't need a web search.
            if (effectiveKind === "people") return;
            research.mutate(task.id, {
              onError: (e) => setResearchNote(`Added, but couldn't find resources: ${e.message}`),
            });
          },
        },
      );
      setText("");
      setKind(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mb-8 rounded-2xl border border-line bg-surface p-3 shadow-card"
    >
      <label htmlFor="someday-capture" className="sr-only">
        Add a goal or something to learn
      </label>
      <input
        id="someday-capture"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          effectiveKind === "people"
            ? "Someone to keep in touch with, e.g. Call Grandma…"
            : "A goal, or paste a link to something you want to learn…"
        }
        className="w-full bg-transparent px-1 py-1.5 text-[15px] font-medium text-ink outline-none placeholder:text-faint"
      />
      {parsed.link_url && (
        <p className="flex items-center gap-2 px-1 pb-1 text-[12px] text-muted">
          <LinkChip url={parsed.link_url} />
          saved as the link{parsed.title ? ` · “${parsed.title}”` : ""}
        </p>
      )}
      {researchNote && (
        <p role="status" className="px-1 pb-1 text-[12px] font-semibold text-muted">
          {researchNote}
        </p>
      )}
      {failed && (
        <p role="alert" className="px-1 pb-1 text-[12px] font-semibold text-risk">
          Couldn&apos;t create the Someday list. Try again.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
        <Segmented<IdeaKind | "none">
          label="Type"
          size="sm"
          value={effectiveKind ?? "none"}
          onChange={(v) => setKind(v === "none" ? null : v)}
          options={[
            { value: "none", label: "Idea" },
            { value: "goal", label: "Goal" },
            { value: "learn", label: "Learn" },
            { value: "people", label: "People" },
          ]}
        />
        <label className="sr-only" htmlFor="someday-horizon">
          Timeframe
        </label>
        <select
          id="someday-horizon"
          value={horizon}
          onChange={(e) => setHorizon(e.target.value as Horizon | "none")}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold text-chip-ink"
        >
          <option value="none">Any time</option>
          <option value="month">{HORIZON_LABEL.month}</option>
          <option value="year">{HORIZON_LABEL.year}</option>
          <option value="someday">{HORIZON_LABEL.someday}</option>
        </select>
        {!listId && lists.length > 1 && (
          <>
            <label className="sr-only" htmlFor="someday-list">
              List
            </label>
            <select
              id="someday-list"
              value={pickedList}
              onChange={(e) => setPickedList(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] font-bold text-chip-ink"
            >
              <option value="">{lists[0]!.name}</option>
              {lists.slice(1).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) return;
            // Not sure how to frame it? tt. suggests a type, timeframe and first steps.
            ask(`Help me shape this idea: ${text.trim()}`);
            setText("");
            setKind(null);
          }}
          disabled={!text.trim()}
          title="Not sure yet? tt. suggests a type, timeframe and first steps"
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-[13px] font-bold text-ink hover:bg-row disabled:opacity-40"
        >
          <MessageCircle className="h-3.5 w-3.5 text-muted" />
          Ask tt.
        </button>
        <button
          type="submit"
          disabled={!parsed.title || busy}
          className="rounded-xl bg-ink px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function IdeaCard({ item }: { item: SomedayItem }) {
  const { task, list, progress } = item;
  const { lists, planByDate, settings } = useModel();
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const addToPlan = useAddToPlan();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTaskWithUndo();
  const { ask } = useAssistant();
  const done = task.status === "done";
  const saving = isTemp(task.id);
  const c = swatch(task.color ?? list.color);
  const today = localDate(new Date(), settings.timezone);
  const todayPlan = planByDate.get(today);
  const onToday = !!todayPlan?.some((i) => i.task_id === task.id);
  const normalLists = lists.filter((l) => l.kind !== "someday" && !isTemp(l.id));
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <li
      className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong"
      style={{ borderTop: `3px solid ${c.solid}` }}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <TaskCheck
            done={done}
            color={c.solid}
            onToggle={() => setTaskDone(task.id, !done)}
            label={task.title}
            disabled={saving}
          />
        </div>
        <button
          type="button"
          onClick={() => !saving && openTask(task.id)}
          className={`min-w-0 flex-1 text-left text-[14px] leading-snug font-semibold ${done ? "text-faint line-through" : "text-ink"}`}
        >
          {task.title}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => deleteTask(task)}
          title="Delete"
          aria-label={`Delete “${task.title}”`}
          className="-mt-0.5 -mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-risk-bg hover:text-risk focus-visible:opacity-100 disabled:hidden [@media(hover:none)]:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {(task.idea_kind || task.link_url) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-8">
          {task.idea_kind && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                task.idea_kind === "goal"
                  ? "bg-warn-bg text-warn"
                  : task.idea_kind === "people"
                    ? "bg-open text-open-ink"
                    : "bg-grape-bg text-grape-ink"
              }`}
            >
              {IDEA_KIND_LABEL[task.idea_kind]}
            </span>
          )}
          {task.link_url && <LinkChip url={task.link_url} />}
        </div>
      )}

      {task.notes && <p className="line-clamp-2 pl-8 text-[12px] text-muted">{task.notes}</p>}

      {!done && task.idea_kind === "people" && <ContactLine task={task} today={today} disabled={saving} />}
      {!done && task.idea_kind !== "people" && (
        <ResearchSummary task={task} onMore={() => openTask(task.id)} className="pl-8" />
      )}

      {progress.total > 0 && (
        <div className="flex items-center gap-2 pl-8" title={`${progress.done} of ${progress.total} steps done`}>
          <div
            role="progressbar"
            aria-label="Steps done"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-chip"
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.solid }} />
          </div>
          <span className="text-[11px] font-bold text-muted tabular-nums">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}

      {!done && (
        <div className="mt-1 flex items-center gap-1.5 pl-8">
          <button
            type="button"
            disabled={saving || onToday}
            onClick={() =>
              addToPlan.mutate({
                tempId: tempId(),
                body: { task_id: task.id, plan_date: today, position: endPosition(todayPlan) },
              })
            }
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-chip-ink hover:bg-row disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {onToday ? <Check className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {onToday ? "On My day" : "Add to My day"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => ask(`Help me get started on ${task.title}`, { taskId: task.id })}
            title="Ask tt. for first steps and places to start"
            aria-label={`Ask tt. how to start “${task.title}”`}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-row hover:text-ink disabled:opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          {normalLists.length > 0 && (
            <>
              <label className="sr-only" htmlFor={`move-${task.id}`}>
                Move to a list
              </label>
              <select
                id={`move-${task.id}`}
                value=""
                disabled={saving}
                onChange={(e) =>
                  e.target.value &&
                  updateTask.mutate({ id: task.id, patch: { list_id: e.target.value } })
                }
                className="ml-auto max-w-[130px] rounded-lg bg-transparent px-1.5 py-1 text-[12px] font-bold text-muted hover:bg-row hover:text-ink"
              >
                <option value="">Make it a to-do…</option>
                {normalLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** "Last connected Nov 3 · Log": when you last saw or talked to someone, and a way to log it. */
function ContactLine({ task, today, disabled }: { task: Task; today: string; disabled: boolean }) {
  const logContact = useLogContact();
  const [logging, setLogging] = useState(false);
  const [date, setDate] = useState(today);
  const last = lastContact(task);

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-8 text-[12px] text-muted">
      <span>{last ? `Last connected ${contactLabel(last, today)}` : "No contact logged yet"}</span>
      {logging ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (date && date <= today) logContact(task, date);
            setLogging(false);
          }}
        >
          <label className="sr-only" htmlFor={`contact-${task.id}`}>
            Day you connected
          </label>
          <input
            id={`contact-${task.id}`}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink"
          />
          <button type="submit" className="rounded-md px-1.5 py-0.5 font-bold text-ink hover:bg-row">
            Save
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDate(today);
            setLogging(true);
          }}
          className="rounded-md px-1.5 py-0.5 font-bold text-chip-ink hover:bg-row disabled:opacity-50"
        >
          Log
        </button>
      )}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-base font-bold text-ink">
        {filtered ? "Nothing here with this filter." : "Nothing parked yet."}
      </p>
      {!filtered && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Add a goal for this year, or paste a link to a video or article you want to get to
          later. When you click open time on the calendar, the suggestions can pick from here.
        </p>
      )}
    </div>
  );
}
