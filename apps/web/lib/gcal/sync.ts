import "server-only";
import type { calendar_v3 } from "@googleapis/calendar";
import { zonedInstant } from "@tt/shared";
import { calendarClient, googleStatus } from "@/lib/google";
import { deleteBlockEvent } from "@/lib/gcal/write";
import { adminClient } from "@/lib/supabase/admin";

const FULL_SYNC_PAST_DAYS = 30;
const FULL_SYNC_FUTURE_DAYS = 120;
const DELETE_CHUNK = 100;
/** Supabase caps a response at 1000 rows (`max_rows`), so load in pages. */
const PAGE = 1000;
/**
 * A block's event is created a moment before its row. An event younger than this with no row
 * may be mid-create, so reconcile leaves it alone.
 */
const ORPHAN_MIN_AGE_MS = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Window = { timeMin: string; timeMax: string };

/**
 * gcal's fixed event palette by colorId, as the Google Calendar UI shows it. colors.get returns
 * older pastel values that don't match what the user sees.
 */
const EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb", // Lavender
  "2": "#33b679", // Sage
  "3": "#8e24aa", // Grape
  "4": "#e67c73", // Flamingo
  "5": "#f6bf26", // Banana
  "6": "#f4511e", // Tangerine
  "7": "#039be5", // Peacock
  "8": "#616161", // Graphite
  "9": "#3f51b5", // Blueberry
  "10": "#0b8043", // Basil
  "11": "#d50000", // Tomato
};

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
  color: string | null;
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

  const startedAt = Date.now();
  const window = fullSyncWindow(startedAt);
  // On the Tapestry calendar, the app's block events a full pull lists (blockId -> event).
  const seen = new Map<string, calendar_v3.Schema$Event>();
  const onPage = async (events: calendar_v3.Schema$Event[]) => {
    if (cal.is_tasks_calendar) {
      for (const ev of events) {
        const blockId = ev.extendedProperties?.private?.blockId;
        if (blockId && ev.id && ev.status !== "cancelled") seen.set(blockId, ev);
      }
    }
    await applyEvents(userId, calendarId, cal.is_tasks_calendar, tz, events);
  };

  let syncToken = state?.sync_token ?? null;
  let nextSyncToken: string | undefined;
  try {
    nextSyncToken = await pull(gcal, calendarId, syncToken, window, onPage);
  } catch (err) {
    if (googleStatus(err) !== 410 || !syncToken) throw err;
    // Token expired: drop the cache for this calendar and start over.
    syncToken = null;
    seen.clear();
    await db.from("calendar_events").delete().eq("user_id", userId).eq("calendar_id", calendarId);
    nextSyncToken = await pull(gcal, calendarId, null, window, onPage);
  }
  // A full pull lists only what exists, so it can't report deletions the way an incremental
  // one does. Check the blocks against it.
  if (cal.is_tasks_calendar && !syncToken) {
    await reconcileTasksCalendar(userId, gcal, calendarId, seen, startedAt, window);
  }

  const { error } = await db.from("calendar_sync_state").upsert({
    user_id: userId,
    calendar_id: calendarId,
    sync_token: nextSyncToken ?? syncToken,
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

function fullSyncWindow(now: number): Window {
  const day = 24 * 60 * 60 * 1000;
  return {
    timeMin: new Date(now - FULL_SYNC_PAST_DAYS * day).toISOString(),
    timeMax: new Date(now + FULL_SYNC_FUTURE_DAYS * day).toISOString(),
  };
}

async function pull(
  gcal: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null,
  window: Window,
  onPage: (events: calendar_v3.Schema$Event[]) => Promise<void>,
): Promise<string | undefined> {
  let pageToken: string | undefined;
  for (;;) {
    const res = await gcal.events.list({
      calendarId,
      pageToken,
      maxResults: 2500,
      singleEvents: true,
      showDeleted: !!syncToken,
      ...(syncToken ? { syncToken } : window),
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
  // The ids go in the URL; one request for a whole cancelled series overflows the gateway's
  // URL limit and comes back as a bare 400.
  for (let i = 0; i < cancelled.length; i += DELETE_CHUNK) {
    const { error } = await db
      .from("calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", calendarId)
      .in("gcal_event_id", cancelled.slice(i, i + DELETE_CHUNK));
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
    // No colorId means the event uses its calendar's color.
    color: (ev.colorId && EVENT_COLORS[ev.colorId]) || null,
  };
}

/** Applies a gcal-side move or delete of one of the app's own TimeBlock events. */
async function reconcileTimeBlock(userId: string, blockId: string, ev: calendar_v3.Schema$Event) {
  const db = adminClient();
  const { data: block } = await db
    .from("time_blocks")
    .select("start, end, deleted_at, updated_at")
    .eq("user_id", userId)
    .eq("id", blockId)
    .maybeSingle<{ start: string; end: string; deleted_at: string | null; updated_at: string }>();
  if (!block || block.deleted_at) return;
  // A sync that fetched the event before the app's latest move/resize would otherwise write the
  // older times back. Only Google-side edits made after our last write win.
  if (ev.updated && Date.parse(ev.updated) < Date.parse(block.updated_at)) return;

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

/**
 * After a full pull of the Tapestry calendar, puts blocks and their events back in step:
 * - A live block in the window whose event wasn't listed may have been deleted in Google while
 *   there was no sync token to report it. It's unscheduled only if Google confirms this calendar
 *   had the event and deleted it. After a reconnect that made a new calendar, the old blocks'
 *   events were never in this one (404), and those blocks are left alone.
 * - A listed event whose block row is missing (the request died between creating the event and
 *   the row) or deleted is removed from Google. deleteBlockEvent only ever touches this calendar.
 * Blocks written and events created after the pull began are skipped: the listing may predate them.
 */
async function reconcileTasksCalendar(
  userId: string,
  gcal: calendar_v3.Calendar,
  calendarId: string,
  seen: Map<string, calendar_v3.Schema$Event>,
  startedAt: number,
  window: Window,
) {
  const db = adminClient();

  const blocks: { id: string; gcal_event_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("time_blocks")
      .select("id, gcal_event_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .lt("start", window.timeMax)
      .gt("end", window.timeMin)
      .lt("updated_at", new Date(startedAt).toISOString())
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    blocks.push(...data);
    if (data.length < PAGE) break;
  }
  // Demo-mode blocks have no event in Google.
  const unlisted = blocks.filter((b) => !seen.has(b.id) && !b.gcal_event_id.startsWith("local-"));
  const missing: string[] = [];
  for (const b of unlisted) {
    if (await eventDeleted(gcal, calendarId, b.gcal_event_id)) missing.push(b.id);
  }
  for (let i = 0; i < missing.length; i += DELETE_CHUNK) {
    const { error } = await db
      .from("time_blocks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", missing.slice(i, i + DELETE_CHUNK))
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
  }

  const candidates = [...seen.entries()].filter(
    ([blockId, ev]) =>
      UUID.test(blockId) && ev.created && Date.parse(ev.created) < startedAt - ORPHAN_MIN_AGE_MS,
  );
  const live = new Set<string>();
  for (let i = 0; i < candidates.length; i += DELETE_CHUNK) {
    const { data, error } = await db
      .from("time_blocks")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("id", candidates.slice(i, i + DELETE_CHUNK).map(([id]) => id));
    if (error) throw new Error(error.message);
    for (const row of data) live.add(row.id);
  }
  for (const [blockId, ev] of candidates) {
    if (!live.has(blockId)) await deleteBlockEvent(userId, ev.id!);
  }
}

/** Whether Google says this calendar had the event and it was deleted (not just never here). */
async function eventDeleted(gcal: calendar_v3.Calendar, calendarId: string, eventId: string) {
  try {
    const { data } = await gcal.events.get({ calendarId, eventId });
    return data.status === "cancelled";
  } catch (err) {
    if (googleStatus(err) === 410) return true;
    if (googleStatus(err) === 404) return false;
    throw err;
  }
}
