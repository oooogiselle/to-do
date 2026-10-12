import "server-only";
import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { decrypt } from "@/lib/crypto";
import { adminClient } from "@/lib/supabase/admin";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];

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

/** Calendar API client for a user, authed with their stored (encrypted) refresh token. */
export async function calendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const { data, error } = await adminClient()
    .from("google_accounts")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle<{ refresh_token_enc: string }>();
  if (error) throw new Error(error.message);
  if (!data) throw new GoogleNotConnectedError();
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(data.refresh_token_enc) });
  return calendar({ version: "v3", auth: client });
}

/** Google API errors carry the HTTP status on `code` or `status`. */
export function googleStatus(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number };
  return typeof e?.code === "number" ? e.code : e?.status;
}
