"use client";

import { useState } from "react";
import { formatMinutes, localDate, zonedInstant, type Step, type TimeBlock } from "@tt/shared";
import { fmtDay, fmtTime, isTemp, localTime, useDeleteBlock, useMoveBlock } from "@tt/client";

const field =
  "rounded-lg border border-line bg-white px-2 py-1 font-semibold outline-none focus:border-sky";

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/** Durations to offer for a block: the presets plus its current length. */
function lengthOptions(current: number) {
  return DURATIONS.includes(current) ? DURATIONS : [...DURATIONS, current].sort((x, y) => x - y);
}

/**
 * The task's time blocks. Upcoming ones show their length as a dropdown that saves on change,
 * and clicking the time opens an editor for the day and start; any block can be removed
 * (deletes the gcal event too, the task stays in your to-dos).
 */
export function ScheduledBlocks(props: {
  blocks: TimeBlock[];
  steps: Step[];
  tz: string;
  color: string;
}) {
  const remove = useDeleteBlock();
  const move = useMoveBlock();
  const [editing, setEditing] = useState<string | null>(null);
  if (!props.blocks.length) return null;
  const now = Date.now();
  const sorted = [...props.blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5">
        {sorted.map((b) => {
          const past = Date.parse(b.end) <= now;
          const step = b.step_id ? props.steps.find((s) => s.id === b.step_id) : null;
          const start = Date.parse(b.start);
          const current = Math.round((Date.parse(b.end) - start) / 60_000);
          if (editing === b.id)
            return (
              <li key={b.id} className="rounded-xl bg-white px-3 py-2 text-[13px]">
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
              className={`flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold ${past ? "text-muted" : "text-ink"}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: props.color, opacity: past ? 0.4 : 1 }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {past ? (
                  <div>
                    {fmtDay(localDate(new Date(b.start), props.tz), props.tz)},{" "}
                    {fmtTime(b.start, props.tz)}–{fmtTime(b.end, props.tz)}
                  </div>
                ) : (
                  <button
                    disabled={isTemp(b.id)}
                    onClick={() => setEditing(b.id)}
                    title="Change the day or time"
                    className="text-left hover:underline"
                  >
                    {fmtDay(localDate(new Date(b.start), props.tz), props.tz)},{" "}
                    {fmtTime(b.start, props.tz)}–{fmtTime(b.end, props.tz)}
                  </button>
                )}
                <div className="truncate text-[11px] font-medium text-muted">
                  {step?.title ?? "Whole task"}
                </div>
              </div>
              {!past && (
                <select
                  value={current}
                  disabled={isTemp(b.id)}
                  onChange={(e) =>
                    move.mutate({
                      id: b.id,
                      start: b.start,
                      end: new Date(start + Number(e.target.value) * 60_000).toISOString(),
                    })
                  }
                  className={`${field} text-xs`}
                  aria-label="Length"
                  title="Length"
                >
                  {/* A block that's already started can't be cut short into the past. */}
                  {lengthOptions(current)
                    .filter((m) => m === current || start + m * 60_000 > now)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                </select>
              )}
              <button
                disabled={isTemp(b.id)}
                onClick={() => remove.mutate(b.id)}
                title={past ? "Didn't get to it? The task stays in your to-dos" : undefined}
                className="rounded-md px-1.5 py-1 text-[12px] font-bold text-muted hover:bg-risk-bg hover:text-risk"
              >
                {past ? "Didn't do it" : "Remove"}
              </button>
            </li>
          );
        })}
      </ul>
      {remove.isError && <p className="text-[13px] text-risk">{remove.error.message}</p>}
      {move.isError && <p className="text-[13px] text-risk">{move.error.message}</p>}
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
  const options = lengthOptions(current);

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
        <button
          type="button"
          onClick={props.onCancel}
          className="text-[12px] font-bold text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || past}
          className="rounded-lg bg-ink px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  );
}
