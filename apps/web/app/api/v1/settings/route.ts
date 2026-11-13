import { SettingsPatch } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

const COLUMNS = "working_hours, default_block_min, timezone, someday_assistant, scheduling, updated_at";

/** Settings plus Google connection status (the token table itself is server-only). */
export const GET = route(async (_req, { supabase, user }) => {
  const settings = unwrap(await supabase.from("settings").select(COLUMNS).single());
  const { data: google } = await adminClient()
    .from("google_accounts")
    .select("email, needs_reconnect")
    .eq("user_id", user.id)
    .maybeSingle<{ email: string; needs_reconnect: boolean }>();
  return {
    settings,
    google: google ? { email: google.email, needs_reconnect: google.needs_reconnect } : null,
  };
});

export const PATCH = route(async (req, { supabase, user }) => {
  const body = await parseBody(req, SettingsPatch);
  if (body.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
    } catch {
      return Response.json({ error: "Unknown timezone" }, { status: 400 });
    }
  }
  return unwrap(
    await supabase.from("settings").update(body).eq("user_id", user.id).select(COLUMNS).single(),
  );
});
