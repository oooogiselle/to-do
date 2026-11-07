import type { Interval } from "./freeSlots";

const MIN = 60_000;
const ROUND_MIN = 15;

export type TimedPick = {
  task_id: string;
  step_id: string | null;
  /** Epoch ms the AI wants to start at. */
  start: number;
  duration_min: number;
  reason: string;
};

export type FittedPick = { task_id: string; step_id: string | null; start: string; end: string; reason: string };

/**
 * Turns the AI's proposed blocks into ones that really fit: rounded to 15 minutes, starting
 * inside a free slot, clipped to it, and not overlapping each other. Drops picks for tasks that
 * weren't offered and repeats of the same task or step. Steps that don't belong to the task are
 * ignored.
 */
export function fitPicksToSlots(
  raw: TimedPick[],
  slots: Interval[],
  known: Map<string, Set<string>>,
  max = 4,
): FittedPick[] {
  const out: FittedPick[] = [];
  const taken: Interval[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const steps = known.get(p.task_id);
    if (!steps) continue;
    const step_id = p.step_id && steps.has(p.step_id) ? p.step_id : null;
    const key = `${p.task_id}:${step_id ?? ""}`;
    if (seen.has(key)) continue;

    const start = Math.round(p.start / (ROUND_MIN * MIN)) * ROUND_MIN * MIN;
    const slot = slots.find((s) => start >= s.start && start < s.end);
    if (!slot) continue;
    const wanted = Math.max(ROUND_MIN, Math.round(p.duration_min / ROUND_MIN) * ROUND_MIN);
    const end = Math.min(slot.end, start + wanted * MIN);
    if (end - start < ROUND_MIN * MIN) continue;
    if (taken.some((t) => start < t.end && end > t.start)) continue;

    seen.add(key);
    taken.push({ start, end });
    out.push({
      task_id: p.task_id,
      step_id,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      reason: p.reason.trim().slice(0, 200),
    });
    if (out.length === max) break;
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
