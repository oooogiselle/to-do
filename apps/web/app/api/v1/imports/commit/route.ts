import { ImportCommit, type ImportCommitResult } from "@tt/shared";
import { HttpError, parseBody, route } from "@/lib/api";

/**
 * Saves what the user confirmed on the review screen: creates the list if needed, adds the
 * new tasks and applies updates to matched ones, all in one transaction (commit_import).
 */
export const POST = route(async (req, { supabase }) => {
  const payload = await parseBody(req, ImportCommit);
  if (!payload.creates.length && !payload.updates.length) {
    throw new HttpError(400, "Nothing selected to add");
  }
  if (payload.creates.some((c) => c.list === "target") && !payload.list) {
    throw new HttpError(400, "Pick a list for these tasks");
  }
  const { data, error } = await supabase.rpc("commit_import", { payload });
  if (error) {
    if (error.code === "P0002")
      throw new HttpError(409, "Something changed meanwhile. Reload and try again.");
    throw new Error(error.message);
  }
  return data as unknown as ImportCommitResult;
});
