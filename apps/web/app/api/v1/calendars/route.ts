import { route, unwrap } from "@/lib/api";

export const GET = route(async (_req, { supabase }) =>
  unwrap(
    await supabase
      .from("calendars")
      .select("id, summary, color, selected, is_tasks_calendar")
      .order("is_tasks_calendar")
      .order("summary"),
  ),
);
