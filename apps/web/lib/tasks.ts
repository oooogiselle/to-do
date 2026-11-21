import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tt/shared";
import { unwrap } from "@/lib/api";
import { removeUpcomingBlocks } from "@/lib/blocks";

/**
 * Soft-deletes tasks and their steps, and takes their upcoming blocks off gcal first. RLS
 * scopes it to the user, so ids that are already deleted or not theirs are skipped.
 * Returns the ids that were deleted.
 */
export async function deleteTasks(
  db: SupabaseClient<Database>,
  userId: string,
  ids: string[],
): Promise<string[]> {
  for (const id of ids) await removeUpcomingBlocks(db, userId, { task_id: id });
  const now = new Date().toISOString();
  const deleted = unwrap(
    await db
      .from("tasks")
      .update({ deleted_at: now })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id"),
  ).map((t) => t.id);
  if (deleted.length) {
    unwrap(
      await db
        .from("steps")
        .update({ deleted_at: now })
        .in("task_id", deleted)
        .is("deleted_at", null)
        .select("id"),
    );
  }
  return deleted;
}
