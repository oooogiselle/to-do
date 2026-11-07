import { AssistantResolve } from "@tt/shared";
import { HttpError, parseBody, route, unwrap } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { COLUMNS, toMessage, type Row } from "../rows";

type P = { id: string };

/**
 * Records card actions on a reply (e.g. "0:pick:1" -> "added"). Merges into what's there, and
 * only writes if nothing else changed the row since it was read, so actions taken at the same
 * moment ("Add all") don't overwrite each other.
 */
export const PATCH = route<P>(async (req, { supabase, user, params }) => {
  const { entries } = await parseBody(req, AssistantResolve);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = unwrap(
      await supabase
        .from("assistant_messages")
        .select("resolved, updated_at")
        .eq("id", params.id)
        .eq("role", "assistant")
        .is("deleted_at", null)
        .single(),
    );
    const resolved = { ...(row.resolved as Record<string, string>), ...entries };
    const { data, error } = await adminClient()
      .from("assistant_messages")
      .update({ resolved })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .eq("updated_at", row.updated_at)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return toMessage(data as Row);
  }
  throw new HttpError(409, "Couldn't save that. Try again.");
});
