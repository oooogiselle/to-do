import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { discoverCalendars } from "@/lib/gcal/calendars";
import { syncCalendar } from "@/lib/gcal/sync";
import { startWatch, stopWatch } from "@/lib/gcal/watch";

/** Calendars the app keeps in sync: the ones the user marked busy, plus the Tasks calendar. */
export async function activeCalendarIds(userId: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("calendars")
    .select("id")
    .eq("user_id", userId)
    .or("selected.eq.true,is_tasks_calendar.eq.true")
    .returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  return data.map((c) => c.id);
}

/** Full setup after connecting Google: discover calendars, sync and watch the active ones. */
export async function bootstrapCalendars(userId: string): Promise<void> {
  await discoverCalendars(userId);
  for (const id of await activeCalendarIds(userId)) {
    await activateCalendar(userId, id);
  }
}

export async function activateCalendar(userId: string, calendarId: string): Promise<void> {
  await syncCalendar(userId, calendarId);
  await startWatch(userId, calendarId);
}

/** Stops syncing a deselected calendar and drops its cached events. */
export async function deactivateCalendar(userId: string, calendarId: string): Promise<void> {
  const db = adminClient();
  await stopWatch(userId, calendarId);
  await db.from("calendar_events").delete().eq("user_id", userId).eq("calendar_id", calendarId);
  await db.from("calendar_sync_state").delete().eq("user_id", userId).eq("calendar_id", calendarId);
}
