/** gcal title for a TimeBlock: "[List] Task — Step", dropping the parts that are absent. */
export function eventTitle(listName: string | null | undefined, task: string, step?: string | null) {
  const prefix = listName ? `[${listName}] ` : "";
  return `${prefix}${task}${step ? ` — ${step}` : ""}`;
}

/** "45m", "1h", "1h 30m". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
