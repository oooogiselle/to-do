import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { removeUpcomingBlocks } from "@/lib/blocks";

const Body = z.object({ task_id: z.string().uuid(), step_id: z.string().uuid().optional() });

/** After completing a task or step: removes its blocks that haven't ended yet. */
export const DELETE = route(async (req, { supabase, user }) => {
  const filter = await parseBody(req, Body);
  return { removed: await removeUpcomingBlocks(supabase, user.id, filter) };
});
