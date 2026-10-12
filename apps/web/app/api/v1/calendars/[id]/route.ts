import { after } from "next/server";
import { CalendarSelectionPatch } from "@tt/shared";
import { HttpError, parseBody, route, unwrap } from "@/lib/api";
import { activateCalendar, deactivateCalendar } from "@/lib/gcal/manage";

/** Toggles whether a calendar counts as busy time; starts or stops syncing it. */
export const PATCH = route<{ id: string }>(async (req, { supabase, user, params }) => {
  const { selected } = await parseBody(req, CalendarSelectionPatch);
  const id = decodeURIComponent(params.id);
  const cal = unwrap(
    await supabase.from("calendars").select("is_tasks_calendar").eq("id", id).single(),
  ) as { is_tasks_calendar: boolean };
  if (cal.is_tasks_calendar) throw new HttpError(400, "The Tasks calendar is always synced");

  const updated = unwrap(
    await supabase
      .from("calendars")
      .update({ selected })
      .eq("id", id)
      .select("id, summary, color, selected, is_tasks_calendar")
      .single(),
  );
  after(() =>
    (selected ? activateCalendar(user.id, id) : deactivateCalendar(user.id, id)).catch((e) =>
      console.error("calendar toggle", e),
    ),
  );
  return updated;
});
