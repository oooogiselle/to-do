import type { CalendarEvent } from "../schemas";

/** Calendar events are fetched in fixed 7-day buckets so every view shares the same queries. */
export const EVENT_BUCKET_MS = 7 * 86_400_000;
/** Buckets start on Mondays 00:00 UTC (the epoch was a Thursday, 1970-01-05 a Monday). */
const BUCKET_ORIGIN = Date.UTC(1970, 0, 5);

/** Start of the bucket holding instant `t`. */
export function eventBucketOf(t: number): number {
  return BUCKET_ORIGIN + Math.floor((t - BUCKET_ORIGIN) / EVENT_BUCKET_MS) * EVENT_BUCKET_MS;
}

/** Starts of the buckets overlapping [from, to), in order. Empty when the range is empty. */
export function eventBuckets(from: number, to: number): number[] {
  const out: number[] = [];
  if (to <= from) return out;
  for (let b = eventBucketOf(from); b < to; b += EVENT_BUCKET_MS) out.push(b);
  return out;
}

/**
 * Events from several buckets, combined: each event once (an event crossing a bucket edge
 * comes back in both), only those overlapping [from, to), sorted by start.
 */
export function mergeEvents(lists: CalendarEvent[][], from: number, to: number): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const list of lists) {
    for (const e of list) {
      const key = `${e.calendar_id}\u0000${e.gcal_event_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Date.parse(e.end) > from && Date.parse(e.start) < to) out.push(e);
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
