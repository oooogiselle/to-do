"use client";

import { useState } from "react";
import {
  addDays,
  buildPlanDays,
  isRecurring,
  localDate,
  placePicks,
  schedulingPrefs,
  zonedInstant,
  type FittedPick,
  type PickRequest,
  type Task,
} from "@tt/shared";
import { endPosition, tempId, useAddToPlan, useCreateBlock, useEvents, useModel } from "./data";

/** Days a new to-do can be booked into: today and the next six, like Ask tt.'s planner. */
const HORIZON_DAYS = 7;

/**
 * Puts each block's to-do (or step) on that day's My day, after what's there, unless it's
 * already planned that day. Routines aren't planned; they show every day anyway.
 */
export function usePlanBlocks() {
  const { planByDate, settings } = useModel();
  const addToPlan = useAddToPlan();
  return (items: { task: Task; step_id: string | null; start: string }[]) => {
    const queued = new Map<string, number>();
    const seen = new Set<string>();
    for (const { task, step_id, start } of items) {
      if (isRecurring(task)) continue;
      const date = localDate(new Date(start), settings.timezone);
      const key = `${date}:${task.id}:${step_id ?? ""}`;
      const plan = planByDate.get(date) ?? [];
      const planned = plan.some((i) => i.task_id === task.id && (i.step_id ?? null) === step_id);
      if (planned || seen.has(key)) continue;
      seen.add(key);
      const n = queued.get(date) ?? 0;
      queued.set(date, n + 1);
      addToPlan.mutate({
        tempId: tempId(),
        body: { task_id: task.id, step_id, plan_date: date, position: endPosition(plan) + n },
      });
    }
  };
}

/**
 * Books a just-created to-do into the user's free time this week, by the same rules Ask tt.'s
 * planner uses (focus window, longest session, breaks, daily cap, never after the due date),
 * then puts it on My day for each booked day. Work longer than one session is split into
 * even sessions spread over the week.
 */
export function useScheduleNew() {
  const { blocks, settings } = useModel();
  const createBlock = useCreateBlock();
  const planBlocks = usePlanBlocks();
  const tz = settings.timezone;
  // Fixed for the caller's lifetime so the events query key stays stable.
  const [range] = useState(() => {
    const now = Date.now();
    const end = zonedInstant(addDays(localDate(new Date(now), tz), HORIZON_DAYS), "00:00", tz).getTime();
    return { from: Math.floor(now / 60_000) * 60_000, to: end };
  });
  const { data } = useEvents(range.from, range.to);

  /**
   * Resolves once the blocks are saved. `booked` is what made it onto the calendar; `failed`
   * counts blocks the server refused (e.g. Google Calendar isn't connected).
   */
  const schedule = async (task: Task): Promise<{ booked: FittedPick[]; failed: number; noRoom: boolean }> => {
    const now = Date.now();
    const prefs = schedulingPrefs(settings.scheduling);
    const days = buildPlanDays({
      events: data?.events ?? [],
      blocks,
      workingHours: settings.working_hours,
      timezone: tz,
      now,
      days: HORIZON_DAYS,
      breakMin: prefs.break_min,
    });
    const need = task.estimate_min ?? settings.default_block_min;
    const sessions = Math.max(1, Math.ceil(need / prefs.max_session_min));
    const each = Math.ceil(need / sessions / 15) * 15;
    const picks: PickRequest[] = Array.from({ length: sessions }, () => ({
      task_id: task.id,
      step_id: null,
      date: null,
      when: "any",
      duration_min: each,
      reason: "",
    }));
    const { placed } = placePicks({
      picks,
      days,
      known: new Map([[task.id, new Set<string>()]]),
      dueOf: new Map(task.due_at ? [[task.id, Date.parse(task.due_at)]] : []),
      prefs,
      now,
      timezone: tz,
    });

    const results = await Promise.allSettled(
      placed.map((p) =>
        createBlock.mutateAsync({
          tempId: tempId(),
          body: { task_id: p.task_id, step_id: null, start: p.start, end: p.end },
        }),
      ),
    );
    const booked = placed.filter((_, i) => results[i]!.status === "fulfilled");
    planBlocks(booked.map((p) => ({ task, step_id: null, start: p.start })));
    return { booked, failed: placed.length - booked.length, noRoom: placed.length === 0 };
  };

  return { ready: !!data, schedule };
}
