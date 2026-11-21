"use client";

import { Fragment, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Flag,
  ListTree,
  MoveRight,
  Pencil,
  Repeat,
  Sun,
  Trash2,
} from "lucide-react";
import {
  HORIZON_LABEL,
  endPosition,
  fmtDay,
  fmtDue,
  fmtTime,
  isTemp,
  taskColor,
  tempId,
  useAddSomeday,
  useAddToPlan,
  useCreateBlock,
  useCreateStep,
  useCreateTask,
  useCompletion,
  useDeleteStep,
  useDeleteTaskWithUndo,
  useModel,
  useMoveBlock,
  useRemoveBlockWithUndo,
  useRemoveFromPlan,
  useRestoreBlock,
  usePlanBlocks,
  useResolveCard,
  useScheduleNew,
  useUpdateStep,
  useUpdateTask,
} from "@tt/client";
import {
  addDays,
  formatMinutes,
  isDoneOn,
  isRecurring,
  linkLabel,
  localDate,
  swatch,
  type AssistantBlock,
  type AssistantChange,
  type AssistantEditFields,
  type Horizon,
  type IdeaKind,
  type ResearchResource,
} from "@tt/shared";
import { useOpenTask } from "@/components/app-shell";
import { DueChip } from "@/components/ui/due-chip";
import { Segmented } from "@/components/ui/segmented";

// Shared class strings, so every card reads as one family.
const cardShell = "overflow-hidden rounded-[10px] border border-line bg-surface";
const cardHeader =
  "flex items-center gap-1.5 border-b border-line-soft px-3 py-2 text-[12px] font-semibold text-chip-ink";
const cardFooter = "flex items-center gap-2 border-t border-line-soft bg-row px-3 py-2";
const primaryBtn =
  "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink px-2.5 text-[12px] text-surface transition-colors hover:bg-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:opacity-40";
const secondaryBtn =
  "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink transition-colors hover:bg-row-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:opacity-40";
const iconBtn =
  "grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-chip-ink transition-colors hover:bg-row-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong";
const doneNote = "inline-flex h-7 items-center gap-1 text-[12px] text-open-ink";
const chip = "inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-chip-ink";
const linkBtn = "ml-auto text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline";

type Of<K extends AssistantBlock["kind"]> = Extract<AssistantBlock, { kind: K }>;
type CardProps<K extends AssistantBlock["kind"]> = {
  messageId: string;
  index: number;
  resolved: Record<string, string>;
  block: Of<K>;
};

/** Adds a task (or step) to today's My day, at the end. */
function usePlanToday() {
  const { planByDate, settings } = useModel();
  const addToPlan = useAddToPlan();
  const today = localDate(new Date(), settings.timezone);
  const plan = planByDate.get(today) ?? [];
  return {
    isPlanned: (taskId: string) => plan.some((i) => i.task_id === taskId && !i.step_id),
    plan: (taskId: string) =>
      addToPlan.mutate({ tempId: tempId(), body: { task_id: taskId, plan_date: today, position: endPosition(plan) } }),
  };
}

const Dot = ({ color }: { color: string }) => (
  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: swatch(color).solid }} />
);

