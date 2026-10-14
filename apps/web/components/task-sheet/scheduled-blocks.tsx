"use client";

import { useState } from "react";
import { formatMinutes, localDate, zonedInstant, type Step, type TimeBlock } from "@tt/shared";
import { isTemp, useDeleteBlock, useMoveBlock } from "@/lib/client/data";
import { fmtDay, fmtTime, localTime } from "@/lib/client/time";

const field =
  "rounded-md border border-line bg-paper px-2 py-1 outline-none focus:border-line-strong";

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/**
 * The task's time blocks. Upcoming ones can be edited to an exact day, time and length;
 * any block can be removed (deletes the gcal event too, the task stays in your to-dos).
 */
export function ScheduledBlocks(props: { blocks: TimeBlock[]; steps: Step[]; tz: string }) {
  const remove = useDeleteBlock();
  const move = useMoveBlock();
  const [editing, setEditing] = useState<string | null>(null);
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
          if (editing === b.id)
            return (
              <li key={b.id} className="px-2.5 py-2">
                <BlockEditor
                  block={b}
                  tz={props.tz}
                  onCancel={() => setEditing(null)}
                  onSave={(start, end) => {
                    move.mutate({ id: b.id, start, end });
                    setEditing(null);
                  }}
                />
              </li>
            );
          return (
            <li
              key={b.id}
              className={`flex items-center gap-3 px-2.5 py-1.5 ${past ? "text-muted" : ""}`}
            >
              <span className="w-44 shrink-0">
                {fmtDay(localDate(new Date(b.start), props.tz), props.tz)},{" "}
                {fmtTime(b.start, props.tz)}–{fmtTime(b.end, props.tz)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {step?.title ?? "Whole task"}
              </span>
              {!past && (
                <button
                  disabled={isTemp(b.id)}
                  onClick={() => setEditing(b.id)}
                  className="text-xs text-muted hover:text-ink"
                >
                  Edit
                </button>
              )}
              <button
                disabled={isTemp(b.id)}
                onClick={() => remove.mutate(b.id)}
                title={past ? "Didn't get to it? The task stays in your to-dos" : undefined}
                className="text-xs text-muted hover:text-risk"
              >
                {past ? "Didn't do it" : "Remove"}
              </button>
            </li>
          );
        })}
      </ul>
      {remove.isError && <p className="text-risk">{remove.error.message}</p>}
      {move.isError && <p className="text-risk">{move.error.message}</p>}
    </div>
  );
}

function BlockEditor(props: {
  block: TimeBlock;
  tz: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const { block: b, tz } = props;
  const current = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60_000);
  const [date, setDate] = useState(localDate(new Date(b.start), tz));
  const [time, setTime] = useState(localTime(b.start, tz));
  const [minutes, setMinutes] = useState(current);

  const valid = !!date && !!time && minutes > 0;
  const start = valid ? zonedInstant(date, time, tz).getTime() : NaN;
  const end = start + minutes * 60_000;
  const past = valid && end <= Date.now();
  const options = DURATIONS.includes(current)
    ? DURATIONS
    : [...DURATIONS, current].sort((x, y) => x - y);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || past) return;
        props.onSave(new Date(start).toISOString(), new Date(end).toISOString());
      }}
    >
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={field}
        aria-label="Day"
      />
      <input
        type="time"
        step={300}
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className={field}
        aria-label="Start time"
      />
      <select
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        className={field}
        aria-label="Length"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {formatMinutes(m)}
          </option>
        ))}
      </select>
      {valid && !past && <span className="text-xs text-muted">until {fmtTime(end, tz)}</span>}
      {past && <span className="text-xs text-risk">That time has passed</span>}
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={props.onCancel} className="text-xs text-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || past}
          className="rounded-md bg-ink px-2 py-1 text-xs text-paper disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  );
}
