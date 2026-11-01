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

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Wall-clock minutes of `instant` measured from local midnight of `day` in `tz`: 9:00 is 540
 * even on a 23h/25h DST day. Negative or past 1440 when `instant` falls on another day.
 */
export function minuteOfDay(instant: number, day: string, tz: string): number {
  const z = new TZDate(instant, tz);
  const dayOffset = dayNumber(localDate(new Date(instant), tz)) - dayNumber(day);
  return (
    dayOffset * 1440 +
    z.getHours() * 60 +
    z.getMinutes() +
    (z.getSeconds() + z.getMilliseconds() / 1000) / 60
  );
}

/** The instant whose wall clock reads `minute` minutes past local midnight of `day` (inverse of minuteOfDay). */
export function atMinuteOfDay(day: string, minute: number, tz: string): number {
  const days = Math.floor(minute / 1440);
  const rest = minute - days * 1440;
  const whole = Math.floor(rest);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
  return zonedInstant(addDays(day, days), time, tz).getTime() + (rest - whole) * 60_000;
}
