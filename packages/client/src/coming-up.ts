"use client";

import { useMemo } from "react";
import { addDays, rankComingUp, zonedInstant, type ComingUpReason } from "@tt/shared";
import { useModel } from "./data";
import { useDueRail, type RailItem } from "./due-rail";

/** How far ahead My day looks for to-dos that aren't started, overdue or at risk. */
export const COMING_UP_DAYS = 14;

export type ComingUpItem = RailItem & { reason: ComingUpReason };

/**
 * Open to-dos My day should surface for `date` (a local date), most urgent first: overdue,
 * short on time, ones to start by the end of that day or already started (start_date), then
 * the rest due in the next two weeks by when work needs to start. Leaves out to-dos already
 * planned for that date and ones whose remaining work is all on the calendar.
 */
export function useComingUp(now: number, date: string): ComingUpItem[] {
  const { planByDate, settings } = useModel();
  const tz = settings.timezone;
  // 30 days so started to-dos due later than the two-week window still show.
  const { items, undated } = useDueRail(now, 30);
  const plan = planByDate.get(date);

  return useMemo(() => {
    const planned = new Set((plan ?? []).map((p) => p.task_id));
    const startedUndated = undated.filter((i) => i.task.start_date && i.task.start_date <= date);
    return rankComingUp(
      [...items, ...startedUndated].filter((i) => !planned.has(i.task.id)),
      {
        date,
        dayEnd: zonedInstant(addDays(date, 1), "00:00", tz).getTime(),
        horizonEnd: zonedInstant(addDays(date, COMING_UP_DAYS + 1), "00:00", tz).getTime(),
      },
    );
  }, [items, undated, plan, date, tz]);
}
