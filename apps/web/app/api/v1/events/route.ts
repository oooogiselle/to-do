import { HttpError, route, unwrap } from "@/lib/api";

const MAX_RANGE_DAYS = 62;

/** Cached gcal events overlapping [from, to) on the calendars the user marked as busy. */
export const GET = route(async (req, { supabase }) => {
  const params = req.nextUrl.searchParams;
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
    throw new HttpError(400, "from and to must be ISO timestamps with from < to");
  }
  if (to - from > MAX_RANGE_DAYS * 86_400_000) throw new HttpError(400, "Range too large");

  const calendars = unwrap(
    await supabase.from("calendars").select("id, color").eq("selected", true),
  ) as { id: string; color: string | null }[];
  if (!calendars.length) return { events: [] };

  const colorOf = new Map(calendars.map((c) => [c.id, c.color]));
  const events = unwrap(
    await supabase
      .from("calendar_events")
      .select("calendar_id, gcal_event_id, title, start, end, all_day, busy")
      .in(
        "calendar_id",
        calendars.map((c) => c.id),
      )
      .lt("start", new Date(to).toISOString())
      .gt("end", new Date(from).toISOString())
      .order("start"),
  );
  return { events: events.map((e) => ({ ...e, color: colorOf.get(e.calendar_id) ?? null })) };
});
