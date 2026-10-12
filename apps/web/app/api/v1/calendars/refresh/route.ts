import { route } from "@/lib/api";
import { discoverCalendars } from "@/lib/gcal/calendars";
import { activeCalendarIds } from "@/lib/gcal/manage";
import { syncCalendar } from "@/lib/gcal/sync";

export const maxDuration = 120;

/** Re-reads the calendar list and syncs active calendars now ("pull to refresh"). */
export const POST = route(async (_req, { user }) => {
  await discoverCalendars(user.id);
  const ids = await activeCalendarIds(user.id);
  await Promise.all(ids.map((id) => syncCalendar(user.id, id)));
  return { ok: true, synced: ids.length };
});
