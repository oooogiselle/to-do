"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, formatMinutes, type Energy } from "@tt/shared";
import { fmtTime, taskColor, useModel, useSlotPicks } from "@tt/client";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useDismiss } from "@/components/ui/use-dismiss";

const WIDTH = 320;
const ENERGIES: { id: Energy; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "ok", label: "OK" },
  { id: "high", label: "High" },
];

function errorText(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.status === 503) return err.message;
    if (err.status === 400) return "That gap is too short to suggest anything for.";
  }
  return "Couldn't get suggestions. Try again.";
}

/** Popover on a free gap: up to 3 AI picks to schedule in one click, with energy and feedback. */
export function SlotPicker({
  anchor,
  start,
  end,
  tz,
  onClose,
}: {
  anchor: DOMRect;
  start: number;
  end: number;
  tz: string;
  onClose: () => void;
}) {
  const { taskById, listById, stepsByTask } = useModel();
  const { suggest, picks, note, isPending, error, accept } = useSlotPicks();
  const [energy, setEnergy] = useState<Energy | undefined>();
  const [feedback, setFeedback] = useState("");
  const shown = useRef(new Set<string>());
  const ref = useDismiss<HTMLDivElement>(true, onClose);

  const ask = (opts: { energy?: Energy; feedback?: string; fresh?: boolean } = {}) =>
    suggest(
      {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        energy: opts.energy,
        feedback: opts.feedback?.trim() || undefined,
        exclude_task_ids: opts.fresh ? [...shown.current] : undefined,
      },
      { onSuccess: (r) => r.picks.forEach((p) => shown.current.add(p.task_id)) },
    );

  useEffect(() => {
    ask();
    // Once, when the gap is clicked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const left = Math.max(8, Math.min(anchor.right + 8, window.innerWidth - WIDTH - 8));
  const flip = anchor.right + 8 + WIDTH > window.innerWidth;
  const x = flip ? Math.max(8, anchor.left - WIDTH - 8) : left;
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 440));
  const mins = Math.round((end - start) / 60_000);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Suggestions for this free time"
      className="animate-pop-in fixed z-50 rounded-2xl border border-line-soft bg-surface p-3 shadow-pop"
      style={{ left: x, top, width: WIDTH }}
    >
      <div className="mb-2 flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 text-grape" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-extrabold text-ink">What to do here?</p>
          <p className="text-[11px] text-faint">
            {fmtTime(start, tz)}–{fmtTime(end, tz)} · {formatMinutes(mins)} open
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-faint hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-extrabold tracking-wider text-faint uppercase">Energy</span>
        {ENERGIES.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={energy === e.id}
            disabled={isPending}
            onClick={() => {
              const next = energy === e.id ? undefined : e.id;
              setEnergy(next);
              shown.current.clear();
              ask({ energy: next, feedback });
            }}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
              energy === e.id
                ? "border-grape bg-grape-bg text-grape-ink"
                : "border-line bg-paper text-chip-ink hover:bg-line-soft"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="space-y-1.5">
        {isPending &&
          [0, 1, 2].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-xl bg-paper" />)}

        {!isPending && error && <p className="rounded-lg bg-risk-bg p-2 text-[12px] text-risk">{errorText(error)}</p>}

        {!isPending &&
          picks?.map((p) => {
            const task = taskById.get(p.task_id);
            const step = p.step_id ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id) : null;
            const color = taskColor(task, listById);
            return (
              <div key={p.task_id} className="flex items-start gap-2 rounded-xl border border-line-soft p-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-ink">{task?.title ?? "Task"}</p>
                  {step && <p className="truncate text-[11px] text-chip-ink">{step.title}</p>}
                  <p className="text-[11px] text-muted">{p.reason}</p>
                  <p className="text-[10px] font-semibold text-faint">
                    {fmtTime(p.start, tz)}–{fmtTime(p.end, tz)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    accept(p);
                    onClose();
                  }}
                  className="shrink-0 rounded-lg bg-ink px-2 py-1 text-[11px] font-extrabold text-surface hover:opacity-90"
                >
                  Schedule
                </button>
              </div>
            );
          })}

        {!isPending && !error && picks?.length === 0 && (
          <p className="rounded-lg bg-paper p-2 text-[12px] text-muted">
            {note ?? "Nothing fits this gap well."}
          </p>
        )}
        {!isPending && !error && picks && picks.length > 0 && note && (
          <p className="px-1 text-[11px] text-faint">{note}</p>
        )}
      </div>

      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          ask({ energy, feedback, fresh: true });
        }}
      >
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={300}
          placeholder="Not quite right? Tell me what you'd prefer"
          aria-label="Feedback for new suggestions"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-[12px] text-ink placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] font-extrabold text-ink hover:bg-line-soft disabled:opacity-50"
          title={feedback.trim() ? "Regenerate with your feedback" : "Shuffle"}
        >
          <RefreshCw className="h-3 w-3" />
          {feedback.trim() ? "Regenerate" : "Shuffle"}
        </button>
      </form>
      <button
        type="button"
        onClick={onClose}
        className="mt-1.5 w-full text-center text-[11px] font-semibold text-faint hover:text-ink"
      >
        Not now
      </button>
    </div>,
    document.body,
  );
}
