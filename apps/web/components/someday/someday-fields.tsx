"use client";

import { useEffect, useState } from "react";
import { normalizeLink, type Horizon, type IdeaKind, type Task } from "@tt/shared";
import { HORIZON_LABEL } from "@tt/client";
import { Segmented } from "@/components/ui/segmented";
import { LinkChip } from "./link-chip";

const label = "mb-1.5 block text-[11px] font-bold tracking-wider text-muted uppercase";

type Patch = Partial<Pick<Task, "link_url" | "idea_kind" | "horizon">>;

/** The task sheet's Someday section: the link, goal vs. learn, and a rough timeframe. */
export function SomedayFields({ task, onChange }: { task: Task; onChange: (patch: Patch) => void }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line-soft p-3.5">
      <h3 className="text-[13px] font-extrabold text-ink">Someday</h3>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <fieldset>
          <legend className={label}>Type</legend>
          <Segmented<IdeaKind | "none">
            label="Type"
            size="sm"
            value={task.idea_kind ?? "none"}
            onChange={(v) => onChange({ idea_kind: v === "none" ? null : v })}
            options={[
              { value: "none", label: "—" },
              { value: "goal", label: "Goal" },
              { value: "learn", label: "Learn" },
            ]}
          />
        </fieldset>
        <fieldset>
          <legend className={label}>Timeframe</legend>
          <Segmented<Horizon | "none">
            label="Timeframe"
            size="sm"
            value={task.horizon ?? "none"}
            onChange={(v) => onChange({ horizon: v === "none" ? null : v })}
            options={[
              { value: "none", label: "—" },
              { value: "month", label: HORIZON_LABEL.month },
              { value: "year", label: HORIZON_LABEL.year },
              { value: "someday", label: HORIZON_LABEL.someday },
            ]}
          />
        </fieldset>
      </div>
      <LinkField value={task.link_url} onCommit={(link_url) => onChange({ link_url })} />
    </section>
  );
}

/** Saves on blur or Enter. Adds https:// to a bare site; anything that isn't a link is undone. */
function LinkField({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    const next = normalizeLink(draft);
    if (next === undefined) return setInvalid(true);
    setInvalid(false);
    setDraft(next ?? "");
    if (next !== value) onCommit(next);
  };
  return (
    <div>
      <label htmlFor="task-link" className={label}>
        Link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="task-link"
          type="url"
          inputMode="url"
          value={draft}
          placeholder="Where you saw it: an article, video or course"
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(value ?? "");
          }}
          aria-invalid={invalid}
          aria-describedby={invalid ? "task-link-error" : undefined}
          className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-sky/20 ${invalid ? "border-risk" : "border-line focus:border-sky"}`}
        />
        {value && <LinkChip url={value} />}
      </div>
      {invalid && (
        <p id="task-link-error" className="mt-1 text-[12px] font-semibold text-risk">
          That doesn&apos;t look like a link.
        </p>
      )}
    </div>
  );
}
