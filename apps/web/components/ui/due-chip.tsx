"use client";

import { dueTone, fmtDue, type DueTone } from "@tt/client";

const TONES: Record<DueTone, { bg: string; fg: string }> = {
  overdue: { bg: "#f6e2dc", fg: "#9a4330" },
  today: { bg: "#f9ece7", fg: "#a04b35" },
  soon: { bg: "#faf3df", fg: "#7a5e1e" },
  later: { bg: "#eef0f6", fg: "#4d5370" },
};

/** Due date as a colored chip: "Overdue · Mon", "Today 5pm", "Tomorrow", "Fri", "Nov 4". */
export function DueChip({
  dueAt,
  tz,
  now = Date.now(),
  className = "",
}: {
  dueAt: string | null;
  tz: string;
  now?: number;
  className?: string;
}) {
  if (!dueAt) return null;
  const tone = dueTone(dueAt, tz, now);
  const c = TONES[tone];
  const label = tone === "overdue" ? `Overdue · ${fmtDue(dueAt, tz, now)}` : fmtDue(dueAt, tz, now);
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}
