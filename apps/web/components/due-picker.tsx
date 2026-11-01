"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TZDate } from "@date-fns/tz";
import { localDate, zonedInstant } from "@tt/shared";
import { fmtDue } from "@tt/client";

// A due date without a time means the end of that day.
const END_OF_DAY = "23:59";

const field =
  "rounded-lg border border-line bg-white px-2 py-1 font-medium outline-none focus:border-sky focus:ring-2 focus:ring-sky/20";

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { date, time } = split(value, tz);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The picker is portalled to <body> so scroll areas and overflow-hidden cards (task
  // sheet, quick add) can't clip it. Pin it to the button: below if it fits, else above,
  // and kept inside the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!b) return;
      const w = pop?.offsetWidth ?? 256;
      const h = pop?.offsetHeight ?? 320;
      const gap = 4;
      const margin = 8;
      const below = window.innerHeight - b.bottom - gap - margin;
      const above = b.top - gap - margin;
      const top =
        h <= below || below >= above
          ? Math.min(b.bottom + gap, window.innerHeight - h - margin)
          : Math.max(b.top - gap - h, margin);
      const left = Math.min(Math.max(b.left, margin), window.innerWidth - w - margin);
      setPos({ top: Math.max(top, margin), left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
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
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-2 py-1 font-semibold ${value ? "border-line bg-white text-ink" : "border-dashed border-line-strong text-muted"} hover:border-ink ${className}`}
      >
        {value ? `Due ${fmtDue(value, tz)}` : "Add due date"}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Due date"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="animate-pop-in fixed z-[60] w-64 space-y-3 rounded-[13px] border border-line-soft bg-surface p-3 text-[13px] text-ink shadow-[0_18px_34px_rgba(21,23,43,0.2)]"
          >
            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => set(s.day, time)}
                  className={`rounded-lg px-2 py-1 font-bold ${date === s.day ? "bg-ink text-white" : "bg-chip text-chip-ink hover:bg-line"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <span className="w-10 font-semibold text-muted">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => set(e.target.value, time)}
                className={`${field} flex-1`}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 font-semibold text-muted">Time</span>
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
                className="font-semibold text-muted hover:text-risk disabled:opacity-40"
              >
                No due date
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-ink px-2.5 py-1 font-bold text-white hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
