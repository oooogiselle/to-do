"use client";

import { useMemo, useState } from "react";
import {
  findFreeSlots,
  formatMinutes,
  rankSlots,
  type SlotSuggestion,
  type Task,
} from "@tt/shared";
import { tempId, useCreateBlock, useEvents, useModel } from "@/lib/client/data";
import { fmtDay, fmtTime } from "@/lib/client/time";
import { localDate } from "@tt/shared";

const HORIZON_DAYS = 14;

/** Rule-based top-3 open slots before the due date (spec: slot suggestions). */
export function SchedulePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { blocks, stepsByTask, settings } = useModel();
  const createBlock = useCreateBlock();
  const tz = settings.timezone;
  // Fixed for the panel's lifetime so the events query key stays stable.
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
  const fmtRange = (start: number, end: number) => {
    const today = localDate(new Date(now), tz);
    const day = localDate(new Date(start), tz);
    const dayLabel = day === today ? "Today" : fmtDay(day, tz);
    return `${dayLabel}, ${fmtTime(start, tz)}–${fmtTime(end, tz)}`;
  };

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
    onClose();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line-strong p-3" aria-label="Schedule">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {neededMin ? `Find ${formatMinutes(neededMin)} before it's due` : "Fully scheduled"}
        </h3>
        <button onClick={onClose} className="text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {neededMin === 0 ? (
        <p className="text-muted">Every remaining step already has time on your calendar.</p>
      ) : isLoading ? (
        <p className="text-muted">Looking for open time…</p>
      ) : due !== null && due <= now ? (
        <p className="text-muted">
          This is past due. Change the due date, or drag it onto the timeline.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="text-muted">
          No open time before it&apos;s due. Widen your working hours in Settings, or drag it onto
          any time on the timeline.
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => choose(s)}
                className="w-full rounded-md border border-line px-3 py-2 text-left hover:border-now"
              >
                {s.kind === "split" ? (
                  <>
                    <div className="font-medium">
                      Split across {s.blocks.length} sessions, one step each
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {s.blocks.map((b) => (
                        <li key={b.start}>
                          {fmtRange(b.start, b.end)}: {stepTitle(b.step_id)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="font-medium">
                      {fmtRange(s.blocks[0]!.start, s.blocks[0]!.end)}
                    </div>
                    {s.kind === "partial" && (
                      <div className="text-xs text-muted">
                        Covers {formatMinutes(s.coversMin)} of {formatMinutes(neededMin)}
                      </div>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">You can also drag it from the Due rail onto any time.</p>
    </section>
  );
}
