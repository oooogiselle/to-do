import { route, unwrap, HttpError } from "@/lib/api";

const TABLES = ["lists", "tasks", "steps", "time_blocks", "day_plan_items"] as const;

/**
 * Changes since `since` (an updated_at cursor), including soft-deleted rows so clients can
 * drop them. Omit `since` for a full pull. The returned cursor is the newest updated_at
 * seen; the comparison is inclusive, so a row at the boundary may be sent twice (merges are
 * idempotent).
 */
export const GET = route(async (req, { supabase }) => {
  const since = req.nextUrl.searchParams.get("since");
  if (since && Number.isNaN(Date.parse(since))) throw new HttpError(400, "Invalid since");

  const results = await Promise.all(
    TABLES.map(async (table) => {
      let q = supabase.from(table).select("*").order("updated_at");
      q = since ? q.gte("updated_at", since) : q.is("deleted_at", null);
      return unwrap(await q) as { updated_at: string }[];
    }),
  );
  let settingsQ = supabase
    .from("settings")
    .select("working_hours, default_block_min, timezone, updated_at");
  if (since) settingsQ = settingsQ.gte("updated_at", since);
  const { data: settings } = await settingsQ.maybeSingle<{ updated_at: string }>();

  let cursor = since ?? new Date(0).toISOString();
  for (const row of [...results.flat(), ...(settings ? [settings] : [])]) {
    if (row.updated_at > cursor) cursor = row.updated_at;
  }
  const [lists, tasks, steps, time_blocks, day_plan_items] = results;
  return { cursor, lists, tasks, steps, time_blocks, day_plan_items, settings: settings ?? null };
});
