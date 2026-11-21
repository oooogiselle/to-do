"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, MessageCircle, MoreHorizontal, Sun, Trash2 } from "lucide-react";
import {
  formatMinutes,
  linkLabel,
  localDate,
  swatch,
  type Horizon,
  type IdeaKind,
  type ResourceKind,
  type Step,
  type Task,
} from "@tt/shared";
import {
  contactLabel,
  endPosition,
  formatEffort,
  HORIZON_LABEL,
  HORIZON_ORDER,
  IDEA_KIND_LABEL,
  isTemp,
  lastContact,
  nextStep,
  researchState,
  tempId,
  useAddToPlan,
  useCompletion,
  useDeleteTaskWithUndo,
  useLogContact,
  useModel,
  useUpdateTask,
  type SomedayItem,
} from "@tt/client";
import { useAssistant } from "@/components/assistant/assistant-context";
import { useDismiss } from "@/components/ui/use-dismiss";

/**
 * Pieces shared by both Someday views (DESIGN.md, Layout pieces: Someday). Board cards and kind
 * rows use the same meta line, kind chip, action and ⋯ menu, so the two views read as one page.
 */

export const horizonLabel = (h: Horizon | null) => (h ? HORIZON_LABEL[h] : "Whenever");

/** Pane head: the name at 12/600 and a count at 11 faint, over a line-soft rule. */
export function PaneHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 border-b border-line-soft px-5 pt-3 pb-2.5">
      <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
      <span className="ml-auto text-[11px] text-faint tabular-nums">{count}</span>
    </div>
  );
}

const KIND_CHIP: Record<IdeaKind | "idea", string> = {
  goal: "bg-warn-bg text-warn",
  learn: "bg-grape-bg text-grape-ink",
  people: "bg-open text-open-ink",
  idea: "bg-chip text-chip-ink",
};

export function KindChip({ kind }: { kind: IdeaKind | null }) {
  return (
    <span className={`shrink-0 rounded-sm px-1.5 py-px text-[10px] font-medium ${KIND_CHIP[kind ?? "idea"]}`}>
      {kind ? IDEA_KIND_LABEL[kind] : "Idea"}
    </span>
  );
}

/** One grey line of facts joined with "·". */
export function Meta({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  if (!shown.length) return null;
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] whitespace-nowrap text-faint">
      {shown.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <span className="truncate">{p}</span>
        </span>
      ))}
    </span>
  );
}

/** What a Learn item is, for its action label: from the link's site, else what research found. */
export function learnType(task: Pick<Task, "link_url" | "research">): ResourceKind | null {
  const host = task.link_url ? linkLabel(task.link_url) : "";
  if (/youtube|youtu\.be|vimeo/.test(host)) return "video";
  if (/goodreads|bookshop|oreilly/.test(host)) return "book";
  const s = researchState(task);
  return s.state === "done" ? (s.research.resources[0]?.kind ?? null) : null;
}

const TYPE_LABEL: Partial<Record<ResourceKind, string>> = {
  video: "Video",
  book: "Book",
  course: "Course",
  article: "Article",
};

/** "~40h" from research, else the task's own estimate. */
export function effortOf(task: Task): string | null {
  const s = researchState(task);
  if (s.state === "done" && s.research.total_min) return formatEffort(s.research.total_min);
  return task.estimate_min ? formatMinutes(task.estimate_min) : null;
}

const stepsLabel = (steps: Step[]) =>
  steps.length ? `${steps.filter((s) => s.done).length} of ${steps.length} steps` : null;

/** "Talked today", "Talked yesterday", "12 days ago", or "Not logged yet". */
function contactText(task: Task, today: string) {
  const last = lastContact(task);
  if (!last) return "Not logged yet";
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
  return days <= 1 ? `Talked ${contactLabel(last, today)}` : `${days} days ago`;
}

function useToday() {
  const { settings } = useModel();
  return localDate(new Date(), settings.timezone);
}

