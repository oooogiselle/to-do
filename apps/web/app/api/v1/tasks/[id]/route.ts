import { TaskPatch } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";

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

/** Soft-deletes the task and its steps. Its gcal blocks are removed in the scheduling phase. */
export const DELETE = route<P>(async (_req, { supabase, params }) => {
  const now = new Date().toISOString();
  unwrap(
    await supabase
      .from("tasks")
      .update({ deleted_at: now })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id")
      .single(),
  );
  unwrap(
    await supabase
      .from("steps")
      .update({ deleted_at: now })
      .eq("task_id", params.id)
      .is("deleted_at", null)
      .select("id"),
  );
  return { ok: true };
});
