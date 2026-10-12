import { TZDate } from "@date-fns/tz";

/** The instant at which local wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm") occurs in `tz`. */
export function zonedInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, tz).getTime());
}

/** "YYYY-MM-DD" of `instant` as seen in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const z = new TZDate(instant.getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Day of week (0 = Sunday) of `instant` as seen in `tz`. */
export function localWeekday(instant: Date, tz: string): number {
  return new TZDate(instant.getTime(), tz).getDay();
}

/** Adds whole calendar days to a "YYYY-MM-DD" string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
