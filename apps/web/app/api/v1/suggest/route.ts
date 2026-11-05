import { SuggestRequest } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { suggestForSlot } from "@/lib/ai/suggest";

export const maxDuration = 60;

/** Suggests what to do in a free gap. Nothing is saved: the client accepts via POST /time-blocks. */
export const POST = route(async (req, { supabase, user }) => {
  const body = await parseBody(req, SuggestRequest);
  return suggestForSlot(supabase, user.id, body);
});
