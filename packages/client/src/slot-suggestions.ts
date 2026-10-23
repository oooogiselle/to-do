"use client";

import { useMemo, useState } from "react";
import { findFreeSlots, rankSlots, type SlotSuggestion, type Task } from "@tt/shared";
import { tempId, useCreateBlock, useEvents, useModel } from "./data";

const HORIZON_DAYS = 14;

/** Rule-based top-3 open slots for a task's remaining work, before its due date. */
export function useSlotSuggestions(task: Task) {
  const { blocks, stepsByTask, settings } = useModel();
  const createBlock = useCreateBlock();
  const tz = settings.timezone;
  // Fixed for the caller's lifetime so the events query key stays stable.
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const due = task.due_at ? Date.parse(task.due_at) : null;
  const horizon = Math.min(due ?? Infinity, now + HORIZON_DAYS * 86_400_000);
  const { data, isLoading } = useEvents(now, Math.max(horizon, now + 60_000));

  const steps = stepsByTask.get(task.id) ?? [];
  const taskBlocks = blocks.filter((b) => b.task_id === task.id && Date.parse(b.end) > now);
  const scheduledMin = taskBlocks.reduce(
    (sum, b) => sum + (Date.parse(b.end) - Math.max(Date.parse(b.start), now)) / 60_000,
    0,
  );
  const scheduledSteps = new Set(taskBlocks.map((b) => b.step_id).filter(Boolean));
  const openSteps = steps.filter((s) => !s.done && !scheduledSteps.has(s.id));
  const remaining = steps.some((s) => s.estimate_min)
    ? steps.filter((s) => !s.done).reduce((sum, s) => sum + (s.estimate_min ?? 0), 0)
    : (task.estimate_min ?? settings.default_block_min);
  const neededMin = Math.max(0, Math.round(remaining - scheduledMin));

  const suggestions = useMemo(() => {
    if (!data || horizon <= now) return [];
    const free = findFreeSlots([...data.events, ...blocks], {
      workingHours: settings.working_hours,
      timezone: tz,
      from: now,
      to: horizon,
    });
    return rankSlots({ freeSlots: free, now, dueAt: due, neededMin, steps: openSteps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, blocks, settings.working_hours, tz, now, horizon, due, neededMin]);

  const stepTitle = (id: string | null) => (id ? steps.find((s) => s.id === id)?.title : null);

  /** Creates the suggestion's blocks (and their gcal events). */
  const choose = (s: SlotSuggestion) => {
    for (const b of s.blocks) {
      createBlock.mutate({
        tempId: tempId(),
        body: {
          task_id: task.id,
          step_id: b.step_id,
          start: new Date(b.start).toISOString(),
          end: new Date(b.end).toISOString(),
        },
      });
    }
  };

  return { now, due, neededMin, suggestions, isLoading, stepTitle, choose };
}
