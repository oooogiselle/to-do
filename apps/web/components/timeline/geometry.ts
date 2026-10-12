import { zonedInstant, addDays } from "@tt/shared";

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
