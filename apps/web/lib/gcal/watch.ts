import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { calendarClient } from "@/lib/google";
import { adminClient } from "@/lib/supabase/admin";

type ChannelState = { channel_id: string | null; resource_id: string | null };

/** Google only delivers push notifications to HTTPS endpoints; without one we rely on polling. */
export function pushEnabled(): boolean {
  return env.webhookBaseUrl.startsWith("https://");
}

/** Opens a push channel for a calendar's events, replacing any existing channel. */
export async function startWatch(userId: string, calendarId: string): Promise<void> {
  if (!pushEnabled()) return;
  const db = adminClient();
  const gcal = await calendarClient(userId);

  await stopWatch(userId, calendarId);

  const channelId = randomUUID();
  const token = randomBytes(24).toString("base64url");
  const res = await gcal.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${env.webhookBaseUrl}/api/google/webhook`,
      token,
    },
  });

  const { error } = await db.from("calendar_sync_state").upsert({
    user_id: userId,
    calendar_id: calendarId,
    channel_id: channelId,
    channel_token: token,
    resource_id: res.data.resourceId,
    channel_expires_at: res.data.expiration
      ? new Date(Number(res.data.expiration)).toISOString()
      : null,
  });
  if (error) throw new Error(error.message);
}

export async function stopWatch(userId: string, calendarId: string): Promise<void> {
  const db = adminClient();
  const { data } = await db
    .from("calendar_sync_state")
    .select("channel_id, resource_id")
    .eq("user_id", userId)
    .eq("calendar_id", calendarId)
    .maybeSingle<ChannelState>();
  if (!data?.channel_id || !data.resource_id) return;

  const gcal = await calendarClient(userId);
  try {
    await gcal.channels.stop({
      requestBody: { id: data.channel_id, resourceId: data.resource_id },
    });
  } catch {
    // Channel may already be expired or gone; nothing else to do.
  }
  await db
    .from("calendar_sync_state")
    .update({ channel_id: null, channel_token: null, resource_id: null, channel_expires_at: null })
    .eq("user_id", userId)
    .eq("calendar_id", calendarId);
}
