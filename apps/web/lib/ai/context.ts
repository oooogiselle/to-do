import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tt/shared";
import type { ExtractContext } from "@/lib/ai/extract";

/** Time zone and list names the extraction prompts need. */
export async function extractContext(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<ExtractContext> {
  const [{ data: settings }, { data: lists }] = await Promise.all([
    db.from("settings").select("timezone").single(),
    db.from("lists").select("name").is("deleted_at", null).order("sort_order"),
  ]);
  return {
    userId,
    timezone: settings?.timezone ?? "UTC",
    lists: (lists ?? []).map((l) => l.name),
  };
}
