"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  addDays,
  findFreeSlots,
  formatMinutes,
  isDoneOn,
  isRecurring,
  localDate,
  occursOn,
  parseQuickAdd,
  zonedInstant,
  type Task,
} from "@tt/shared";
import {
  endPosition,
  fmtDay,
  fmtDue,
  fmtRelDay,
  tempId,
  useAddToPlan,
  useComingUp,
  useCreateTask,
  useEvents,
  useModel,
  type ComingUpItem,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { DailySection } from "./daily-section";
import { useCalendarAnchor, dayLabel } from "./calendar-dates";
import { PlanItem } from "./plan-item";
import { useDragState } from "./workspace-dnd";

/** Coming up rows shown before "Show more". */
const COMING_UP_SHOWN = 5;

const navBtn =
  "grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-chip-ink hover:bg-row hover:text-ink";

/**
 * My day: the to-dos planned for one date, in order, plus the repeating to-dos that come up
 * that day. The date follows the Day pane, so stepping one steps the other.
 */
export function PlanPane({ pane, now }: { pane: string; now: number }) {
  const { tasks, taskById, blocks, lists, planByDate, settings } = useModel();
  const tz = settings.timezone;
  const today = localDate(new Date(now), tz);
  const [anchor, setAnchor] = useCalendarAnchor("today");
  const date = anchor ?? today;
  const step = (n: number) => setAnchor(addDays(date, n) === today ? null : addDays(date, n));

  const createTask = useCreateTask();
  const addToPlan = useAddToPlan();
  const { planTarget } = useDragState();
  const [draft, setDraft] = useState("");

  const entries = (planByDate.get(date) ?? [])
    .map((item) => ({ item, task: taskById.get(item.task_id) }))
    .filter((e): e is { item: typeof e.item; task: Task } => !!e.task && !isRecurring(e.task));
  const routines = tasks.filter((t) => t.status === "open" && isRecurring(t) && occursOn(t, date));

  const doneCount =
    entries.filter((e) => e.task.status === "done").length +
    routines.filter((t) => isDoneOn(t, date)).length;
  const totalCount = entries.length + routines.length;
  const estimate = (t: Task) => t.estimate_min ?? settings.default_block_min;
  const plannedMin =
    entries.filter((e) => e.task.status !== "done").reduce((s, e) => s + estimate(e.task), 0) +
    routines.filter((t) => !isDoneOn(t, date)).reduce((s, t) => s + estimate(t), 0);

  // Free time left in the day's working hours, after events and blocks (and, today, after now).
  const dayStart = zonedInstant(date, "00:00", tz).getTime();
  const dayEnd = zonedInstant(addDays(date, 1), "00:00", tz).getTime();
  const { data: eventData } = useEvents(dayStart, dayEnd);
  const isPast = date < today;
  const freeMin = useMemo(() => {
    if (isPast) return 0;
    const slots = findFreeSlots([...(eventData?.events ?? []), ...blocks], {
      workingHours: settings.working_hours,
      timezone: tz,
      from: Math.max(dayStart, date === today ? now : 0),
      to: dayEnd,
    });
    return Math.round(slots.reduce((s, iv) => s + (iv.end - iv.start) / 60_000, 0));
  }, [isPast, eventData, blocks, settings.working_hours, tz, dayStart, dayEnd, date, today, now]);
  const overbooked = plannedMin > freeMin;

  const openTask = useOpenTask();
  const comingUp = useComingUp(now, date);
  const [showAllComingUp, setShowAllComingUp] = useState(false);
  const shownComingUp = showAllComingUp ? comingUp : comingUp.slice(0, COMING_UP_SHOWN);

  /** Why a to-do is in Coming up, as a short label, and whether it's urgent. */
  const comingUpHint = ({ reason, task, startBy }: ComingUpItem) => {
    const thisDay = date === today ? "today" : "this day";
    switch (reason) {
      case "overdue":
        return { text: "Overdue", urgent: true };
      case "at-risk":
        return { text: "Short on time", urgent: true };
      case "start-today":
        return { text: `Start ${thisDay}`, urgent: true };
      case "started":
        return task.start_date === date
          ? { text: `Starts ${thisDay}`, urgent: false }
          : { text: `Started ${fmtRelDay(zonedInstant(task.start_date!, "12:00", tz), tz, now)}`, urgent: false };
      case "upcoming":
        return { text: `Start by ${fmtRelDay(startBy ?? Date.parse(task.due_at!), tz, now)}`, urgent: false };
    }
  };

  const plan = (task: Pick<Task, "id">) =>
    addToPlan.mutate({
      tempId: tempId(),
      body: {
        task_id: task.id,
        plan_date: date,
        position: endPosition(planByDate.get(date)),
      },
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseQuickAdd(draft, { lists, now: new Date(now), timezone: tz });
    if (!parsed.title) return;
    createTask.mutate(
      { tempId: tempId(), body: parsed },
      { onSuccess: (task) => parsed.repeat === "none" && plan(task) },
    );
    setDraft("");
  };

  const dropAt = planTarget?.date === date ? planTarget.index : null;
  const dropLine = <li aria-hidden="true" className="h-[3px] rounded-full bg-sun" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        data-plan-zone={date}
        className={`min-h-0 flex-1 overflow-y-auto transition-colors ${dropAt !== null ? "bg-warn-bg/40" : ""}`}
      >
        <div className="mx-auto w-full max-w-[640px] px-6 py-6">
          <header className="flex items-center gap-1.5">
            <div className="mr-auto min-w-0">
              <h2 className="flex items-center gap-2 truncate text-[18px] font-medium tracking-tight text-ink">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sun" />
                {dayLabel(date, today, tz)}
              </h2>
              <p className="mt-0.5 pl-4 text-[13px] text-muted">{fmtDay(date, tz, "long")}</p>
            </div>
            <button type="button" className={navBtn} onClick={() => step(-1)} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {date !== today && (
              <button
                type="button"
                onClick={() => setAnchor(null)}
                className="h-7 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink hover:bg-row"
              >
                Today
              </button>
            )}
            <button type="button" className={navBtn} onClick={() => step(1)} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </button>
          </header>

          <p className="mt-4 text-[12px] text-muted">
            {doneCount} of {totalCount} done · {formatMinutes(plannedMin)} planned ·{" "}
            <span className={overbooked && !isPast ? "text-risk" : ""}>
              {formatMinutes(freeMin)} free
              {overbooked && !isPast ? ` (over by ${formatMinutes(plannedMin - freeMin)})` : ""}
            </span>
          </p>
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line-soft"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-valuenow={doneCount}
            aria-label="To-dos done"
          >
            <div
              className="h-full rounded-full bg-mint transition-all"
              style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : "0%" }}
            />
          </div>

          <div className="mt-6">
            <DailySection date={date} routines={routines} paneKey={pane} />
          </div>

          <section className="mt-7" aria-label={`Plan for ${fmtDay(date, tz, "long")}`}>
            <h3 className="px-1 pb-1 text-[11px] tracking-[0.08em] text-faint uppercase">Plan</h3>
            <ol className="min-h-[60px] rounded-lg">
              {entries.map(({ item, task }, i) => (
                <Fragment key={item.id}>
                  {dropAt === i && dropLine}
                  <PlanItem item={item} task={task} date={date} paneKey={pane} />
                </Fragment>
              ))}
              {dropAt === entries.length && entries.length > 0 && dropLine}
              {entries.length === 0 && (
                <li className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-faint">
                  Nothing planned yet — drag a to-do here or type one below.
                </li>
              )}
            </ol>
            <form
              onSubmit={submit}
              className="mt-1 flex items-center gap-3 rounded-lg py-2 pr-1 pl-3 hover:bg-row"
            >
              <Plus className="h-4 w-4 shrink-0 text-faint" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a to-do"
                aria-label="Add a to-do for this day"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
              />
            </form>
          </section>

          {!isPast && comingUp.length > 0 && (
            <section className="mt-7" aria-label="Coming up">
              <h3 className="px-1 pb-1 text-[11px] tracking-[0.08em] text-faint uppercase">
                Coming up · add to this day
              </h3>
              <ul>
                {shownComingUp.map((item) => {
                  const t = item.task;
                  const hint = comingUpHint(item);
                  return (
                    <li
                      key={t.id}
                      className="group flex items-center gap-3 rounded-lg py-1.5 pr-1 pl-2 hover:bg-row"
                    >
                      <button
                        type="button"
                        onClick={() => plan(t)}
                        aria-label={`Add ${t.title} to this day`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted hover:text-ink"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openTask(t.id)}
                        className="min-w-0 flex-1 truncate text-left text-[13px] text-chip-ink hover:text-ink"
                      >
                        {t.title}
                      </button>
                      <span
                        className={`shrink-0 text-[11px] ${hint.urgent ? "text-risk" : "text-muted"}`}
                        title={
                          item.estimated
                            ? `${formatMinutes(item.neededMin)} of work not on the calendar yet`
                            : "No estimate yet, so this assumes your default block length"
                        }
                      >
                        {hint.text}
                        {t.due_at && (
                          <span className="text-faint">
                            {" "}
                            · due{" "}
                            {fmtDue(t.due_at, tz, now).replace(/^(Today|Tomorrow|Yesterday)/, (w) =>
                              w.toLowerCase(),
                            )}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {comingUp.length > COMING_UP_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllComingUp((v) => !v)}
                  className="mt-1 px-2 text-[12px] text-muted hover:text-ink"
                >
                  {showAllComingUp ? "Show less" : `Show ${comingUp.length - COMING_UP_SHOWN} more`}
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