/** The board card's one fact after the kind chip. */
export function cardFact(item: SomedayItem, steps: Step[], today: string): string | null {
  const { task } = item;
  if (researchState(task).state === "pending") return "Finding resources…";
  if (task.idea_kind === "people") return contactText(task, today);
  if (task.idea_kind === "learn") return task.link_url ? linkLabel(task.link_url) : effortOf(task);
  return stepsLabel(steps) ?? effortOf(task);
}

/** The kind row's meta line: timeframe first, then what matters for that kind. */
export function rowFacts(item: SomedayItem, steps: Step[], today: string): (string | null)[] {
  const { task } = item;
  const when = horizonLabel(task.horizon);
  if (researchState(task).state === "pending") return [when, "Finding resources…"];
  switch (task.idea_kind) {
    case "people":
      return [contactText(task, today)];
    case "learn": {
      const type = learnType(task);
      return [when, type ? (TYPE_LABEL[type] ?? null) : null, task.link_url ? linkLabel(task.link_url) : null, effortOf(task)];
    }
    case "goal": {
      const next = nextStep(steps);
      return [when, stepsLabel(steps), next ? `Next: ${next.title}` : effortOf(task)];
    }
    default:
      return [when];
  }
}

/** Puts a goal's next step (or the item itself) on today's plan. */
export function useAddToToday(task: Task, steps: Step[]) {
  const { planByDate } = useModel();
  const addToPlan = useAddToPlan();
  const today = useToday();
  const todayPlan = planByDate.get(today);
  const step = task.idea_kind === "goal" ? nextStep(steps) : undefined;
  const onToday = !!todayPlan?.some((i) => i.task_id === task.id && (i.step_id ?? undefined) === step?.id);
  const add = () =>
    !onToday &&
    !isTemp(task.id) &&
    addToPlan.mutate({
      tempId: tempId(),
      body: { task_id: task.id, step_id: step?.id ?? null, plan_date: today, position: endPosition(todayPlan) },
    });
  return { onToday, add };
}

const actionBtn =
  "inline-flex h-6 w-28 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium whitespace-nowrap text-chip-ink transition-colors hover:bg-surface hover:text-ink hover:ring-1 hover:ring-line group-hover:bg-surface group-hover:ring-1 group-hover:ring-line disabled:opacity-60";

/** The kind row's one action: Add to My day, Watched / Read it / Done, Talked today, Ask tt. */
export function ItemAction({ item, steps }: { item: SomedayItem; steps: Step[] }) {
  const { task } = item;
  const { setTaskDone } = useCompletion();
  const logContact = useLogContact();
  const { ask } = useAssistant();
  const today = useToday();
  const { onToday, add } = useAddToToday(task, steps);
  const saving = isTemp(task.id);
  const done = task.status === "done";

  if (task.idea_kind === "people") {
    const talkedToday = lastContact(task) === today;
    return (
      <button
        type="button"
        disabled={saving || talkedToday}
        onClick={() => logContact(task, today)}
        className={`${actionBtn} ${talkedToday ? "text-open-ink" : ""}`}
      >
        <Check className="h-3 w-3" aria-hidden />
        {talkedToday ? "Logged" : "Talked today"}
      </button>
    );
  }
  if (task.idea_kind === "learn") {
    const type = learnType(task);
    const label = done ? "Not done" : type === "video" ? "Watched" : type === "book" ? "Read it" : "Done";
    return (
      <button type="button" disabled={saving} onClick={() => setTaskDone(task.id, !done)} className={actionBtn}>
        <Check className="h-3 w-3" aria-hidden />
        {label}
      </button>
    );
  }
  if (task.idea_kind === "goal") {
    return (
      <button type="button" disabled={saving || onToday || done} onClick={add} className={actionBtn}>
        {onToday ? <Check className="h-3 w-3" aria-hidden /> : <Sun className="h-3 w-3" aria-hidden />}
        {onToday ? "On My day" : "Add to My day"}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => ask(`Help me shape this idea: ${task.title}`, { taskId: task.id })}
      className={actionBtn}
    >
      <MessageCircle className="h-3 w-3" aria-hidden />
      Ask tt.
    </button>
  );
}

