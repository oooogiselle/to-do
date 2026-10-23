"use client";

import { formatMinutes, type SlotSuggestion, type Task } from "@tt/shared";
import { fmtSlot, useModel, useSlotSuggestions } from "@tt/client";

/** Rule-based top-3 open slots before the due date (spec: slot suggestions). */
export function SchedulePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { settings } = useModel();
  const {
    now,
    due,
    neededMin,
    suggestions,
    isLoading,
    stepTitle,
    choose: create,
  } = useSlotSuggestions(task);
  const fmtRange = (start: number, end: number) => fmtSlot(start, end, settings.timezone, now);

  const choose = (s: SlotSuggestion) => {
    create(s);
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
