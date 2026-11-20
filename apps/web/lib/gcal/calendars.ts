import "server-only";
import { calendarClient } from "@/lib/google";
import { adminClient } from "@/lib/supabase/admin";

const TASKS_CALENDAR_SUMMARY = "Tapestry";
/** What the calendar was called before the rename to Tapestry. */
export const LEGACY_TASKS_CALENDAR_SUMMARY = "Tasks";
// Marks the calendar this app owns, so a reconnect finds it instead of creating another.
export const TASKS_CALENDAR_MARKER = "Managed by Tapestry. Time blocks for your to-dos live here.";
const LEGACY_MARKERS = ["Managed by Timeline To-Do. Time blocks for tasks live here."];

/** True for the calendar this app created, under its current or an older marker. */
export function isOurCalendar(description: string | null | undefined): boolean {
  return (
    description === TASKS_CALENDAR_MARKER ||
    (!!description && LEGACY_MARKERS.includes(description))
  );
}

type CalendarRow = {
  user_id: string;
  id: string;
  summary: string;
  color: string | null;
  selected: boolean;
  is_tasks_calendar: boolean;
};

/**
 * Mirrors the user's calendar list into `calendars`, creating the app's own calendar
 * ("Tapestry") if needed. Existing selections are kept; new calendars start selected only if primary.
 */
export async function discoverCalendars(userId: string): Promise<CalendarRow[]> {
  const gcal = await calendarClient(userId);
  const db = adminClient();

  const items = [];
  let pageToken: string | undefined;
  do {
    const res = await gcal.calendarList.list({ pageToken, maxResults: 250 });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Ours means our marker AND owned by this user: a calendar someone else shares with the user
  // could copy the marker, and would then receive (and be able to move) the user's blocks.
  let tasksCal = items.find((c) => isOurCalendar(c.description) && c.accessRole === "owner");
  if (tasksCal?.id && tasksCal.description !== TASKS_CALENDAR_MARKER) {
    // Created before the rename: move it to the new marker, and to the new name unless the
    // user renamed it. Best effort, so a failed rename never stops discovery.
    try {
      const rename = tasksCal.summary === LEGACY_TASKS_CALENDAR_SUMMARY;
      const patched = await gcal.calendars.patch({
        calendarId: tasksCal.id,
        requestBody: {
          description: TASKS_CALENDAR_MARKER,
          ...(rename ? { summary: TASKS_CALENDAR_SUMMARY } : {}),
        },
      });
      tasksCal.description = patched.data.description;
      tasksCal.summary = patched.data.summary;
    } catch (e) {
      console.error("discoverCalendars: renaming the app calendar failed", e);
    }
  }
  if (!tasksCal) {
    const created = await gcal.calendars.insert({
      requestBody: { summary: TASKS_CALENDAR_SUMMARY, description: TASKS_CALENDAR_MARKER },
    });
    tasksCal = { id: created.data.id, summary: created.data.summary, accessRole: "owner" };
    items.push(tasksCal);
  }

  const { data: existing, error } = await db
    .from("calendars")
    .select("id, selected")
    .eq("user_id", userId)
    .returns<{ id: string; selected: boolean }[]>();
  if (error) throw new Error(error.message);
  const prevSelected = new Map(existing.map((c) => [c.id, c.selected]));

  const rows: CalendarRow[] = items
    .filter((c): c is typeof c & { id: string } => !!c.id)
    .map((c) => {
      const isTasks = c.id === tasksCal.id;
      return {
        user_id: userId,
        id: c.id,
        summary: c.summaryOverride ?? c.summary ?? c.id,
        color: c.backgroundColor ?? null,
        selected: isTasks || (prevSelected.get(c.id) ?? !!c.primary),
        is_tasks_calendar: isTasks,
      };
    });

  const { error: upsertErr } = await db.from("calendars").upsert(rows as never);
  if (upsertErr) throw new Error(upsertErr.message);

  const gone = existing.map((c) => c.id).filter((id) => !rows.some((r) => r.id === id));
  if (gone.length) {
    await db.from("calendars").delete().eq("user_id", userId).in("id", gone);
  }
  return rows;
}

export async function tasksCalendarId(userId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from("calendars")
    .select("id")
    .eq("user_id", userId)
    .eq("is_tasks_calendar", true)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
