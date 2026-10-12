import { after, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { syncCalendar } from "@/lib/gcal/sync";
import { adminClient } from "@/lib/supabase/admin";

/** Google Calendar push notification receiver. Notifications carry no data; we just re-sync. */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");
  const state = req.headers.get("x-goog-resource-state");
  if (!channelId || !token) return new Response(null, { status: 400 });

  const { data } = await adminClient()
    .from("calendar_sync_state")
    .select("user_id, calendar_id, channel_token")
    .eq("channel_id", channelId)
    .maybeSingle<{ user_id: string; calendar_id: string; channel_token: string | null }>();
  // Unknown or stale channel: answer 200 so Google doesn't retry; it will expire on its own.
  if (!data?.channel_token || !safeEqual(data.channel_token, token)) {
    return new Response(null, { status: 200 });
  }

  if (state !== "sync") {
    after(() =>
      syncCalendar(data.user_id, data.calendar_id).catch((e) => console.error("webhook sync", e)),
    );
  }
  return new Response(null, { status: 200 });
}
