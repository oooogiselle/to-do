import { ExtractTextRequest } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { extractContext } from "@/lib/ai/context";
import { extractFromText } from "@/lib/ai/extract";

export const maxDuration = 300;

/** Free text → proposed tasks for the review screen. Nothing is saved. */
export const POST = route(async (req, { supabase, user }) => {
  const { text } = await parseBody(req, ExtractTextRequest);
  const tasks = await extractFromText(text, await extractContext(supabase, user.id));
  return { tasks };
});
