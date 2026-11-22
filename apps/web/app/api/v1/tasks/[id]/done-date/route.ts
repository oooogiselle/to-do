import { DoneDateSet } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";

/**
 * Checks a repeating task off for one date (or unchecks it). The date is added or removed in
 * one UPDATE (set_task_done_date), so check-offs from two devices never overwrite each other.
 */
export const POST = route<{ id: string }>(async (req, { supabase, params }) => {
  const { date, done } = await parseBody(req, DoneDateSet);
  return unwrap(
    await supabase
      .rpc("set_task_done_date", { p_task: params.id, p_date: date, p_done: done })
      .single(),
  );
});