const iconBtn =
  "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-active hover:text-ink disabled:opacity-50";

/** The card's Add to My day icon. */
export function AddTodayIcon({ task, steps }: { task: Task; steps: Step[] }) {
  const { onToday, add } = useAddToToday(task, steps);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={add}
      disabled={onToday || isTemp(task.id) || task.status === "done"}
      title={onToday ? "On My day" : "Add to My day"}
      aria-label={onToday ? `“${task.title}” is on My day` : `Add “${task.title}” to My day`}
      className={iconBtn}
    >
      {onToday ? <Check className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
    </button>
  );
}

const menuItem =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-chip-ink hover:bg-row-hover hover:text-ink";

/**
 * ⋯ on a card or row: Ask tt., Move to a timeframe, Make it a to-do, Delete. Opens fixed to the
 * button so a scrolling pane doesn't clip it.
 */
export function ItemMenu({ item, className = "" }: { item: SomedayItem; className?: string }) {
  const { task } = item;
  const { lists } = useModel();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTaskWithUndo();
  const { ask } = useAssistant();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const today = useToday();
  const logContact = useLogContact();
  const [contactDate, setContactDate] = useState(today);
  const btn = useRef<HTMLButtonElement>(null);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const toDoLists = lists.filter((l) => l.kind !== "someday" && !isTemp(l.id));

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={ref} className={`relative ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        disabled={isTemp(task.id)}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for “${task.title}”`}
        className={iconBtn}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && pos && (
        <div
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="animate-pop-in fixed z-50 w-56 rounded-2xl border border-line-soft bg-surface p-1.5 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => {
              ask(`Help me get started on ${task.title}`, { taskId: task.id });
              close();
            }}
          >
            <MessageCircle className="h-3.5 w-3.5 text-muted" />
            Ask tt.
          </button>
          <p className="px-2 pt-2 pb-1 text-[11px] text-muted">Move to</p>
          {HORIZON_ORDER.map((h) => {
            const current = task.horizon === h;
            return (
              <button
                key={h ?? "none"}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={menuItem}
                onClick={() => {
                  if (!current) updateTask.mutate({ id: task.id, patch: { horizon: h } });
                  close();
                }}
              >
                <span className="grid w-3.5 place-items-center">
                  {current && <Check className="h-3.5 w-3.5 text-ink" />}
                </span>
                {horizonLabel(h)}
              </button>
            );
          })}
          {toDoLists.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[11px] text-muted">Make it a to-do in</p>
              {toDoLists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => {
                    updateTask.mutate({ id: task.id, patch: { list_id: l.id } });
                    close();
                  }}
                >
                  <span className="grid w-3.5 place-items-center">
                    <span className="h-2 w-2 rounded-full" style={{ background: swatch(l.color).solid }} />
                  </span>
                  {l.name}
                </button>
              ))}
            </>
          )}
          {task.idea_kind === "people" && (
            <form
              className="flex items-center gap-1.5 px-2 pt-2 pb-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (contactDate && contactDate <= today) logContact(task, contactDate);
                close();
              }}
            >
              <label htmlFor={`contact-${task.id}`} className="text-[11px] whitespace-nowrap text-muted">
                Talked on
              </label>
              <input
                id={`contact-${task.id}`}
                type="date"
                value={contactDate}
                max={today}
                onChange={(e) => setContactDate(e.target.value)}
                className="h-6 min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 text-[11px] text-ink"
              />
              <button type="submit" className="h-6 rounded-md px-1.5 text-[11px] font-medium text-ink hover:bg-row-hover">
                Log
              </button>
            </form>
          )}
          <div className="my-1 border-t border-line-soft" />
          <button
            type="button"
            role="menuitem"
            className={`${menuItem} hover:!bg-risk-bg hover:!text-risk`}
            onClick={() => {
              deleteTask(task);
              close();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
