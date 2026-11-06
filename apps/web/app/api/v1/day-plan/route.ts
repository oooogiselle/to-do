import { DayPlanItemCreate } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";

/**
 * Plans a task (or one of its steps) for a day. Adding one that's already on that day returns
 * the existing item, so two tabs (or a retry) can't fail or double up.
 */
export const POST = route(async (req, { supabase }) => {
  const body = await parseBody(req, DayPlanItemCreate);
  const { data, error } = await supabase.from("day_plan_items").insert(body).select().single();
  if (!error) return data;
  if (error.code !== "23505") throw new Error(error.message);
  let existing = supabase
    .from("day_plan_items")
    .select("*")
    .eq("task_id", body.task_id)
    .eq("plan_date", body.plan_date)
    .is("deleted_at", null);
  existing = body.step_id ? existing.eq("step_id", body.step_id) : existing.is("step_id", null);
  return unwrap(await existing.single());
});
