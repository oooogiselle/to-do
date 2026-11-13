/** A block checked off early is never trimmed shorter than this, so it stays visible. */
export const MIN_TRIMMED_MIN = 5;

/**
 * New end for a block whose to-do was checked off at `now`: the check-off time (to the minute),
 * but at least MIN_TRIMMED_MIN after the start. Null when the block isn't running or trimming
 * wouldn't shorten it.
 */
export function trimmedEnd(block: { start: string; end: string }, now: Date): string | null {
  const start = Date.parse(block.start);
  const end = Date.parse(block.end);
  const t = now.getTime();
  if (t < start || t >= end) return null;
  const minute = Math.floor(t / 60_000) * 60_000;
  const next = Math.max(minute, start + MIN_TRIMMED_MIN * 60_000);
  return next < end ? new Date(next).toISOString() : null;
}
