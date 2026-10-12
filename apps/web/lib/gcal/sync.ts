import "server-only";
import type { calendar_v3 } from "@googleapis/calendar";
import { zonedInstant } from "@tt/shared";
import { calendarClient, googleStatus } from "@/lib/google";
import { adminClient } from "@/lib/supabase/admin";

const FULL_SYNC_PAST_DAYS = 30;
const FULL_SYNC_FUTURE_DAYS = 120;

type SyncState = { sync_token: string | null };
type EventRow = {
  user_id: string;
  calendar_id: string;
  gcal_event_id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  busy: boolean;
};

/**
 * Pulls changes for one calendar using gcal incremental sync tokens. Falls back to a full
 * sync of a bounded window when there is no token or Google invalidates it (410).
 *
 * Events in the Tasks calendar that carry a blockId are the app's own TimeBlocks: they are
 * reconciled into `time_blocks` (moves update times, deletes unschedule) instead of being
 * cached as busy events.
 */
export async function syncCalendar(userId: string, calendarId: string): Promise<void> {
  const db = adminClient();
  const [{ data: cal }, { data: state }, { data: settings }] = await Promise.all([
    db
      .from("calendars")
      .select("is_tasks_calendar")
      .eq("user_id", userId)
      .eq("id", calendarId)
      .maybeSingle<{ is_tasks_calendar: boolean }>(),
    db
      .from("calendar_sync_state")
      .select("sync_token")
      .eq("user_id", userId)
      .eq("calendar_id", calendarId)
      .maybeSingle<SyncState>(),
    db
      .from("settings")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle<{ timezone: string }>(),
  ]);
  if (!cal) return; // Calendar was removed or deselected meanwhile.
  const tz = settings?.timezone ?? "UTC";
  const gcal = await calendarClient(userId);

  let syncToken = state?.sync_token ?? null;
  let nextSyncToken: string | undefined;
  try {
    nextSyncToken = await pull(gcal, calendarId, syncToken, async (events) => {
      await applyEvents(userId, calendarId, cal.is_tasks_calendar, tz, events);
    });
  } catch (err) {
    if (googleStatus(err) !== 410 || !syncToken) throw err;
    // Token expired: drop the cache for this calendar and start over.
    syncToken = null;
    await db.from("calendar_events").delete().eq("user_id", userId).eq("calendar_id", calendarId);
    nextSyncToken = await pull(gcal, calendarId, null, async (events) => {
      await applyEvents(userId, calendarId, cal.is_tasks_calendar, tz, events);
    });
  }

  const { error } = await db.from("calendar_sync_state").upsert({
    user_id: userId,
    calendar_id: calendarId,
    sync_token: nextSyncToken ?? syncToken,
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

async function pull(
  gcal: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null,
  onPage: (events: calendar_v3.Schema$Event[]) => Promise<void>,
): Promise<string | undefined> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let pageToken: string | undefined;
  for (;;) {
    const res = await gcal.events.list({
      calendarId,
      pageToken,
      maxResults: 2500,
      singleEvents: true,
      showDeleted: !!syncToken,
      ...(syncToken
        ? { syncToken }
        : {
            timeMin: new Date(now - FULL_SYNC_PAST_DAYS * day).toISOString(),
            timeMax: new Date(now + FULL_SYNC_FUTURE_DAYS * day).toISOString(),
          }),
    });
    await onPage(res.data.items ?? []);
    if (res.data.nextPageToken) {
      pageToken = res.data.nextPageToken;
    } else {
      return res.data.nextSyncToken ?? undefined;
    }
  }
}

async function applyEvents(
  userId: string,
  calendarId: string,
  isTasksCalendar: boolean,
  tz: string,
  events: calendar_v3.Schema$Event[],
) {
  const db = adminClient();
  const upserts: EventRow[] = [];
  const cancelled: string[] = [];

  for (const ev of events) {
    if (!ev.id) continue;
    const blockId = ev.extendedProperties?.private?.blockId;

    if (isTasksCalendar && blockId) {
      await reconcileTimeBlock(userId, blockId, ev);
      continue;
    }
    if (ev.status === "cancelled") {
      cancelled.push(ev.id);
      continue;
    }
    const row = toEventRow(userId, calendarId, ev, tz);
    if (row) upserts.push(row);
  }

  if (upserts.length) {
    const { error } = await db.from("calendar_events").upsert(upserts);
    if (error) throw new Error(error.message);
  }
  if (cancelled.length) {
    const { error } = await db
      .from("calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", calendarId)
      .in("gcal_event_id", cancelled);
    if (error) throw new Error(error.message);
  }
}

function toEventRow(
  userId: string,
  calendarId: string,
  ev: calendar_v3.Schema$Event,
  tz: string,
): EventRow | null {
  const allDay = !!ev.start?.date;
  const start = allDay
    ? zonedInstant(ev.start!.date!, "00:00", tz).toISOString()
    : ev.start?.dateTime;
  const end = allDay ? zonedInstant(ev.end!.date!, "00:00", tz).toISOString() : ev.end?.dateTime;
  if (!start || !end) return null;
  // Events the user declined don't block time.
  const declined = ev.attendees?.some((a) => a.self && a.responseStatus === "declined");
  return {
    user_id: userId,
    calendar_id: calendarId,
    gcal_event_id: ev.id!,
    title: ev.summary ?? "(No title)",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    all_day: allDay,
    // gcal's "Show as: Free" sets transparency=transparent; all-day events default to it.
    busy: ev.transparency !== "transparent" && !declined,
  };
}

/** Applies a gcal-side move or delete of one of the app's own TimeBlock events. */
async function reconcileTimeBlock(userId: string, blockId: string, ev: calendar_v3.Schema$Event) {
  const db = adminClient();
  const { data: block } = await db
    .from("time_blocks")
    .select("start, end, deleted_at")
    .eq("user_id", userId)
    .eq("id", blockId)
    .maybeSingle<{ start: string; end: string; deleted_at: string | null }>();
  if (!block || block.deleted_at) return;

  if (ev.status === "cancelled") {
    await db
      .from("time_blocks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", blockId);
    return;
  }
  const start = ev.start?.dateTime;
  const end = ev.end?.dateTime;
  if (!start || !end) return;
  // Our own writes echo back through sync; only touch the row if the times really changed.
  if (Date.parse(start) === Date.parse(block.start) && Date.parse(end) === Date.parse(block.end)) {
    return;
  }
  await db
    .from("time_blocks")
    .update({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
    .eq("user_id", userId)
    .eq("id", blockId);
}
