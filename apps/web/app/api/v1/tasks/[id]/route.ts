import { TaskPatch } from "@tt/shared";
import { HttpError, parseBody, route, unwrap } from "@/lib/api";
import { deleteTasks } from "@/lib/tasks";

type P = { id: string };

/** Task with its steps and scheduled blocks. */
export const GET = route<P>(async (_req, { supabase, params }) => {
  const task = unwrap(
    await supabase.from("tasks").select("*").eq("id", params.id).is("deleted_at", null).single(),
  );
  const [steps, blocks] = await Promise.all([
    supabase
      .from("steps")
      .select("*")
      .eq("task_id", params.id)
      .is("deleted_at", null)
      .order("order"),
    supabase
      .from("time_blocks")
      .select("*")
      .eq("task_id", params.id)
      .is("deleted_at", null)
      .order("start"),
  ]);
  return { ...task, steps: unwrap(steps), time_blocks: unwrap(blocks) };
});

export const PATCH = route<P>(async (req, { supabase, params }) => {
  const body = await parseBody(req, TaskPatch);
  return unwrap(
    await supabase
      .from("tasks")
      .update(body)
      .eq("id", params.id)
      .is("deleted_at", null)
      .select()
      .single(),
  );
});

/** Soft-deletes the task and its steps, and removes its upcoming blocks from gcal. */
export const DELETE = route<P>(async (_req, { supabase, user, params }) => {
  const deleted = await deleteTasks(supabase, user.id, [params.id]);
  if (!deleted.length) throw new HttpError(404, "Not found");
  return { ok: true };
});
