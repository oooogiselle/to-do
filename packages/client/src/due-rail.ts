"use client";

import { useMemo } from "react";
import { dueRisk, findFreeSlots, isRecurring, latestStart, type CalendarEvent, type Step, type Task } from "@tt/shared";
import { useEvents, useModel } from "./data";
import { isSomedayTask } from "./someday";

/** A task scheduled whole becomes one block of its remaining estimated work, in 15-minute steps. */
export const dragMinutes = (min: number) =>
  Math.min(Math.max(Math.ceil(min / 15) * 15, 15), 12 * 60);

export const DUE_RANGES = [7, 14, 30] as const;
export type DueRange = (typeof DUE_RANGES)[number];

export type RailItem = {
  task: Task;
  steps: Step[];
  neededMin: number;
  /** False when neither the task nor its steps have an estimate (the default length is used). */
  estimated: boolean;
  freeMin: number;
  atRisk: boolean;
  overdue: boolean;
  /** Latest time work can start and still fit before the deadline (null: undated, overdue, or it doesn't fit). */
  startBy: number | null;
  /** Start of the task's most recent whole-task block that has already ended, if any. */
  plannedAt?: number;
};

/**
 * Open tasks due in the next `days` days (plus anything overdue) that still have unscheduled
 * work, soonest first, flagged when the open time left before the deadline can't cover that
 * work. `undated` holds open tasks without a due date (except someday ideas), oldest first.
 */
export function useDueRail(now: number, days: DueRange) {
  const { tasks, listById, stepsByTask, blocks, settings } = useModel();
  const tz = settings.timezone;
  // Whole hours so the events query key doesn't change every minute.
  const from = Math.floor(now / 3_600_000) * 3_600_000;
  const to = from + days * 86_400_000;
  const { data } = useEvents(from, to);
  const events: CalendarEvent[] = useMemo(() => data?.events ?? [], [data]);

  // Start of the most recent block that has already ended: per task for whole-task blocks,
  // per step for step blocks (each shown on its own row in the rail).
  const lastPast = useMemo(() => {
    const byTask = new Map<string, number>();
    const byStep = new Map<string, number>();
    const later = (m: Map<string, number>, id: string, t: number) =>
      t > (m.get(id) ?? -Infinity) && m.set(id, t);
    for (const b of blocks) {
      if (Date.parse(b.end) > now) continue;
      if (b.step_id) later(byStep, b.step_id, Date.parse(b.start));
      else later(byTask, b.task_id, Date.parse(b.start));
    }
    return { byTask, byStep };
  }, [blocks, now]);

  const { items, undated } = useMemo(() => {
    const free = findFreeSlots([...events, ...blocks], {
      workingHours: settings.working_hours,
      timezone: tz,
      from: now,
      to: Math.max(to, now),
    });
    // A step without an estimate drags as the default block, so count it as that much work.
    const stepMin = (s: Step) => dragMinutes(s.estimate_min ?? settings.default_block_min);
    /** Work on `task` not yet covered by upcoming blocks, and its steps that have none. */
    const remainingWork = (task: Task) => {
      const steps = stepsByTask.get(task.id) ?? [];
      const undone = steps.filter((s) => !s.done);
      const estimated = !!task.estimate_min || steps.some((s) => s.estimate_min);
      const remaining = undone.some((s) => s.estimate_min)
        ? undone.reduce((sum, s) => sum + stepMin(s), 0)
        : (task.estimate_min ?? settings.default_block_min);
      const scheduledMin = blocks
        .filter((b) => b.task_id === task.id && Date.parse(b.end) > now)
        .reduce(
          (sum, b) => sum + (Date.parse(b.end) - Math.max(Date.parse(b.start), now)) / 60_000,
          0,
        );
      // Steps not yet done and without an upcoming block of their own.
      const scheduledSteps = new Set(
        blocks.filter((b) => b.step_id && Date.parse(b.end) > now).map((b) => b.step_id),
      );
      const openSteps = undone.filter((s) => !scheduledSteps.has(s.id));
      // Scheduling step by step keeps the task here until every step has a block. A block for
      // the whole task covers its steps, so then only the total counts.
      const wholeTaskBlock = blocks.some(
        (b) => b.task_id === task.id && !b.step_id && Date.parse(b.end) > now,
      );
      const stepsLeft = wholeTaskBlock ? 0 : openSteps.reduce((sum, s) => sum + stepMin(s), 0);
      return { openSteps, estimated, neededMin: Math.max(remaining - scheduledMin, stepsLeft) };
    };

    const items: RailItem[] = [];
    const undated: RailItem[] = [];
    for (const task of tasks) {
      // Routines are checked off per day on My day; they never come due.
      if (task.status !== "open" || isRecurring(task)) continue;
      const plannedAt = lastPast.byTask.get(task.id);
      if (!task.due_at) {
        // Someday ideas have no deadline on purpose; they live on the Someday page.
        if (isSomedayTask(task, listById)) continue;
        const work = remainingWork(task);
        if (work.neededMin <= 0) continue;
        undated.push({
          task,
          steps: work.openSteps,
          neededMin: work.neededMin,
          estimated: work.estimated,
          freeMin: 0,
          atRisk: false,
          overdue: false,
          startBy: null,
          plannedAt,
        });
        continue;
      }
      const due = Date.parse(task.due_at);
      const overdue = due < now;
      if (!overdue && due >= to) continue;

      const work = remainingWork(task);
      const risk = dueRisk({
        dueAt: due,
        remainingEstimateMin: work.neededMin,
        scheduledMin: 0,
        freeSlots: free,
      });
      if (risk.neededMin <= 0) continue;
      items.push({
        task,
        steps: work.openSteps,
        ...risk,
        estimated: work.estimated,
        atRisk: overdue || risk.atRisk,
        overdue,
        startBy: overdue
          ? null
          : latestStart({ dueAt: due, neededMin: risk.neededMin, freeSlots: free }),
        plannedAt,
      });
    }
    items.sort((a, b) => Date.parse(a.task.due_at!) - Date.parse(b.task.due_at!));
    undated.sort((a, b) => a.task.created_at.localeCompare(b.task.created_at));
    return { items, undated };
  }, [tasks, listById, stepsByTask, blocks, events, settings, tz, to, now, lastPast]);

  return { items, undated, stepPlannedAt: lastPast.byStep };
}
