import { TimeBlockPatch } from "@tt/shared";
import { parseBody, route } from "@/lib/api";
import { assertNotPast, moveTimeBlock, removeTimeBlock } from "@/lib/blocks";

type P = { id: string };

/** Reschedules a block; its gcal event moves with it. */
export const PATCH = route<P>(async (req, { supabase, user, params }) => {
  const { start, end } = await parseBody(req, TimeBlockPatch);
  assertNotPast(end);
  return moveTimeBlock(supabase, user.id, params.id, start, end);
});

export const DELETE = route<P>(async (_req, { supabase, user, params }) => {
  await removeTimeBlock(supabase, user.id, params.id);
  return { ok: true };
});
