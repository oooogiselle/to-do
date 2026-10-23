"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatMinutes, type ProposedStep, type Task } from "@tt/shared";
import { api } from "@/lib/client/api";
import { useReplaceSteps } from "@tt/client";

type Mode = "default" | "more_detailed";

/**
 * AI proposes, the user decides: proposed steps are editable and nothing is saved until
 * "Use these steps". Finished steps are kept; unfinished ones are replaced.
 */
export function BreakdownPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const [draft, setDraft] = useState<ProposedStep[] | null>(null);
  const propose = useMutation({
    mutationFn: (mode: Mode) => api.breakdown(task.id, mode),
    onSuccess: (r) => setDraft(r.steps),
  });
  const accept = useReplaceSteps();

  useEffect(() => {
    propose.mutate("default");
    // Run once when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (i: number, patch: Partial<ProposedStep>) =>
    setDraft((d) => d && d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const total = draft?.reduce((sum, s) => sum + s.estimate_min, 0) ?? 0;
  const valid = !!draft?.length && draft.every((s) => s.title.trim() && s.estimate_min > 0);

  return (
    <section className="space-y-3 rounded-lg border border-line-strong p-3" aria-label="Break down">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Suggested steps</h3>
        <button onClick={onClose} className="text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      {propose.isPending && <p className="text-muted">Breaking “{task.title}” into steps…</p>}
      {propose.isError && <p className="text-risk">{propose.error.message}</p>}

      {draft && !propose.isPending && (
        <>
          <ol className="divide-y divide-line rounded-md border border-line">
            {draft.map((s, i) => (
              <li key={i} className="group flex items-center gap-2 px-2.5 py-1.5">
                <span className="w-4 text-right text-xs text-muted">{i + 1}</span>
                <input
                  aria-label={`Step ${i + 1} title`}
                  value={s.title}
                  onChange={(e) => edit(i, { title: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
                <input
                  aria-label={`Step ${i + 1} minutes`}
                  inputMode="numeric"
                  value={s.estimate_min || ""}
                  onChange={(e) => edit(i, { estimate_min: parseInt(e.target.value, 10) || 0 })}
                  className="w-10 bg-transparent text-right text-muted outline-none"
                />
                <span className="text-xs text-muted">min</span>
                <button
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setDraft((d) => d && d.filter((_, j) => j !== i))}
                  className="text-muted opacity-0 group-hover:opacity-100 hover:text-risk focus:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <p className="text-muted">
            Total {formatMinutes(total)}. This becomes the task&apos;s estimate.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!valid || accept.isPending}
              onClick={() =>
                accept.mutate({ taskId: task.id, steps: draft }, { onSuccess: onClose })
              }
              className="rounded-md bg-ink px-3 py-1.5 text-paper hover:opacity-90 disabled:opacity-50"
            >
              Use these steps
            </button>
            <button
              onClick={() => propose.mutate("default")}
              className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong"
            >
              Regenerate
            </button>
            <button
              onClick={() => propose.mutate("more_detailed")}
              className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong"
            >
              More detailed
            </button>
          </div>
          {accept.isError && <p className="text-risk">{accept.error.message}</p>}
        </>
      )}
    </section>
  );
}