/** Proposed time blocks. Each can be added on its own, or all at once. */
export function ScheduleCard({ messageId, index, resolved, block }: CardProps<"schedule">) {
  const { taskById, listById, stepsByTask, settings } = useModel();
  const createBlock = useCreateBlock();
  const createStep = useCreateStep();
  const planBlocks = usePlanBlocks();
  const resolve = useResolveCard();
  const tz = settings.timezone;
  const keyOf = (j: number) => `${index}:pick:${j}`;
  const live = block.picks.map((p) => taskById.get(p.task_id));
  const pending = block.picks.map((_, j) => j).filter((j) => !resolved[keyOf(j)] && live[j]?.status === "open");
  const minutes = (p: (typeof block.picks)[number]) => (Date.parse(p.end) - Date.parse(p.start)) / 60_000;
  const total = block.picks.reduce((sum, p) => sum + minutes(p), 0);
  const today = localDate(new Date(), tz);
  // A week plan spans days: picks are grouped under a heading per day.
  const dayOfPick = block.picks.map((p) => localDate(new Date(p.start), tz));
  const dates = [...new Set(dayOfPick)];
  const multiDay = dates.length > 1;
  const dayTotal = (date: string) => block.picks.reduce((n, p, j) => (dayOfPick[j] === date ? n + minutes(p) : n), 0);
  const dayLabel = (date: string, style: "short" | "long") =>
    date === today ? "Today" : style === "long" ? fmtDay(date, tz, "long").split(",")[0] : fmtDay(date, tz);

  /** Books picks j with this step, and puts each block's to-do (or step) on that day's plan in My day. */
  const book = (js: number[], stepId: (j: number) => string | null) => {
    for (const j of js) {
      const p = block.picks[j]!;
      createBlock.mutate({ tempId: tempId(), body: { task_id: p.task_id, step_id: stepId(j), start: p.start, end: p.end } });
    }
    planBlocks(js.flatMap((j) => (live[j] ? [{ task: live[j], step_id: stepId(j), start: block.picks[j]!.start }] : [])));
  };
  /** One step per to-do and name, even across separate Add clicks while the first is saving. */
  const steps = useRef(new Map<string, Promise<string | null>>());
  /** The last step order handed out per to-do, since the model's view lags new steps by a render. */
  const lastOrder = useRef(new Map<string, number>());
  const stepFor = (key: string, taskId: string, title: string, estimate: number) => {
    const have = steps.current.get(key);
    if (have) return have;
    const existing = stepsByTask.get(taskId) ?? [];
    const same = existing.find((s) => !s.done && !isTemp(s.id) && s.title.trim().toLowerCase() === title.toLowerCase());
    const order = Math.max(existing.reduce((max, s) => Math.max(max, s.order), -1), lastOrder.current.get(taskId) ?? -1) + 1;
    if (!same) lastOrder.current.set(taskId, order);
    const made = same
      ? Promise.resolve(same.id)
      : createStep
          .mutateAsync({ tempId: tempId(), body: { task_id: taskId, title, estimate_min: estimate, order } })
          .then((step) => step.id as string | null)
          .catch(() => null);
    steps.current.set(key, made);
    return made;
  };
  /**
   * A pick named for a session the to-do has no step for gets that step first (one per name, or
   * an open step that already has it), so the block reads "Task · Outline" everywhere.
   */
  const accept = (js: number[]) => {
    resolve.mutate({ messageId, entries: Object.fromEntries(js.map((j) => [keyOf(j), "added"])) });
    const named = new Map<string, number[]>();
    const plain: number[] = [];
    for (const j of js) {
      const p = block.picks[j]!;
      const title = !p.step_id && p.step_title?.trim();
      if (!title) plain.push(j);
      else {
        const key = `${p.task_id}\n${title.toLowerCase()}`;
        named.set(key, [...(named.get(key) ?? []), j]);
      }
    }
    book(plain, (j) => block.picks[j]!.step_id);
    if (!named.size) return;
    const groups = [...named];
    // Booked together once every step is saved, so My day gets one run of positions. A step
    // that couldn't be saved still gets its time, just without the name.
    void Promise.all(
      groups.map(([key, group]) => {
        const p = block.picks[group[0]!]!;
        const estimate = group.reduce((n, j) => n + minutes(block.picks[j]!), 0);
        return stepFor(key, p.task_id, p.step_title!.trim(), estimate);
      }),
    ).then((ids) => {
      const stepOf = new Map(groups.flatMap(([, group], g) => group.map((j) => [j, ids[g] ?? null] as const)));
      book(
        groups.flatMap(([, group]) => group),
        (j) => stepOf.get(j) ?? null,
      );
    });
  };

  return (
    <div className={cardShell}>
      <div className={cardHeader}>
        <CalendarClock className="h-3 w-3" />
        Suggested · {multiDay ? `${dates.length} days` : dayLabel(dayOfPick[0] ?? block.date, "long")}
        <span className="ml-auto tracking-normal tabular-nums normal-case">{formatMinutes(total)}</span>
      </div>
      <ol>
        {block.picks.map((p, j) => {
          const task = live[j];
          const stepTitle = p.step_id
            ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id)?.title
            : p.step_title?.trim() || undefined;
          const done = !!resolved[keyOf(j)];
          const gone = !task || task.status !== "open";
          const firstOfDay = multiDay && dayOfPick[j] !== dayOfPick[j - 1];
          return (
            <Fragment key={j}>
              {firstOfDay && (
                <li
                  aria-hidden="true"
                  className={`flex items-center bg-row px-3 py-1 text-[11px] font-medium text-muted ${j ? "border-t border-line-soft" : ""}`}
                >
                  {dayLabel(dayOfPick[j]!, "short")}
                  <span className="ml-auto tabular-nums text-faint">{formatMinutes(dayTotal(dayOfPick[j]!))}</span>
                </li>
              )}
              <li className={`flex items-start gap-3 px-3 py-2.5 ${j || firstOfDay ? "border-t border-line-soft" : ""}`}>
                <span className="w-[58px] shrink-0 pt-px text-[12px] leading-tight text-ink tabular-nums">
                  {fmtTime(p.start, tz)}
                  <span className="block text-faint">{fmtTime(p.end, tz)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] text-ink">
                    <Dot color={taskColor(task, listById)} />
                    <span className={`truncate ${done || gone ? "text-faint" : ""}`}>
                      {task?.title ?? "A task that's gone"}
                      {stepTitle && <span className="text-muted"> · {stepTitle}</span>}
                    </span>
                  </p>
                  <p className="mt-0.5 pl-3 text-[12px] leading-snug text-muted">{p.reason}</p>
                </div>
                {done ? (
                  <span className={doneNote}>
                    <Check className="h-3.5 w-3.5" />
                    Added
                  </span>
                ) : (
                  !gone && (
                    <button
                      type="button"
                      onClick={() => accept([j])}
                      disabled={isTemp(p.task_id)}
                      className={secondaryBtn}
                      aria-label={`Add ${task.title}${stepTitle ? `, ${stepTitle},` : ""} at ${fmtTime(p.start, tz)}${multiDay ? ` on ${dayLabel(dayOfPick[j]!, "short")}` : ""}`}
                    >
                      Add
                    </button>
                  )
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {pending.length > 1 && (
        <div className={cardFooter}>
          <button type="button" onClick={() => accept(pending)} className={primaryBtn}>
            Add all {pending.length}
          </button>
          <span className="text-[11px] text-faint">Blocks go on your calendar and My day</span>
        </div>
      )}
    </div>
  );
}

type Change = AssistantChange;

/** Due dates as "Thu 5pm", or "none". */
const dueLabel = (iso: string | null | undefined, tz: string) => (iso ? fmtDue(iso, tz) : "none");

/**
 * Edits, moves and removals Ask tt. proposed. Each applies on its own (or all at once) and can be
 * undone from the card; one made stale by a later change to the same thing can't be applied.
 */
export function ChangesCard({ messageId, index, resolved, block }: CardProps<"changes">) {
  const { taskById, stepsByTask, blocks, planByDate, listById, settings } = useModel();
  const updateTask = useUpdateTask();
  const updateStep = useUpdateStep();
  const completion = useCompletion();
  const moveBlock = useMoveBlock();
  const removeBlock = useRemoveBlockWithUndo();
  const restoreBlock = useRestoreBlock();
  const deleteTask = useDeleteTaskWithUndo();
  const deleteStep = useDeleteStep();
  const createStep = useCreateStep();
  const removeFromPlan = useRemoveFromPlan();
  const addToPlan = useAddToPlan();
  const resolve = useResolveCard();
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const keyOf = (j: number) => `${index}:change:${j}`;
  const stepOf = (taskId: string, stepId: string | null) =>
    stepId ? stepsByTask.get(taskId)?.find((s) => s.id === stepId) : undefined;
  const blockOf = (id: string) => blocks.find((b) => b.id === id);
  const span = (s: { start: string; end: string }) =>
    `${dayName(s.start, tz)} ${fmtTime(s.start, tz)}–${fmtTime(s.end, tz)}`;
  const sameTime = (a: string, b: string) => Date.parse(a) === Date.parse(b);

  const isDone = (c: Extract<Change, { op: "edit" }>) => {
    const step = stepOf(c.task_id, c.step_id);
    if (c.step_id) return !!step?.done;
    const task = taskById.get(c.task_id);
    return !!task && (isRecurring(task) ? isDoneOn(task, today) : task.status === "done");
  };

  /** Whether the thing still looks the way it did when this was proposed. */
  const current = (c: Change): boolean => {
    const task = taskById.get(c.task_id);
    if (!task) return false;
    switch (c.op) {
      case "edit": {
        if (c.step_id && !stepOf(c.task_id, c.step_id)) return false;
        const live = c.step_id ? stepOf(c.task_id, c.step_id)! : task;
        return Object.keys(c.patch).every((k) => {
          const key = k as keyof AssistantEditFields;
          if (key === "done") return isDone(c) === !!c.before.done;
          if (key === "due_at") {
            const now = (live as typeof task).due_at ?? null;
            return (now === null) === (c.before.due_at == null) && (!now || sameTime(now, c.before.due_at!));
          }
          return (live as Record<string, unknown>)[key] === (c.before[key] ?? null);
        });
      }
      case "move": {
        const b = blockOf(c.block_id);
        return !!b && sameTime(b.start, c.from.start) && sameTime(b.end, c.from.end);
      }
      case "remove":
        if (c.what === "block") return !!blockOf(c.id);
        if (c.what === "step") return !!stepOf(c.task_id, c.id);
        if (c.what === "plan") return (planByDate.get(c.plan!.date) ?? []).some((i) => i.id === c.id);
        return task.status === "open";
    }
  };

  /** Whether an applied change is still in place, so undoing it won't clobber something newer. */
  const undoable = (c: Change): boolean => {
    switch (c.op) {
      case "edit":
        return !!taskById.get(c.task_id);
      case "move": {
        const b = blockOf(c.block_id);
        return !!b && sameTime(b.start, c.to.start) && sameTime(b.end, c.to.end);
      }
      case "remove":
        // A deleted to-do comes back from the toast's Undo, within its few seconds.
        return c.what !== "task" && !(c.what === "block" && Date.parse(c.span!.end) <= Date.now());
    }
  };

  const apply = (c: Change) => {
    switch (c.op) {
      case "edit": {
        const { done, ...fields } = c.patch;
        if (Object.keys(fields).length) {
          if (c.step_id) updateStep.mutate({ id: c.step_id, patch: { title: fields.title } });
          else updateTask.mutate({ id: c.task_id, patch: fields });
        }
        if (done) {
          if (c.step_id) completion.setStepDone(c.task_id, c.step_id, true);
          else completion.setTaskDone(c.task_id, true);
        }
        break;
      }
      case "move":
        moveBlock.mutate({ id: c.block_id, start: c.to.start, end: c.to.end });
        break;
      case "remove": {
        const task = taskById.get(c.task_id)!;
        if (c.what === "block") {
          const b = blockOf(c.id);
          if (b) removeBlock(b, task.title);
        } else if (c.what === "task") deleteTask(task);
        else if (c.what === "step") deleteStep.mutate(c.id);
        else removeFromPlan.mutate(c.id);
        break;
      }
    }
  };

  const undo = (c: Change) => {
    switch (c.op) {
      case "edit": {
        const { done, ...fields } = c.before;
        if (Object.keys(fields).length) {
          if (c.step_id) updateStep.mutate({ id: c.step_id, patch: { title: fields.title } });
          else updateTask.mutate({ id: c.task_id, patch: fields });
        }
        if (c.patch.done && done === false) {
          if (c.step_id) completion.setStepDone(c.task_id, c.step_id, false);
          else completion.setTaskDone(c.task_id, false);
        }
        break;
      }
      case "move":
        moveBlock.mutate({ id: c.block_id, start: c.from.start, end: c.from.end });
        break;
      case "remove":
        if (c.what === "block") restoreBlock({ task_id: c.task_id, step_id: c.step_id, ...c.span! });
        else if (c.what === "step")
          createStep.mutate({ tempId: tempId(), body: { task_id: c.task_id, ...c.step!, estimate_min: c.step!.estimate_min } });
        else if (c.what === "plan")
          addToPlan.mutate({
            tempId: tempId(),
            body: { task_id: c.task_id, step_id: c.step_id, plan_date: c.plan!.date, position: c.plan!.position },
          });
        break;
    }
  };

  const state = (j: number) => resolved[keyOf(j)];
  const pending = block.changes.map((_, j) => j).filter((j) => !state(j) && current(block.changes[j]!));
  const act = (js: number[], to: "applied" | "undone") => {
    resolve.mutate({ messageId, entries: Object.fromEntries(js.map((j) => [keyOf(j), to])) });
    js.forEach((j) => (to === "applied" ? apply : undo)(block.changes[j]!));
  };

  /** What the row is about, and what changes, in words. */
  const describe = (c: Change): { icon: typeof Pencil; title: string; detail: string; risk?: boolean } => {
    const task = taskById.get(c.task_id);
    const step = c.step_id ? stepOf(c.task_id, c.step_id) : undefined;
    const name =
      (task?.title ?? (c.op === "remove" ? c.label : undefined) ?? "A task that's gone") +
      (c.op === "remove" && c.what === "step" ? "" : step ? ` · ${step.title}` : "");
    switch (c.op) {
      case "edit": {
        const p = c.patch;
        const b = c.before;
        const parts = [
          p.title !== undefined && `rename to “${p.title}”`,
          p.due_at !== undefined && `due ${dueLabel(b.due_at, tz)} → ${dueLabel(p.due_at, tz)}`,
          p.estimate_min !== undefined &&
            `${b.estimate_min ? formatMinutes(b.estimate_min) : "no estimate"} → ${formatMinutes(p.estimate_min!)}`,
          p.priority !== undefined && `priority ${PRIORITY[b.priority!] || "none"} → ${PRIORITY[p.priority] || "none"}`,
          p.list_id !== undefined &&
            `move to ${listById.get(p.list_id ?? "")?.name ?? "no list"}`,
          p.done && (task && isRecurring(task) && !c.step_id ? "mark done for today" : "mark done"),
        ].filter(Boolean);
        return { icon: Pencil, title: name, detail: parts.join(" · ") };
      }
      case "move":
        return {
          icon: MoveRight,
          title: name,
          detail: `${span(c.from)} → ${span(c.to)}${c.reason ? ` · ${c.reason}` : ""}`,
        };
      case "remove": {
        const why = c.reason ? ` · ${c.reason}` : "";
        if (c.what === "block") return { icon: Trash2, title: name, detail: `Remove ${span(c.span!)}${why}`, risk: true };
        if (c.what === "plan") return { icon: Sun, title: name, detail: `Take off My day${why}` };
        if (c.what === "step")
          return { icon: Trash2, title: name, detail: `Delete step “${c.step!.title}”${why}`, risk: true };
        return {
          icon: Trash2,
          title: name,
          detail: `Delete to-do${c.blocks ? ` and its ${c.blocks} booked block${c.blocks > 1 ? "s" : ""}` : ""}${why}`,
          risk: true,
        };
      }
    }
  };

  return (
    <div className={cardShell}>
      <div className={cardHeader}>
        <Pencil className="h-3 w-3" />
        Changes · {block.changes.length}
      </div>
      <ul>
        {block.changes.map((c, j) => {
          const { icon: Icon, title, detail, risk } = describe(c);
          const s = state(j);
          const stale = !s && !current(c);
          return (
            <li key={j} className={`flex items-start gap-2.5 px-3 py-2.5 ${j ? "border-t border-line-soft" : ""}`}>
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${risk ? "text-risk" : "text-faint"}`} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] ${s === "applied" && risk ? "text-faint line-through" : "text-ink"}`}>
                  {title}
                </p>
                <p className={`mt-0.5 text-[12px] leading-snug ${risk ? "text-risk" : "text-muted"}`}>{detail}</p>
              </div>
              {s === "applied" ? (
                <span className="flex shrink-0 items-center gap-2">
                  <span className={doneNote}>
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </span>
                  {undoable(c) && (
                    <button type="button" onClick={() => act([j], "undone")} className="text-[12px] text-muted hover:text-ink">
                      Undo
                    </button>
                  )}
                </span>
              ) : s === "undone" ? (
                <span className="inline-flex h-7 shrink-0 items-center text-[12px] text-faint">Undone</span>
              ) : stale ? (
                <span className="inline-flex h-7 shrink-0 items-center text-[12px] text-faint">Changed since</span>
              ) : (
                <button
                  type="button"
                  onClick={() => act([j], "applied")}
                  disabled={isTemp(c.task_id)}
                  className={secondaryBtn}
                  aria-label={`Apply: ${title}, ${detail}`}
                >
                  Apply
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {pending.length > 1 && (
        <div className={cardFooter}>
          <button type="button" onClick={() => act(pending, "applied")} className={primaryBtn}>
            Apply all {pending.length}
          </button>
        </div>
      )}
    </div>
  );
}

/** A short list of real to-dos with quick actions: add to today, find time. */
export function TaskListCard({ block }: { block: Of<"tasks"> }) {
  const { taskById, listById, settings } = useModel();
  const openTask = useOpenTask();
  const today = usePlanToday();
  const rows = block.task_ids.map((id) => taskById.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  if (!rows.length) return null;

  return (
    <div className={cardShell}>
      <div className={cardHeader}>
        {block.label} · {rows.length}
      </div>
      <ul>
        {rows.map((t, i) => {
          const open = t.status === "open";
          const planned = today.isPlanned(t.id);
          return (
            <li key={t.id} className={`flex items-center gap-2.5 px-3 py-2 ${i ? "border-t border-line-soft" : ""}`}>
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline"
              >
                <span className="flex items-center gap-1.5 text-[13px] text-ink">
                  <Dot color={taskColor(t, listById)} />
                  <span className={`truncate ${open ? "" : "text-faint line-through"}`}>{t.title}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 pl-3">
                  <DueChip dueAt={t.due_at} tz={settings.timezone} />
                  {t.estimate_min && <span className="text-[11px] text-faint">{formatMinutes(t.estimate_min)}</span>}
                </span>
              </button>
              {open &&
                (planned ? (
                  <span className="grid h-7 w-7 place-items-center text-open-ink" title="On today's plan">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => today.plan(t.id)}
                    disabled={isTemp(t.id)}
                    className={iconBtn}
                    title="Add to today"
                    aria-label={`Add ${t.title} to today`}
                  >
                    <Sun className="h-3.5 w-3.5" />
                  </button>
                ))}
              {open && (
                <button
                  type="button"
                  onClick={() => openTask(t.id, { panel: "schedule" })}
                  className={iconBtn}
                  title="Find time"
                  aria-label={`Find time for ${t.title}`}
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Today", "Tomorrow", else a short weekday ("Thu"). */
function dayName(iso: string, tz: string) {
  const date = localDate(new Date(iso), tz);
  const today = localDate(new Date(), tz);
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return fmtDay(date, tz).split(/[ ,]/)[0];
}

const PRIORITY = { high: "High", med: "Medium", low: "Low", none: "" } as const;
const REPEAT = { daily: "Every day", weekdays: "Weekdays", custom: "Custom", none: "" } as const;

/** A to-do the assistant parsed. Title and list stay editable until it's added. */
export function DraftCard({ messageId, index, resolved, block }: CardProps<"draft">) {
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const resolve = useResolveCard();
  const openTask = useOpenTask();
  const today = usePlanToday();
  const scheduler = useScheduleNew();
  const createBlock = useCreateBlock();
  const planBlocks = usePlanBlocks();
  const d = block.draft;
  // Ask tt. picked a time from what they said; Schedule books exactly that.
  const book = block.book && Date.parse(block.book.end) > Date.now() ? block.book : null;
  const normal = lists.filter((l) => l.kind !== "someday" && !isTemp(l.id));
  const [title, setTitle] = useState(d.title);
  const [listId, setListId] = useState<string | null>(
    d.list_id && listById.has(d.list_id) ? d.list_id : (normal[0]?.id ?? null),
  );
  const key = `${index}:draft`;
  const created = resolved[key];
  // "<task id or pending>|<today|list|schedule>", plus for schedule "|<blocks booked>|<first start>|<failed>".
  const [createdId, where, bookedStr, firstStart, failedStr] = created ? created.split("|") : [];
  const tz = settings.timezone;
  const repeating = d.repeat !== "none";
  const list = listId ? listById.get(listId) : undefined;
  const booked = Number(bookedStr ?? 0);
  const failed = Number(failedStr ?? 0);
  const notBooked = where === "schedule" && !!createdId && createdId !== "pending" && booked === 0;
  const bookedLabel = firstStart
    ? `${booked > 1 ? `${booked} blocks from ` : ""}${dayName(firstStart, tz)} ${fmtTime(firstStart, tz)}`
    : "";

  const add = (to: "today" | "list" | "schedule") => {
    if (!title.trim() || created) return;
    resolve.mutate({ messageId, entries: { [key]: `pending|${to}` } });
    createTask.mutate(
      {
        tempId: tempId(),
        body: {
          title: title.trim(),
          list_id: listId,
          due_at: d.due_at,
          estimate_min: d.estimate_min,
          priority: d.priority,
          repeat: d.repeat,
        },
      },
      {
        onSuccess: async (task) => {
          if (to === "today") today.plan(task.id);
          let extra = "";
          if (to === "schedule" && book) {
            const ok = await createBlock
              .mutateAsync({ tempId: tempId(), body: { task_id: task.id, step_id: null, ...book } })
              .then(() => true)
              .catch(() => false);
            if (ok) planBlocks([{ task, step_id: null, start: book.start }]);
            extra = ok ? `|1|${book.start}|0` : "|0||1";
          } else if (to === "schedule") {
            const { booked, failed } = await scheduler.schedule(task);
            extra = `|${booked.length}|${booked[0]?.start ?? ""}|${failed}`;
          }
          resolve.mutate({ messageId, entries: { [key]: `${task.id}|${to}${extra}` } });
        },
      },
    );
  };

  return (
    <div className={cardShell}>
      <div className="px-3 pt-2.5 pb-3">
        {created ? (
          <p className="text-[13px] text-ink">{title}</p>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="To-do title"
            className="-mx-1 w-[calc(100%+8px)] rounded-md px-1 py-0.5 text-[13px] text-ink hover:bg-row-hover focus:bg-row-hover focus:outline-none"
          />
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <label className={`${chip} relative ${created ? "" : "cursor-pointer hover:bg-row"}`}>
            {list && <Dot color={list.color} />}
            {list?.name ?? "No list"}
            {!created && <ChevronDown className="h-3 w-3 text-faint" />}
            {!created && (
              <select
                value={listId ?? ""}
                onChange={(e) => setListId(e.target.value || null)}
                aria-label="List"
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                {normal.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <DueChip dueAt={d.due_at} tz={settings.timezone} />
          {book && !repeating && (
            <span className={chip}>
              <CalendarClock className="h-3 w-3 text-faint" />
              {dayName(book.start, tz)} {fmtTime(book.start, tz)}–{fmtTime(book.end, tz)}
            </span>
          )}
          {d.estimate_min && (
            <span className={chip}>
              <Clock className="h-3 w-3 text-faint" />
              {formatMinutes(d.estimate_min)}
            </span>
          )}
          {d.priority !== "none" && (
            <span className={chip}>
              <Flag className="h-3 w-3 text-faint" />
              {PRIORITY[d.priority]}
            </span>
          )}
          {repeating && (
            <span className={chip}>
              <Repeat className="h-3 w-3 text-faint" />
              {REPEAT[d.repeat]}
            </span>
          )}
        </div>
      </div>
      <div className={cardFooter}>
        {created ? (
          <>
            <span className={`${doneNote} min-w-0`}>
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {where !== "schedule"
                  ? `Added to ${list?.name ?? "your to-dos"}${where === "today" ? " and today's plan" : ""}`
                  : createdId === "pending"
                    ? "Finding time…"
                    : booked > 0
                      ? `Booked ${bookedLabel}`
                      : failed
                        ? "Added, but not to your calendar"
                        : "Added · no free time this week"}
              </span>
            </span>
            {createdId && createdId !== "pending" && (
              <button
                type="button"
                onClick={() => openTask(createdId, notBooked ? { panel: "schedule" } : undefined)}
                className={`${linkBtn} shrink-0`}
              >
                {notBooked ? "Find time" : "Open"}
              </button>
            )}
          </>
        ) : (
          <>
            {!repeating && (
              <button
                type="button"
                onClick={() => add("today")}
                disabled={!title.trim()}
                className={book ? secondaryBtn : primaryBtn}
              >
                <Sun className="h-3.5 w-3.5" />
                Add to today
              </button>
            )}
            {!repeating && (
              <button
                type="button"
                onClick={() => add("schedule")}
                disabled={!title.trim() || (!book && !scheduler.ready)}
                className={book ? primaryBtn : secondaryBtn}
                title={book ? "Add it and book that time" : "Add it and book time on your calendar"}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                {book ? "Book it" : "Schedule"}
              </button>
            )}
            <button
              type="button"
              onClick={() => add("list")}
              disabled={!title.trim()}
              className={repeating ? primaryBtn : `${linkBtn} whitespace-nowrap`}
            >
              {repeating ? "Add repeating to-do" : "Add to list"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Adds steps to a task after its existing ones, skipping titles it already has. */
function useAppendSteps() {
  const { stepsByTask } = useModel();
  const createStep = useCreateStep();
  return (taskId: string, steps: { title: string; estimate_min: number | null }[]) => {
    const existing = stepsByTask.get(taskId) ?? [];
    const have = new Set(existing.map((s) => s.title.trim().toLowerCase()));
    let order = existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
    for (const s of steps) {
      if (have.has(s.title.trim().toLowerCase())) continue;
      createStep.mutate({
        tempId: tempId(),
        body: { task_id: taskId, title: s.title, estimate_min: s.estimate_min, order: order++ },
      });
    }
  };
}

/** Proposed steps for a task; accepting appends them to its checklist. */
export function StepsCard({ messageId, index, resolved, block }: CardProps<"steps">) {
  const { taskById } = useModel();
  const resolve = useResolveCard();
  const openTask = useOpenTask();
  const append = useAppendSteps();
  const task = taskById.get(block.task_id);
  const key = `${index}:steps`;
  if (!task) return null;

  return (
    <div className={cardShell}>
      <div className={cardHeader}>
        <ListTree className="h-3 w-3" />
        <span className="truncate">Steps · {task.title}</span>
      </div>
      <ol className="px-3 py-1.5">
        {block.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 py-1.5 text-[13px] text-ink">
            <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line-strong" aria-hidden="true" />
            <span className="w-3 shrink-0 text-[12px] text-faint tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 leading-snug">{s.title}</span>
            {s.estimate_min && <span className="shrink-0 text-[11px] text-faint">{formatMinutes(s.estimate_min)}</span>}
          </li>
        ))}
      </ol>
      <div className={cardFooter}>
        {resolved[key] ? (
          <span className={doneNote}>
            <Check className="h-3.5 w-3.5" />
            Added {block.steps.length} steps
          </span>
        ) : (
          <button
            type="button"
            disabled={isTemp(task.id)}
            onClick={() => {
              resolve.mutate({ messageId, entries: { [key]: "added" } });
              append(task.id, block.steps);
            }}
            className={primaryBtn}
          >
            Add {block.steps.length} steps
          </button>
        )}
        <button type="button" onClick={() => openTask(task.id)} className={linkBtn}>
          Open task
        </button>
      </div>
    </div>
  );
}

/** Free time on a day, as chips. */
export function SlotsCard({ block }: { block: Of<"slots"> }) {
  const { settings } = useModel();
  if (!block.slots.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {block.slots.map((s) => (
        <li
          key={s.start}
          className="rounded-md border border-dashed border-open-line bg-open px-2 py-1 text-[12px] text-open-ink tabular-nums"
        >
          {fmtTime(s.start, settings.timezone)}–{fmtTime(s.end, settings.timezone)} ·{" "}
          {formatMinutes((Date.parse(s.end) - Date.parse(s.start)) / 60_000)}
        </li>
      ))}
    </ul>
  );
}

function ResourceRows({ resources }: { resources: ResearchResource[] }) {
  return (
    <ul className="px-1.5 py-1">
      {resources.map((r) => (
        <li key={r.url}>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={r.note || r.url}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[12px] text-chip-ink hover:bg-row-hover hover:text-ink"
          >
            <span className="min-w-0 flex-1 truncate">
              {r.title}
              <span className="text-faint">
                {" · "}
                {linkLabel(r.url)}
                {r.minutes ? ` · ${formatMinutes(r.minutes)}` : ""}
              </span>
            </span>
            <ArrowUpRight className="h-3 w-3 shrink-0 text-faint" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Sources or resources, e.g. behind an explanation. */
export function LinksCard({ block }: { block: Of<"links"> }) {
  return (
    <div className={cardShell}>
      <div className={cardHeader}>{block.label}</div>
      <ResourceRows resources={block.resources} />
    </div>
  );
}

type IdeaType = IdeaKind | "idea";

/** A shaped Someday idea: tweak type and timeframe, then park it (or add steps to the existing item). */
export function IdeaPlanCard({ messageId, index, resolved, block }: CardProps<"idea">) {
  const { lists, taskById } = useModel();
  const resolve = useResolveCard();
  const openTask = useOpenTask();
  const addSomeday = useAddSomeday();
  const updateTask = useUpdateTask();
  const append = useAppendSteps();
  const today = usePlanToday();
  const plan = block.plan;
  const somedayLists = lists.filter((l) => l.kind === "someday" && !isTemp(l.id));
  const existing = plan.task_id ? taskById.get(plan.task_id) : undefined;
  const [kind, setKind] = useState<IdeaType>(plan.idea_kind ?? "idea");
  const [horizon, setHorizon] = useState<Horizon>(plan.horizon);
  const [listId, setListId] = useState(somedayLists[0]?.id ?? "");
  const key = `${index}:idea`;
  const done = resolved[key];
  const [doneId, where] = done ? done.split("|") : [];
  const steps = plan.steps.map((title) => ({ title, estimate_min: null }));
  const ideaKind = kind === "idea" ? null : kind;
  const listName = somedayLists.find((l) => l.id === listId)?.name ?? "Someday";

  const park = (toToday: boolean) => {
    if (done) return;
    if (existing) {
      resolve.mutate({ messageId, entries: { [key]: `${existing.id}|${toToday ? "today" : "steps"}` } });
      append(existing.id, steps);
      updateTask.mutate({ id: existing.id, patch: { idea_kind: ideaKind, horizon } });
      if (toToday) today.plan(existing.id);
      return;
    }
    resolve.mutate({ messageId, entries: { [key]: `pending|${toToday ? "today" : "parked"}` } });
    void addSomeday(
      { title: plan.title, link_url: plan.link_url, idea_kind: ideaKind, horizon },
      {
        listId: listId || undefined,
        onAdded: (task) => {
          append(task.id, steps);
          // The card's places to start and estimate become the item's research card.
          if (plan.resources.length || plan.estimate_min) {
            updateTask.mutate({
              id: task.id,
              patch: {
                research: {
                  status: "done",
                  error: null,
                  resources: plan.resources,
                  total_min: plan.estimate_min,
                  span: null,
                  session_min: null,
                  basis: null,
                  requested_at: new Date().toISOString(),
                },
              },
            });
          }
          if (toToday) today.plan(task.id);
          resolve.mutate({ messageId, entries: { [key]: `${task.id}|${toToday ? "today" : "parked"}` } });
        },
      },
    );
  };

  return (
    <div className={cardShell}>
      <div className="px-3 pt-2.5 pb-3">
        <p className="text-[13px] font-medium text-ink">{existing?.title ?? plan.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Segmented<IdeaType>
            label="Type"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "goal", label: "Goal" },
              { value: "learn", label: "Learn" },
              { value: "idea", label: "Idea" },
            ]}
          />
          <label className="relative flex h-7 items-center gap-1 rounded-md border border-line bg-surface pr-2 pl-2.5 text-[12px] text-chip-ink hover:bg-row">
            {HORIZON_LABEL[horizon]}
            <ChevronDown className="h-3 w-3 text-faint" />
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as Horizon)}
              aria-label="Timeframe"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {(["month", "year", "someday"] as Horizon[]).map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABEL[h]}
                </option>
              ))}
            </select>
          </label>
          {plan.estimate_min && (
            <span className="inline-flex h-7 items-center gap-1 px-1 text-[12px] text-muted" title="Rough total effort">
              <Clock className="h-3 w-3 text-faint" />~{formatMinutes(plan.estimate_min)}
            </span>
          )}
        </div>
      </div>

      {plan.steps.length > 0 && (
        <>
          <div className={cardHeader}>First steps</div>
          <ol className="px-3 py-1.5">
            {plan.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 py-1.5 text-[13px] leading-snug text-ink">
                <span className="w-3 shrink-0 text-[12px] text-faint tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">{s}</span>
                {i === 0 && (
                  <span className="shrink-0 rounded-md bg-open px-1.5 py-px text-[11px] text-open-ink">Start here</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {plan.resources.length > 0 && (
        <>
          <div className={cardHeader}>Places to start</div>
          <ResourceRows resources={plan.resources} />
        </>
      )}

      <div className={`${cardFooter} flex-wrap`}>
        {done ? (
          <>
            <span className={doneNote}>
              <Check className="h-3.5 w-3.5" />
              {where === "steps"
                ? plan.steps.length
                  ? "Steps added"
                  : "Saved"
                : where === "today"
                  ? "On My day"
                  : `Parked in ${listName}`}
            </span>
            {doneId && doneId !== "pending" && (
              <button type="button" onClick={() => openTask(doneId)} className={linkBtn}>
                Open
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => park(false)} className={primaryBtn}>
              {existing
                ? plan.steps.length
                  ? `Add ${plan.steps.length} steps`
                  : "Save type and timeframe"
                : "Park in Someday"}
            </button>
            <button type="button" onClick={() => park(true)} className={secondaryBtn}>
              <Sun className="h-3.5 w-3.5" />
              {existing ? "Add + start today" : "Park + start today"}
            </button>
            {!existing && somedayLists.length > 1 && (
              <label className="relative ml-auto flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-muted hover:bg-row-hover hover:text-ink">
                {listName}
                <ChevronDown className="h-3 w-3" />
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                  aria-label="Someday list"
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {somedayLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}
