import { BreakdownRequest, linkLabel } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";
import { breakDownTask } from "@/lib/ai/breakdown";

export const maxDuration = 60;

/** Proposes steps for a task. Nothing is saved: the client accepts via PUT /steps. */
export const POST = route<{ id: string }>(async (req, { supabase, user, params }) => {
  const { mode } = await parseBody(req, BreakdownRequest);
  const task = unwrap(
    await supabase.from("tasks").select("*").eq("id", params.id).is("deleted_at", null).single(),
  );
  const [steps, list, settings] = await Promise.all([
    supabase
      .from("steps")
      .select("title, estimate_min, done")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("order"),
    task.list_id
      ? supabase.from("lists").select("name, kind").eq("id", task.list_id).maybeSingle()
      : null,
    supabase.from("settings").select("timezone").single(),
  ]);
  const proposed = await breakDownTask(user.id, {
    title: task.title,
    notes: task.notes,
    due_at: task.due_at,
    list: list?.data?.name ?? null,
    someday:
      list?.data?.kind === "someday"
        ? {
            kind: task.idea_kind === "goal" || task.idea_kind === "learn" ? task.idea_kind : null,
            horizon: task.horizon,
            site: task.link_url ? linkLabel(task.link_url) : null,
          }
        : null,
    existingSteps: unwrap(steps),
    mode,
    timezone: settings.data?.timezone ?? "UTC",
  });
  return { steps: proposed };
});
