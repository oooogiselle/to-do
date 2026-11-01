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
    <section className="space-y-2.5" aria-label="Schedule">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-bold text-ink">
          {neededMin ? `Find ${formatMinutes(neededMin)} before it's due` : "Fully scheduled"}
        </h4>
        <button onClick={onClose} className="text-[12px] font-bold text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {neededMin === 0 ? (
        <p className="text-[13px] text-muted">Every remaining step already has time on your calendar.</p>
      ) : isLoading ? (
        <p className="text-[13px] text-muted">Looking for open time…</p>
      ) : due !== null && due <= now ? (
        <p className="text-[13px] text-muted">
          This is past due. Change the due date, or drag it onto the timeline.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="text-[13px] text-muted">
          No open time before it&apos;s due. Widen your working hours in Settings, or drag it onto
          any time on the timeline.
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => choose(s)}
                className="w-full rounded-xl border-2 border-transparent bg-white px-3 py-2 text-left text-[13px] transition-colors hover:border-grape"
              >
                {s.kind === "split" ? (
                  <>
                    <div className="font-bold text-ink">
                      Split across {s.blocks.length} sessions, one step each
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
                      {s.blocks.map((b) => (
                        <li key={b.start}>
                          {fmtRange(b.start, b.end)}: {stepTitle(b.step_id)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-ink">
                      {fmtRange(s.blocks[0]!.start, s.blocks[0]!.end)}
                    </div>
                    {s.kind === "partial" && (
                      <div className="text-[12px] text-muted">
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
      <p className="text-[12px] text-muted">
        You can also drag it from a list or the Due pane onto any time.
      </p>
    </section>
  );
}
