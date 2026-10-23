import { zonedInstant, addDays, type CalendarEvent, type TimeBlock } from "@tt/shared";

export const HOUR_PX = 48;
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
  // Scale by the real day length so 23h/25h DST days still fill the column.
  const scale = DAY_MIN / ((dayEnd - dayStart) / 60_000);
  return { startMin: ((s - dayStart) / 60_000) * scale, endMin: ((e - dayStart) / 60_000) * scale };
}

/** Side-by-side lanes for overlapping items: each cluster of overlaps shares its width. */
export function assignLanes<T extends { startMin: number; endMin: number }>(
  items: T[],
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
      top: (item.startMin / 60) * HOUR_PX,
      height: Math.max(((item.endMin - item.startMin) / 60) * HOUR_PX, 14),
    });
  }
  flush();
  return out;
}

/** Instant for `minute` minutes into local `day` (inverse of daySegment, DST-aware). */
export function instantAt(day: string, minute: number, tz: string): number {
  const dayStart = zonedInstant(day, "00:00", tz).getTime();
  const dayEnd = zonedInstant(addDays(day, 1), "00:00", tz).getTime();
  const scale = (dayEnd - dayStart) / 60_000 / DAY_MIN;
  return dayStart + minute * scale * 60_000;
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
  return assignLanes(out);
}
