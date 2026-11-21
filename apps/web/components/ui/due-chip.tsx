"use client";

import { dueTone, fmtDue, type DueTone } from "@tt/client";

const TONES: Record<DueTone, { bg: string; fg: string }> = {
  overdue: { bg: "color-mix(in srgb, var(--risk) 14%, var(--surface))", fg: "var(--risk)" },
  today: { bg: "var(--risk-bg)", fg: "var(--risk)" },
  soon: { bg: "var(--warn-bg)", fg: "var(--warn)" },
  later: { bg: "var(--chip)", fg: "var(--chip-ink)" },
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
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}
