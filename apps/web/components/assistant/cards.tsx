"use client";

import { Fragment, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Flag,
  ListTree,
  Repeat,
  Sun,
} from "lucide-react";
import {
  HORIZON_LABEL,
  endPosition,
  fmtDay,
  fmtTime,
  isTemp,
  taskColor,
  tempId,
  useAddSomeday,
  useAddToPlan,
  useCreateBlock,
  useCreateStep,
  useCreateTask,
  useModel,
  useResolveCard,
  useUpdateTask,
} from "@tt/client";
import {
  formatMinutes,
  isRecurring,
  linkLabel,
  localDate,
  swatch,
  type AssistantBlock,
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
  "flex items-center gap-1.5 border-b border-line-soft px-3 py-2 text-[11px] tracking-[0.08em] text-faint uppercase";
const cardFooter = "flex items-center gap-2 border-t border-line-soft bg-row px-3 py-2";
const primaryBtn =
  "inline-flex h-7 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12px] text-white transition-colors hover:bg-[#27272A] focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:opacity-40";
const secondaryBtn =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink transition-colors hover:bg-row-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:opacity-40";
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
  const { taskById, listById, stepsByTask, planByDate, settings } = useModel();
  const createBlock = useCreateBlock();
  const addToPlan = useAddToPlan();
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

  const create = (j: number) => {
    const p = block.picks[j]!;
    createBlock.mutate({ tempId: tempId(), body: { task_id: p.task_id, step_id: p.step_id, start: p.start, end: p.end } });
  };
  /**
   * Each block's to-do (or step) also goes on that day's plan in My day, after what's there,
   * unless it's already planned that day. Routines aren't planned; they show every day anyway.
   */
  const plan = (js: number[]) => {
    const queued = new Map<string, number>();
    const seen = new Set<string>();
    for (const j of js) {
      const p = block.picks[j]!;
      const task = live[j];
      if (!task || isRecurring(task)) continue;
      const date = dayOfPick[j]!;
      const items = planByDate.get(date) ?? [];
      const key = `${date}:${p.task_id}:${p.step_id ?? ""}`;
      const planned = items.some((i) => i.task_id === p.task_id && (i.step_id ?? null) === p.step_id);
      if (planned || seen.has(key)) continue;
      seen.add(key);
      const n = queued.get(date) ?? 0;
      queued.set(date, n + 1);
      addToPlan.mutate({
        tempId: tempId(),
        body: { task_id: p.task_id, step_id: p.step_id, plan_date: date, position: endPosition(items) + n },
      });
    }
  };
  const accept = (js: number[]) => {
    resolve.mutate({ messageId, entries: Object.fromEntries(js.map((j) => [keyOf(j), "added"])) });
    js.forEach(create);
    plan(js);
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
          const step = p.step_id ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id) : undefined;
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
                      {step && <span className="text-muted"> · {step.title}</span>}
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
                      aria-label={`Add ${task.title} at ${fmtTime(p.start, tz)}${multiDay ? ` on ${dayLabel(dayOfPick[j]!, "short")}` : ""}`}
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

const PRIORITY = { high: "High", med: "Medium", low: "Low", none: "" } as const;
const REPEAT = { daily: "Every day", weekdays: "Weekdays", custom: "Custom", none: "" } as const;

/** A to-do the assistant parsed. Title and list stay editable until it's added. */
export function DraftCard({ messageId, index, resolved, block }: CardProps<"draft">) {
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const resolve = useResolveCard();
  const openTask = useOpenTask();
  const today = usePlanToday();
  const d = block.draft;
  const normal = lists.filter((l) => l.kind !== "someday" && !isTemp(l.id));
  const [title, setTitle] = useState(d.title);
  const [listId, setListId] = useState<string | null>(
    d.list_id && listById.has(d.list_id) ? d.list_id : (normal[0]?.id ?? null),
  );
  const key = `${index}:draft`;
  const created = resolved[key];
  const [createdId, where] = created ? created.split("|") : [];
  const repeating = d.repeat !== "none";
  const list = listId ? listById.get(listId) : undefined;

  const add = (toToday: boolean) => {
    if (!title.trim() || created) return;
    resolve.mutate({ messageId, entries: { [key]: `pending|${toToday ? "today" : "list"}` } });
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
        onSuccess: (task) => {
          if (toToday) today.plan(task.id);
          resolve.mutate({ messageId, entries: { [key]: `${task.id}|${toToday ? "today" : "list"}` } });
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
            <span className={doneNote}>
              <Check className="h-3.5 w-3.5" />
              Added to {list?.name ?? "your to-dos"}
              {where === "today" ? " and today's plan" : ""}
            </span>
            {createdId && createdId !== "pending" && (
              <button type="button" onClick={() => openTask(createdId)} className={linkBtn}>
                Open
              </button>
            )}
          </>
        ) : (
          <>
            {!repeating && (
              <button type="button" onClick={() => add(true)} disabled={!title.trim()} className={primaryBtn}>
                <Sun className="h-3.5 w-3.5" />
                Add to today
              </button>
            )}
            <button
              type="button"
              onClick={() => add(false)}
              disabled={!title.trim()}
              className={repeating ? primaryBtn : secondaryBtn}
            >
              {repeating ? "Add repeating to-do" : "Just add to list"}
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
        <p className="text-[14px] text-ink">{existing?.title ?? plan.title}</p>
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
