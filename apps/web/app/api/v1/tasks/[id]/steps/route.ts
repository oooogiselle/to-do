import { StepsReplace } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";

/**
 * Accepts a breakdown: soft-deletes the task's unfinished steps, appends the new ones after
 * any finished steps, and sets the task estimate to the sum of all step estimates.
 */
export const PUT = route<{ id: string }>(async (req, { supabase, params }) => {
  const { steps } = await parseBody(req, StepsReplace);
  const task = unwrap(
    await supabase.from("tasks").select("id").eq("id", params.id).is("deleted_at", null).single(),
  );
  const existing = unwrap(
    await supabase
      .from("steps")
      .select("id, done, estimate_min, order")
      .eq("task_id", task.id)
      .is("deleted_at", null),
  );
  const done = existing.filter((s) => s.done);
  const undoneIds = existing.filter((s) => !s.done).map((s) => s.id);
  if (undoneIds.length) {
    unwrap(
      await supabase
        .from("steps")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", undoneIds)
        .select("id"),
    );
  }
  const start = done.reduce((max, s) => Math.max(max, s.order + 1), 0);
  const inserted = unwrap(
    await supabase
      .from("steps")
      .insert(
        steps.map((s, i) => ({
          task_id: task.id,
          title: s.title,
          estimate_min: s.estimate_min,
          order: start + i,
        })),
      )
      .select(),
  );
  const estimate =
    done.reduce((sum, s) => sum + (s.estimate_min ?? 0), 0) +
    steps.reduce((sum, s) => sum + s.estimate_min, 0);
  const updated = unwrap(
    await supabase
      .from("tasks")
      .update({ estimate_min: estimate })
      .eq("id", task.id)
      .select()
      .single(),
  );
  return { task: updated, steps: inserted };
});
