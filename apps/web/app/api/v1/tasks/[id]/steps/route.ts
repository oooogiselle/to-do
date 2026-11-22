import { StepsReplace, type Step, type Task } from "@tt/shared";
import { HttpError, parseBody, route } from "@/lib/api";
import { removeUpcomingBlocks } from "@/lib/blocks";

/**
 * Accepts a breakdown: replaces the task's unfinished steps with the new ones (after any
 * finished steps) and sets the task estimate to the sum of its steps. The database does it in
 * one transaction (replace_steps), so a failure can't leave the task without steps.
 */
export const PUT = route<{ id: string }>(async (req, { supabase, user, params }) => {
  const { steps } = await parseBody(req, StepsReplace);
  const { data, error } = await supabase.rpc("replace_steps", { p_task: params.id, p_steps: steps });
  if (error) {
    if (error.code === "P0002") throw new HttpError(404, "Not found");
    throw new Error(error.message);
  }
  const result = data as unknown as { task: Task; steps: Step[]; removed: string[] };

  // The removed steps' upcoming blocks come off gcal too. The steps are already replaced, so a
  // gcal failure here is logged rather than failing a request whose change has been saved.
  for (const stepId of result.removed) {
    try {
      await removeUpcomingBlocks(supabase, user.id, { task_id: params.id, step_id: stepId });
    } catch (err) {
      console.error("replace steps: couldn't remove blocks for step", stepId, err);
    }
  }
  return { task: result.task, steps: result.steps };
});
