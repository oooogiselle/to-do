import { route, unwrap, HttpError } from "@/lib/api";

const TABLES = ["lists", "tasks", "steps", "time_blocks", "day_plan_items"] as const;

/**
 * How far before `since` a delta reaches back. updated_at is stamped when a row is written
 * (clock_timestamp() on update, transaction start on insert), not when it commits, so a row
 * committed just after a client's read can carry a time older than the cursor that client
 * got. Re-sending the last minute catches it; client merges are idempotent.
 */
const SYNC_OVERLAP_MS = 60_000;

/**
 * Changes since `since` (an updated_at cursor), including soft-deleted rows so clients can
 * drop them. Omit `since` for a full pull. The returned cursor is the newest updated_at
 * seen; deltas re-send the minute before `since` (SYNC_OVERLAP_MS), so rows near the
 * boundary may come twice (merges are idempotent).
 */
export const GET = route(async (req, { supabase }) => {
  const since = req.nextUrl.searchParams.get("since");
  if (since && Number.isNaN(Date.parse(since))) throw new HttpError(400, "Invalid since");

  const from = since ? new Date(Date.parse(since) - SYNC_OVERLAP_MS).toISOString() : null;

  const results = await Promise.all(
    TABLES.map(async (table) => {
      let q = supabase.from(table).select("*").order("updated_at");
      q = from ? q.gte("updated_at", from) : q.is("deleted_at", null);
      return unwrap(await q) as { updated_at: string }[];
    }),
  );
  let settingsQ = supabase
    .from("settings")
    .select("working_hours, default_block_min, timezone, someday_assistant, scheduling, updated_at");
  if (from) settingsQ = settingsQ.gte("updated_at", from);
  const { data: settings } = await settingsQ.maybeSingle<{ updated_at: string }>();

  let cursor = since ?? new Date(0).toISOString();
  for (const row of [...results.flat(), ...(settings ? [settings] : [])]) {
    if (row.updated_at > cursor) cursor = row.updated_at;
  }
  const [lists, tasks, steps, time_blocks, day_plan_items] = results;
  return { cursor, lists, tasks, steps, time_blocks, day_plan_items, settings: settings ?? null };
});
