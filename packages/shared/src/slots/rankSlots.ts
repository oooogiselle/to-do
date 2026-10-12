import type { Interval } from "./freeSlots";

const MIN = 60_000;
const QUARTER = 15 * MIN;

export type PlannedBlock = { start: number; end: number; step_id: string | null };
export type SlotSuggestion = {
  kind: "single" | "split" | "partial";
  blocks: PlannedBlock[];
  /** Minutes of the needed work this suggestion covers. */
  coversMin: number;
};

type StepInput = { id: string; estimate_min: number | null };

const roundUp = (t: number) => Math.ceil(t / QUARTER) * QUARTER;

/**
 * Rule-based slot suggestions (spec v1):
 * - only free time between now and the due date
 * - a slot that fits the whole estimate beats one that doesn't; earlier beats later
 * - for work over an hour, slots under 30 minutes are ignored
 * - long work can be split across slots, one step per slot
 * Returns at most `limit` suggestions, best first.
 */
export function rankSlots(opts: {
  freeSlots: Interval[];
  now: number;
  dueAt: number | null;
  neededMin: number;
  steps?: StepInput[];
  limit?: number;
}): SlotSuggestion[] {
  const { neededMin, limit = 3 } = opts;
  if (neededMin <= 0) return [];
  const minLen = (neededMin > 60 ? 30 : 15) * MIN;
  const until = opts.dueAt ?? Infinity;

  const slots = opts.freeSlots
    .map((s) => ({ start: roundUp(Math.max(s.start, opts.now)), end: Math.min(s.end, until) }))
    .filter((s) => s.end - s.start >= minLen)
    .sort((a, b) => a.start - b.start);

  const need = neededMin * MIN;
  const out: SlotSuggestion[] = [];

  for (const s of slots) {
    if (s.end - s.start >= need) {
      out.push({
        kind: "single",
        blocks: [{ start: s.start, end: s.start + need, step_id: null }],
        coversMin: neededMin,
      });
    }
  }

  const split = splitBySteps(slots, opts.steps ?? []);
  if (split && neededMin > 60) {
    // A split plan is offered when it lands earlier than the second-best single block,
    // or when nothing fits in one go.
    const lastEnd = split.blocks.at(-1)!.end;
    const insertAt = out.findIndex((s) => s.blocks[0]!.end > lastEnd);
    if (out.length < 2 || insertAt !== -1) {
      out.splice(insertAt === -1 ? out.length : Math.max(insertAt, 1), 0, split);
    }
  }

  if (!out.length) {
    // Nothing fits: offer the biggest pieces so at least some work gets scheduled.
    const biggest = [...slots].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    for (const s of biggest) {
      out.push({
        kind: "partial",
        blocks: [{ start: s.start, end: s.end, step_id: null }],
        coversMin: Math.round((s.end - s.start) / MIN),
      });
    }
  }
  return out.slice(0, limit);
}

/** Greedy: each unfinished step goes into the earliest slot that fits it, one step per slot. */
function splitBySteps(slots: Interval[], steps: StepInput[]): SlotSuggestion | null {
  const sized = steps.filter((s) => s.estimate_min && s.estimate_min > 0);
  if (sized.length < 2) return null;
  const blocks: PlannedBlock[] = [];
  let i = 0;
  for (const step of sized) {
    const len = step.estimate_min! * MIN;
    while (i < slots.length && slots[i]!.end - slots[i]!.start < len) i++;
    const slot = slots[i];
    if (!slot) return null;
    blocks.push({ start: slot.start, end: slot.start + len, step_id: step.id });
    i++;
  }
  return {
    kind: "split",
    blocks,
    coversMin: sized.reduce((sum, s) => sum + s.estimate_min!, 0),
  };
}
