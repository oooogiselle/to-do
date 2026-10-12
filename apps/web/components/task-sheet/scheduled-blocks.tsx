"use client";

import type { Step, TimeBlock } from "@tt/shared";
import { isTemp, useDeleteBlock } from "@/lib/client/data";
import { fmtDay, fmtTime } from "@/lib/client/time";
import { localDate } from "@tt/shared";

/** The task's time blocks, with upcoming ones removable (deletes the gcal event too). */
export function ScheduledBlocks(props: { blocks: TimeBlock[]; steps: Step[]; tz: string }) {
  const remove = useDeleteBlock();
  if (!props.blocks.length) return null;
  const now = Date.now();
  const sorted = [...props.blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return (
    <div className="space-y-1.5">
      <span className="text-muted">On your calendar</span>
      <ul className="divide-y divide-line rounded-md border border-line">
        {sorted.map((b) => {
          const past = Date.parse(b.end) <= now;
          const step = b.step_id ? props.steps.find((s) => s.id === b.step_id) : null;
          return (
            <li
              key={b.id}
              className={`flex items-center gap-3 px-2.5 py-1.5 ${past ? "text-muted" : ""}`}
            >
              <span className="w-40 shrink-0">
                {fmtDay(localDate(new Date(b.start), props.tz), props.tz)},{" "}
                {fmtTime(b.start, props.tz)}–{fmtTime(b.end, props.tz)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {step?.title ?? "Whole task"}
              </span>
              {!past && (
                <button
                  disabled={isTemp(b.id)}
                  onClick={() => remove.mutate(b.id)}
                  className="text-xs text-muted hover:text-risk"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {remove.isError && <p className="text-risk">{remove.error.message}</p>}
    </div>
  );
}
