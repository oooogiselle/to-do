import { TimeBlockCreate } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { assertNotPast, createTimeBlock } from "@/lib/blocks";

/** Schedules a task or step: creates the gcal event in the Tasks calendar and the block. */
export const POST = route(async (req, { supabase, user }) => {
  const body = await parseBody(req, TimeBlockCreate);
  assertNotPast(body.end);
  return createTimeBlock(supabase, user.id, body);
});
