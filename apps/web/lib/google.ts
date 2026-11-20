import "server-only";
import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { decrypt } from "@/lib/crypto";
import { adminClient } from "@/lib/supabase/admin";

/**
 * The narrowest scopes that cover what the app does. The callback requires every scope after
 * openid/email, because Google's consent screen lets users untick them one by one.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  // calendarList.list: show the user's calendars in Settings.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  // events.list + events.watch: read events from the calendars the user picks.
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // Create the app's own calendar and manage it and its events. Never any other calendar.
  "https://www.googleapis.com/auth/calendar.app.created",
];

/** Cookie holding the nonce of an in-progress Google connect (see /api/google/connect). */
export const GOOGLE_NONCE_COOKIE = "tt_google_nonce";

export function oauthClient() {
  return new auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    `${env.appUrl}/api/google/callback`,
  );
}

export class GoogleNotConnectedError extends HttpError {
  constructor() {
    super(409, "Connect Google Calendar in Settings first");
  }
}

export class GoogleReconnectError extends HttpError {
  constructor() {
    super(409, "Google Calendar access expired. Reconnect it in Settings.");
  }
}

/** Google rejected the refresh token: revoked, or expired (Testing-mode apps: after 7 days). */
function isInvalidGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

/** Calendar API client for a user, authed with their stored (encrypted) refresh token. */
export async function calendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const { data, error } = await adminClient()
    .from("google_accounts")
    .select("refresh_token_enc, needs_reconnect")
    .eq("user_id", userId)
    .maybeSingle<{ refresh_token_enc: string; needs_reconnect: boolean }>();
  if (error) throw new Error(error.message);
  if (!data) throw new GoogleNotConnectedError();
  // Fail fast until the user reconnects, so cron and webhooks don't keep hitting Google.
  if (data.needs_reconnect) throw new GoogleReconnectError();
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(data.refresh_token_enc) });
  try {
    // Refresh now so a dead token surfaces here, not as an opaque error mid-sync.
    await client.getAccessToken();
  } catch (err) {
    if (!isInvalidGrant(err)) throw err;
    await adminClient()
      .from("google_accounts")
      .update({ needs_reconnect: true })
      .eq("user_id", userId);
    throw new GoogleReconnectError();
  }
  return calendar({ version: "v3", auth: client });
}

/** Google API errors carry the HTTP status on `code` or `status`. */
export function googleStatus(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number };
  return typeof e?.code === "number" ? e.code : e?.status;
}
