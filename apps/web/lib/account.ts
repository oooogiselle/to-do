import "server-only";
import { decrypt } from "@/lib/crypto";
import { isDemo } from "@/lib/demo";
import { TASKS_CALENDAR_MARKER } from "@/lib/gcal/calendars";
import { stopWatch } from "@/lib/gcal/watch";
import { calendarClient, googleStatus, oauthClient } from "@/lib/google";
import { adminClient } from "@/lib/supabase/admin";

export type DeleteAccountResult = {
  /** Google clean-up steps that didn't finish. The account is deleted regardless. */
  warnings: string[];
};

/**
 * Permanently deletes a user and everything they own.
 *
 * Google clean-up is best effort: if Google is down or the token is already dead, the account
 * is still deleted, because the right to delete must not depend on Google. Deleting the auth
 * user cascades to every table (see the `on delete cascade` references to auth.users).
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const warnings: string[] = [];
  const db = adminClient();

  if (!isDemo()) await cleanUpGoogle(userId, warnings);

  // Uploads are deleted right after extraction, but a failed import can leave one behind.
  try {
    const files = db.storage.from("imports");
    const { data } = await files.list(userId, { limit: 1000 });
    if (data?.length) await files.remove(data.map((f) => `${userId}/${f.name}`));
  } catch (err) {
    console.error("deleteAccount: upload clean-up failed", err);
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Couldn't delete the account: ${error.message}`);
  return { warnings };
}

async function cleanUpGoogle(userId: string, warnings: string[]): Promise<void> {
  const db = adminClient();
  const { data: account } = await db
    .from("google_accounts")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle<{ refresh_token_enc: string }>();
  if (!account) return; // never connected Google Calendar

  // 1. Stop push channels so Google stops calling the webhook for this user.
  const { data: channels } = await db
    .from("calendar_sync_state")
    .select("calendar_id")
    .eq("user_id", userId)
    .not("channel_id", "is", null)
    .returns<{ calendar_id: string }[]>();
  for (const { calendar_id } of channels ?? []) {
    try {
      await stopWatch(userId, calendar_id);
    } catch (err) {
      console.error("deleteAccount: stopWatch failed", err);
      warnings.push("Couldn't stop calendar notifications.");
      break; // a dead token fails every channel the same way
    }
  }

  // 2. Delete the calendar this app created. Never any other calendar: it must be flagged as
  //    ours in our table and still carry our marker in Google.
  const { data: tasksCal } = await db
    .from("calendars")
    .select("id")
    .eq("user_id", userId)
    .eq("is_tasks_calendar", true)
    .maybeSingle<{ id: string }>();
  if (tasksCal) {
    try {
      const gcal = await calendarClient(userId);
      const { data } = await gcal.calendars.get({ calendarId: tasksCal.id });
      if (data.description === TASKS_CALENDAR_MARKER) {
        await gcal.calendars.delete({ calendarId: tasksCal.id });
      }
    } catch (err) {
      const status = googleStatus(err);
      if (status !== 404 && status !== 410) {
        console.error("deleteAccount: Tasks calendar delete failed", err);
        warnings.push("Couldn't delete the Tasks calendar from Google Calendar.");
      }
    }
  }

  // 3. Revoke our access, so the app disappears from the user's Google account permissions.
  try {
    await oauthClient().revokeToken(decrypt(account.refresh_token_enc));
  } catch (err) {
    console.error("deleteAccount: token revoke failed", err);
    warnings.push("Couldn't revoke access in your Google account. You can remove it there.");
  }
}
