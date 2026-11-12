import type { SlotPick } from "../schemas";

const MIN = 60_000;
const ROUND_MIN = 15;
const MAX_PICKS = 3;

export type RawPick = {
  task_id: string;
  step_id: string | null;
  /** Minutes into the gap where the AI wants to start. */
  offset_min: number;
  duration_min: number;
  reason: string;
};

/**
 * A block `offset_min` into the gap, rounded to 15 minutes and clipped to the gap, as ISO times.
 * Null when less than 15 minutes is left after clipping.
 */
export function clipToGap(
  p: { offset_min: number; duration_min: number },
  gap: { start: number; end: number },
): { start: string; end: string } | null {
  const offset = Math.max(0, Math.round(p.offset_min / ROUND_MIN) * ROUND_MIN);
  const start = gap.start + offset * MIN;
  const wanted = Math.max(ROUND_MIN, Math.round(p.duration_min / ROUND_MIN) * ROUND_MIN);
  const end = Math.min(gap.end, start + wanted * MIN);
  if (end - start < ROUND_MIN * MIN) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/**
 * Turns the AI's picks (minutes relative to the gap) into schedulable ISO blocks. Drops picks for
 * tasks that weren't offered, repeats of the same task, and picks that don't fit; rounds to 15
 * minutes and clips to the gap. Steps that don't belong to the task are ignored.
 */
export function normalizePicks(
  raw: RawPick[],
  gap: { start: number; end: number },
  known: Map<string, Set<string>>,
  exclude: ReadonlySet<string> = new Set(),
): SlotPick[] {
  const out: SlotPick[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const steps = known.get(p.task_id);
    if (!steps || seen.has(p.task_id) || exclude.has(p.task_id)) continue;
    const block = clipToGap(p, gap);
    if (!block) continue;
    seen.add(p.task_id);
    out.push({
      task_id: p.task_id,
      step_id: p.step_id && steps.has(p.step_id) ? p.step_id : null,
      ...block,
      reason: p.reason.trim().slice(0, 200),
    });
    if (out.length === MAX_PICKS) break;
  }
  return out;
}
