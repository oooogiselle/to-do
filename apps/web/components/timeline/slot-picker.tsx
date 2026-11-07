"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  formatMinutes,
  localDate,
  taskKind,
  type Energy,
  type SuggestFocus,
} from "@tt/shared";
import { contactLabel, fmtTime, taskColor, useModel, useSlotPicks } from "@tt/client";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { useDismiss } from "@/components/ui/use-dismiss";

const WIDTH = 320;
const ENERGIES: { id: Energy; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "ok", label: "OK" },
  { id: "high", label: "High" },
];
const FOCUSES: { id: SuggestFocus; label: string }[] = [
  { id: "any", label: "Anything" },
  { id: "assignments", label: "Assignments" },
  { id: "build", label: "Build" },
  { id: "learn", label: "Learn" },
  { id: "people", label: "People" },
];
const PLACEHOLDER: Record<SuggestFocus, string> = {
  any: "Not quite right? Tell me what you'd prefer",
  assignments: "Not quite right? Tell me what you'd prefer",
  build: "Anything specific you want to build?",
  learn: "Anything specific? e.g. learn Rust",
  people: "Anyone specific? Or: called Mom on Tuesday",
};

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-[11px] font-bold disabled:opacity-60 ${
    on ? "border-grape bg-grape-bg text-grape-ink" : "border-line bg-paper text-chip-ink hover:bg-line-soft"
  }`;

function errorText(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.status === 503) return err.message;
    if (err.status === 400) return "That gap is too short to suggest anything for.";
  }
  return "Couldn't get suggestions. Try again.";
}

/**
 * Popover on a free gap: up to 3 AI picks to schedule in one click. You can say what you feel
 * like (assignments, build, learn, people) and how much energy you have; pressing deadlines still
 * come first. Under People it can also propose new people to reach out to and log past contact.
 */
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
  const { suggest, picks, ideas, logs, note, isPending, error, accept, acceptIdea, logContact } =
    useSlotPicks();
  const [energy, setEnergy] = useState<Energy | undefined>();
  const [focus, setFocus] = useState<SuggestFocus>("any");
  const [feedback, setFeedback] = useState("");
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const shown = useRef(new Set<string>());
  const ref = useDismiss<HTMLDivElement>(true, onClose);
  const today = localDate(new Date(), tz);

  type Ask = { energy?: Energy; focus?: SuggestFocus; feedback?: string; fresh?: boolean };
  const ask = (opts: Ask = {}) => {
    setLogged(new Set());
    suggest(
      {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        energy: opts.energy,
        focus: opts.focus && opts.focus !== "any" ? opts.focus : undefined,
        feedback: opts.feedback?.trim() || undefined,
        exclude_task_ids: opts.fresh ? [...shown.current] : undefined,
      },
      { onSuccess: (r) => r.picks.forEach((p) => shown.current.add(p.task_id)) },
    );
  };
  const kindOf = (taskId: string) => {
    const task = taskById.get(taskId);
    return task ? taskKind(task, listById.get(task.list_id ?? "")?.kind) : null;
  };

  useEffect(() => {
    ask();
    // Once, when the gap is clicked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const left = Math.max(8, Math.min(anchor.right + 8, window.innerWidth - WIDTH - 8));
  const flip = anchor.right + 8 + WIDTH > window.innerWidth;
  const x = flip ? Math.max(8, anchor.left - WIDTH - 8) : left;
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 540));
  const mins = Math.round((end - start) / 60_000);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Suggestions for this free time"
      className="animate-pop-in fixed z-50 overflow-y-auto rounded-2xl border border-line-soft bg-surface p-3 shadow-pop"
      style={{ left: x, top, width: WIDTH, maxHeight: window.innerHeight - top - 8 }}
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

      <div role="group" aria-label="What do you feel like doing?" className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-extrabold tracking-wider text-faint uppercase">Focus</span>
        {FOCUSES.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={focus === f.id}
            disabled={isPending}
            onClick={() => {
              if (focus === f.id) return;
              setFocus(f.id);
              shown.current.clear();
              ask({ energy, focus: f.id, feedback });
            }}
            className={chip(focus === f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Energy" className="mb-2 flex items-center gap-1.5">
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
              ask({ energy: next, focus, feedback });
            }}
            className={chip(energy === e.id)}
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
          logs.map((l) => {
            const task = taskById.get(l.task_id);
            if (!task) return null;
            const key = `${l.task_id}:${l.date}`;
            const done = logged.has(key);
            return (
              <div key={key} className="flex items-center gap-2 rounded-xl bg-open p-2 text-[12px] text-open-ink">
                <p className="min-w-0 flex-1">
                  {done ? "Logged" : "Log"} <span className="font-bold">{task.title}</span> on{" "}
                  {contactLabel(l.date, today)}
                  {done ? "." : "?"}
                </p>
                {done ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      logContact(l);
                      setLogged((s) => new Set(s).add(key));
                    }}
                    className="shrink-0 rounded-lg bg-ink px-2 py-1 text-[11px] font-extrabold text-surface hover:opacity-90"
                  >
                    Log it
                  </button>
                )}
              </div>
            );
          })}

        {!isPending &&
          picks?.map((p) => {
            const task = taskById.get(p.task_id);
            const step = p.step_id ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id) : null;
            const color = taskColor(task, listById);
            const kind = kindOf(p.task_id);
            const urgent = focus !== "any" && focus !== "assignments" && kind === "assignment";
            const person = kind === "people" || (focus === "people" && kind === "personal");
            return (
              <div key={p.task_id} className="flex items-start gap-2 rounded-xl border border-line-soft p-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <span className="truncate">{task?.title ?? "Task"}</span>
                    {urgent && (
                      <span className="shrink-0 rounded bg-risk-bg px-1 text-[10px] font-extrabold text-risk">
                        Due soon
                      </span>
                    )}
                  </p>
                  {step && <p className="truncate text-[11px] text-chip-ink">{step.title}</p>}
                  <p className="text-[11px] text-muted">{p.reason}</p>
                  <p className="text-[10px] font-semibold text-faint">
                    {fmtTime(p.start, tz)}–{fmtTime(p.end, tz)}
                  </p>
                  {person && task && (
                    <AlreadyDid
                      today={today}
                      onLog={(date) => {
                        logContact({ task_id: task.id, date });
                        // They've done it, so offer something else.
                        ask({ energy, focus, feedback, fresh: true });
                      }}
                    />
                  )}
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

        {!isPending &&
          ideas.map((idea, i) => (
            <div key={`idea-${i}`} className="flex items-start gap-2 rounded-xl border border-dashed border-line p-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-open-ink" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                  <span className="truncate">{idea.title}</span>
                  <span className="shrink-0 rounded bg-open px-1 text-[10px] font-extrabold text-open-ink">New</span>
                </p>
                <p className="text-[11px] text-muted">{idea.reason}</p>
                <p className="text-[10px] font-semibold text-faint">
                  {fmtTime(idea.start, tz)}–{fmtTime(idea.end, tz)} · saved to Someday
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void acceptIdea(idea);
                  onClose();
                }}
                className="shrink-0 rounded-lg bg-ink px-2 py-1 text-[11px] font-extrabold text-surface hover:opacity-90"
              >
                Schedule
              </button>
            </div>
          ))}

        {!isPending && !error && picks?.length === 0 && !ideas.length && (
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
          ask({ energy, focus, feedback, fresh: true });
        }}
      >
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={300}
          placeholder={PLACEHOLDER[focus]}
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

/** "Did this already?" on a people pick: log the day you connected, which steers later picks. */
function AlreadyDid({ today, onLog }: { today: string; onLog: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 text-[10px] font-bold text-chip-ink hover:text-ink"
      >
        Already did this…
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (date && date <= today) onLog(date);
        setOpen(false);
      }}
    >
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Day you connected"
        className="rounded-md border border-line bg-paper px-1 py-0.5 text-[11px] text-ink"
      />
      <button type="submit" className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-ink hover:bg-line-soft">
        Log
      </button>
    </form>
  );
}
