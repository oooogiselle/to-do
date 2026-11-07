import type { SuggestFocus } from "../schemas";
import { addDays, localDate } from "../time";
import type { RawPick } from "./normalizePicks";

const MIN = 60_000;
const HOUR = 60 * MIN;
/** An assignment due this soon after the gap starts (or overdue) is pressing. */
export const PRESSING_HOURS = 48;

/** What a task is, as far as the free-time focus chips are concerned. */
export type FocusKind = "assignment" | "build" | "learn" | "people" | "personal";

/**
 * Someday items go by their idea_kind (no kind means a plain idea, which counts as build).
 * Outside someday, repeating tasks are personal routines and everything else is an assignment.
 */
export function taskKind(
  task: { idea_kind: string | null; repeat: string },
  listKind: string | null | undefined,
): FocusKind {
  if (listKind === "someday") {
    if (task.idea_kind === "learn") return "learn";
    if (task.idea_kind === "people") return "people";
    return "build";
  }
  // A people item moved out of someday is still about a person.
  if (task.idea_kind === "people") return "people";
  return task.repeat !== "none" ? "personal" : "assignment";
}

/** Whether a task belongs under a focus chip. People also covers personal routines ("Call Grandma"). */
export function matchesFocus(kind: FocusKind, focus: SuggestFocus | undefined): boolean {
  switch (focus ?? "any") {
    case "any":
      return true;
    case "assignments":
      return kind === "assignment";
    case "build":
      return kind === "build";
    case "learn":
      return kind === "learn";
    case "people":
      return kind === "people" || kind === "personal";
  }
}

/** Overdue work older than this stops forcing its way to the top. */
const OVERDUE_DAYS = 3;

/**
 * An assignment with work left that's due within 48h after the gap starts, or already overdue
 * (by up to 3 days). A deadline that passes between now and the gap isn't pressing for that gap:
 * the work has to happen before it.
 */
export function isPressing(
  t: { kind: FocusKind; due_at: string | null; remainingMin: number },
  gapStart: number,
  nowMs: number,
): boolean {
  if (t.kind !== "assignment" || !t.due_at || t.remainingMin <= 0) return false;
  const due = Date.parse(t.due_at);
  if (due < nowMs) return nowMs - due <= OVERDUE_DAYS * 24 * HOUR;
  return due >= gapStart && due - gapStart <= PRESSING_HOURS * HOUR;
}

/**
 * Under a focus, only the first pick may be outside it (the pressing deadline). Drops any other
 * off-focus picks the AI slipped in.
 */
export function keepFocus<P extends { task_id: string }>(
  picks: P[],
  inFocus: (taskId: string) => boolean,
): P[] {
  return picks.filter((p, i) => i === 0 || inFocus(p.task_id));
}

export type PressingTask = { task_id: string; due_at: string; remainingMin: number };

/**
 * Makes sure the most urgent pressing task (that wasn't already turned down) is the first pick.
 * If the AI included it, it moves to the front; otherwise a block for it is added at the start
 * of the gap. Picks are alternatives, so the added block may overlap the others.
 */
export function ensurePressingFirst(
  raw: RawPick[],
  pressing: PressingTask[],
  gap: { start: number; end: number },
  opts: { exclude?: ReadonlySet<string>; reason: (t: PressingTask) => string },
): RawPick[] {
  const top = pressing
    .filter((t) => !opts.exclude?.has(t.task_id))
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))[0];
  if (!top) return raw;
  const i = raw.findIndex((p) => p.task_id === top.task_id);
  if (i >= 0) return [raw[i]!, ...raw.slice(0, i), ...raw.slice(i + 1)];
  const gapMin = Math.floor((gap.end - gap.start) / MIN);
  const duration = Math.max(15, Math.floor(Math.min(top.remainingMin, 60, gapMin) / 15) * 15);
  return [
    { task_id: top.task_id, step_id: null, offset_min: 0, duration_min: duration, reason: opts.reason(top) },
    ...raw,
  ];
}

/**
 * A date the AI read from "I called Mom on Tuesday", checked: a real calendar date, not in the
 * future, and not more than a year back. Returns null otherwise.
 */
export function pastDate(raw: string, nowMs: number, tz: string): string | null {
  const date = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  const today = localDate(new Date(nowMs), tz);
  if (date > today || date < addDays(today, -366)) return null;
  return date;
}
