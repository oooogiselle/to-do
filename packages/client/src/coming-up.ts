"use client";

import { useMemo } from "react";
import {
  addDays,
  rankComingUp,
  urgencyReason,
  zonedInstant,
  type ComingUpReason,
  type Step,
} from "@tt/shared";
import { useModel } from "./data";
import { useDueRail, type RailItem } from "./due-rail";

/** How far ahead My day looks for to-dos that aren't started, overdue or at risk. */
export const COMING_UP_DAYS = 14;
/** Steps shown under each to-do in Coming up. */
const STEPS_SHOWN = 3;

export type ComingUpStep = {
  step: Step;
  /** From the step's own due date; null when it just follows the task. */
  reason: Exclude<ComingUpReason, "started"> | null;
  startBy: number | null;
};

export type ComingUpItem = RailItem & { reason: ComingUpReason; nextSteps: ComingUpStep[] };

/**
 * Open to-dos My day should surface for `date` (a local date), most urgent first: overdue,
 * short on time, ones to start by the end of that day or already started (start_date), then
 * the rest due in the next two weeks by when work needs to start. Each carries its next open
 * steps that aren't planned for that day, so a big task can be taken on one step at a time.
 * Leaves out to-dos already planned whole for that date, ones whose open steps are all
 * planned, and ones whose remaining work is all on the calendar.
 */
export function useComingUp(now: number, date: string): ComingUpItem[] {
  const { planByDate, settings } = useModel();
  const tz = settings.timezone;
  // 30 days so started to-dos due later than the two-week window still show.
  const { items, undated } = useDueRail(now, 30);
  const plan = planByDate.get(date);

  return useMemo(() => {
    const plannedTasks = new Set((plan ?? []).filter((p) => !p.step_id).map((p) => p.task_id));
    const plannedSteps = new Set((plan ?? []).map((p) => p.step_id).filter(Boolean));
    const dayEnd = zonedInstant(addDays(date, 1), "00:00", tz).getTime();
    const startedUndated = undated.filter((i) => i.task.start_date && i.task.start_date <= date);

    const ranked = rankComingUp(
      [...items, ...startedUndated].filter((i) => !plannedTasks.has(i.task.id)),
      {
        date,
        dayEnd,
        horizonEnd: zonedInstant(addDays(date, COMING_UP_DAYS + 1), "00:00", tz).getTime(),
      },
    );
    const out: ComingUpItem[] = [];
    for (const item of ranked) {
      const open = item.steps.filter((s) => !plannedSteps.has(s.id));
      // Every open step is already on this day.
      if (item.steps.length && !open.length) continue;
      const steps = open
        .map((step, i) => {
          const u = item.stepUrgency.get(step.id);
          return {
            step,
            i,
            reason: u ? urgencyReason(u, dayEnd) : null,
            startBy: u?.startBy ?? null,
          };
        })
        // Steps whose own deadline is pressing first, then in order.
        .sort((a, b) => pressing(a.reason) - pressing(b.reason) || a.i - b.i)
        .slice(0, STEPS_SHOWN)
        .map(({ step, reason, startBy }) => ({ step, reason, startBy }));
      out.push({ ...item, nextSteps: steps });
    }
    return out;
  }, [items, undated, plan, date, tz]);
}

const pressing = (r: ComingUpStep["reason"]) =>
  r === "overdue" ? 0 : r === "at-risk" ? 1 : r === "start-today" ? 2 : 3;
