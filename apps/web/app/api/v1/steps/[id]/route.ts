import { route, unwrap } from "@/lib/api";
import { removeUpcomingBlocks } from "@/lib/blocks";
import { steps } from "../crud";

export const { PATCH } = steps.item;

/**
 * Soft-deletes a step. Its upcoming blocks come off gcal first (past ones stay as a record);
 * the database then soft-deletes its My day items with it (cascade_soft_delete).
 */
export const DELETE = route<{ id: string }>(async (_req, { supabase, user, params }) => {
  const step = unwrap(
    await supabase
      .from("steps")
      .select("id, task_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .single(),
  );
  await removeUpcomingBlocks(supabase, user.id, { task_id: step.task_id, step_id: step.id });
  unwrap(
    await supabase
      .from("steps")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", step.id)
      .is("deleted_at", null)
      .select("id")
      .single(),
  );
  return { ok: true };
});
