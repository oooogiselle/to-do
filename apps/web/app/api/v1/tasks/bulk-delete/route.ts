import { TaskBulkDelete } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { deleteTasks } from "@/lib/tasks";

/** Soft-deletes several tasks at once (To-dos select mode and the overdue review). */
export const POST = route(async (req, { supabase, user }) => {
  const { ids } = await parseBody(req, TaskBulkDelete);
  const deleted = await deleteTasks(supabase, user.id, ids);
  return { ok: true, deleted: deleted.length };
});
