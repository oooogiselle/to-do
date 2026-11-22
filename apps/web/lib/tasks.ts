import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tt/shared";
import { unwrap } from "@/lib/api";
import { removeUpcomingBlocks } from "@/lib/blocks";

/**
 * Soft-deletes tasks, taking their upcoming blocks off gcal first. The database soft-deletes
 * their steps and My day items in the same statement (cascade_soft_delete). RLS scopes it to
 * the user, so ids that are already deleted or not theirs are skipped.
 * Returns the ids that were deleted.
 */
export async function deleteTasks(
  db: SupabaseClient<Database>,
  userId: string,
  ids: string[],
): Promise<string[]> {
  for (const id of ids) await removeUpcomingBlocks(db, userId, { task_id: id });
  return unwrap(
    await db
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id"),
  ).map((t) => t.id);
}
