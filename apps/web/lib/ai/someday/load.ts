import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssistantNotes, type Database } from "@tt/shared";

/** The user's Someday assistant notes and timezone, from their settings row (via RLS). */
export async function assistantSettings(
  supabase: SupabaseClient<Database>,
): Promise<{ notes: AssistantNotes | null; timezone: string }> {
  const { data } = await supabase.from("settings").select("someday_assistant, timezone").maybeSingle();
  const parsed = AssistantNotes.safeParse(data?.someday_assistant ?? {});
  return { notes: parsed.success ? parsed.data : null, timezone: data?.timezone ?? "UTC" };
}

/** Just the notes. */
export async function assistantNotes(supabase: SupabaseClient<Database>) {
  return (await assistantSettings(supabase)).notes;
}
