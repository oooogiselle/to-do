import {
  addDays,
  atMinuteOfDay,
  minuteOfDay,
  zonedInstant,
  type CalendarEvent,
  type TimeBlock,
} from "@tt/shared";

export const HOUR_PX = 48;
/** Zoom range for the web timeline: the whole day on screen, down to 15 minutes ≈ 48px. */
export const MIN_HOUR_PX = 24;
export const MAX_HOUR_PX = 192;
export const DAY_MIN = 24 * 60;

export type Positioned<T> = T & { top: number; height: number; lane: number; lanes: number };

/** Part of [start, end) that falls on local `day`, in minutes from that day's midnight. */
export function daySegment(
  start: number,
  end: number,
  day: string,
  tz: string,
): { startMin: number; endMin: number } | null {
  const dayStart = zonedInstant(day, "00:00", tz).getTime();
  const dayEnd = zonedInstant(addDays(day, 1), "00:00", tz).getTime();
  const s = Math.max(start, dayStart);
  const e = Math.min(end, dayEnd);
  if (e <= s) return null;
  // Wall-clock minutes, so 9:00 sits on the 9am row even on 23h/25h DST days.
  const startMin = minuteOfDay(s, day, tz);
  const endMin = e === dayEnd ? DAY_MIN : minuteOfDay(e, day, tz);
  // Ending in the repeated fall-back hour can read earlier than the start.
  return { startMin, endMin: Math.max(endMin, startMin) };
}

/** Side-by-side lanes for overlapping items: each cluster of overlaps shares its width. */
export function assignLanes<T extends { startMin: number; endMin: number }>(
  items: T[],
  hourPx = HOUR_PX,
): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.endMin;
    clusterEnd = Math.max(clusterEnd, item.endMin);
    cluster.push({
      ...item,
      lane,
      lanes: 1,
      top: (item.startMin / 60) * hourPx,
      height: Math.max(((item.endMin - item.startMin) / 60) * hourPx, 14),
    });
  }
  flush();
  return out;
}

/** Instant for `minute` minutes into local `day` (inverse of daySegment, by wall clock). */
export function instantAt(day: string, minute: number, tz: string): number {
  return atMinuteOfDay(day, minute, tz);
}

export const SNAP_MIN = 15;
export const snap = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN;

export type DayItem =
  | { kind: "event"; key: string; startMin: number; endMin: number; event: CalendarEvent }
  | { kind: "block"; key: string; startMin: number; endMin: number; block: TimeBlock };

/** Timed events and blocks on local `day`, positioned in side-by-side lanes. */
export function layoutDay(
  day: string,
  tz: string,
  events: CalendarEvent[],
  blocks: TimeBlock[],
  hourPx = HOUR_PX,
): Positioned<DayItem>[] {
  const out: DayItem[] = [];
  for (const e of events) {
    const seg = daySegment(Date.parse(e.start), Date.parse(e.end), day, tz);
    if (seg)
      out.push({ ...seg, kind: "event", key: `e-${e.calendar_id}-${e.gcal_event_id}`, event: e });
  }
  for (const b of blocks) {
    const seg = daySegment(Date.parse(b.start), Date.parse(b.end), day, tz);
    if (seg) out.push({ ...seg, kind: "block", key: `b-${b.id}`, block: b });
  }
  return assignLanes(out, hourPx);
}
