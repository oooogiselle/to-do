import { TimeBlockTrim } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { trimTimeBlock } from "@/lib/blocks";

type P = { id: string };

/** Ends a block early (its to-do was checked off while it was running); its gcal event follows. */
export const POST = route<P>(async (req, { supabase, user, params }) => {
  const { end } = await parseBody(req, TimeBlockTrim);
  return trimTimeBlock(supabase, user.id, params.id, end);
});
