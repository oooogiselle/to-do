"use client";

import { useEffect, useRef, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { localDate, zonedInstant } from "@tt/shared";
import { fmtDue } from "@tt/client";

// A due date without a time means the end of that day.
const END_OF_DAY = "23:59";

const field =
  "rounded-md border border-line bg-paper px-2 py-1 outline-none focus:border-line-strong";

/** Wall date and time of `dueAt` in tz; time is "" when it's the end-of-day default. */
function split(dueAt: string | null, tz: string): { date: string; time: string } {
  if (!dueAt) return { date: "", time: "" };
  const z = new TZDate(new Date(dueAt).getTime(), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(z.getHours())}:${p(z.getMinutes())}`;
  return { date: localDate(z, tz), time: time === END_OF_DAY ? "" : time };
}

function addDays(day: string, n: number, tz: string): string {
  return localDate(new Date(zonedInstant(day, "12:00", tz).getTime() + n * 86_400_000), tz);
}

/** Button showing the due date that opens a small picker: shortcuts, date, optional time. */
export function DuePicker({
  value,
  onChange,
  tz,
  className = "",
}: {
  value: string | null;
  onChange: (dueAt: string | null) => void;
  tz: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { date, time } = split(value, tz);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      rootRef.current && !rootRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const set = (d: string, t: string) =>
    onChange(d ? zonedInstant(d, t || END_OF_DAY, tz).toISOString() : null);

  const today = localDate(new Date(), tz);
  const weekday = new TZDate(Date.now(), tz).getDay();
  const shortcuts = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1, tz) },
    { label: "Next week", day: addDays(today, (8 - weekday) % 7 || 7, tz) },
  ];

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md border px-2 py-1 ${value ? "border-line-strong text-ink" : "border-dashed border-line-strong text-muted"} hover:border-ink ${className}`}
      >
        {value ? `Due ${fmtDue(value, tz)}` : "Add due date"}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Due date"
          className="absolute top-full left-0 z-50 mt-1 w-64 space-y-3 rounded-lg border border-line-strong bg-surface p-3 text-ink shadow-xl"
        >
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => set(s.day, time)}
                className={`rounded-md border px-2 py-1 ${date === s.day ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="w-10 text-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => set(e.target.value, time)}
              className={`${field} flex-1`}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 text-muted">Time</span>
            <input
              type="time"
              step={900}
              value={time}
              disabled={!date}
              onChange={(e) => set(date, e.target.value)}
              className={`${field} flex-1 disabled:opacity-50`}
            />
          </label>
          <p className="text-xs text-muted">Leave the time empty to make it due at 11:59pm.</p>
          <div className="flex justify-between">
            <button
              type="button"
              disabled={!value}
              onClick={() => onChange(null)}
              className="text-muted hover:text-risk disabled:opacity-40"
            >
              No due date
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-ink px-2.5 py-1 text-paper hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
