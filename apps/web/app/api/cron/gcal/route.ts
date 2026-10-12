import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { activeCalendarIds } from "@/lib/gcal/manage";
import { syncCalendar } from "@/lib/gcal/sync";
import { pushEnabled, startWatch } from "@/lib/gcal/watch";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const POLL_AFTER_MS = 15 * 60 * 1000;
// Runs daily on Vercel Hobby, so renew well before the ~7-day channel expiry.
const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;

type StateRow = {
  calendar_id: string;
  channel_id: string | null;
  channel_expires_at: string | null;
  last_synced_at: string | null;
};

/**
 * Fallback for push notifications (Vercel Cron, daily on Hobby): renews watch channels close
 * to expiry and polls any active calendar that hasn't synced in the last 15 minutes.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return new Response(null, { status: 401 });
  }
  const db = adminClient();
  const { data: accounts, error } = await db
    .from("google_accounts")
    .select("user_id")
    .returns<{ user_id: string }[]>();
  if (error) throw new Error(error.message);

  const now = Date.now();
  const results: Record<string, string> = {};
  for (const { user_id: userId } of accounts) {
    const { data: states } = await db
      .from("calendar_sync_state")
      .select("calendar_id, channel_id, channel_expires_at, last_synced_at")
      .eq("user_id", userId)
      .returns<StateRow[]>();
    const byId = new Map((states ?? []).map((s) => [s.calendar_id, s]));

    for (const calendarId of await activeCalendarIds(userId)) {
      const s = byId.get(calendarId);
      try {
        if (!s?.last_synced_at || now - Date.parse(s.last_synced_at) > POLL_AFTER_MS) {
          await syncCalendar(userId, calendarId);
          results[calendarId] = "synced";
        }
        const expiring =
          !s?.channel_id ||
          !s.channel_expires_at ||
          Date.parse(s.channel_expires_at) - now < RENEW_BEFORE_MS;
        if (pushEnabled() && expiring) {
          await startWatch(userId, calendarId);
          results[calendarId] = (results[calendarId] ? results[calendarId] + "+" : "") + "watched";
        }
      } catch (e) {
        console.error("cron gcal", calendarId, e);
        results[calendarId] = "error";
      }
    }
  }
  return NextResponse.json({ ok: true, results });
}
