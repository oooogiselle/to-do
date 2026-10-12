import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { calendarClient, googleStatus } from "@/lib/google";
import { tasksCalendarId } from "@/lib/gcal/calendars";

type BlockEvent = {
  blockId: string;
  taskId: string;
  stepId: string | null;
  title: string;
  start: string;
  end: string;
};

/**
 * The only place the app writes to Google Calendar. Every write targets the app's own Tasks
 * calendar, so existing events can never be touched.
 */
async function tasksCalendar(userId: string) {
  const calendarId = await tasksCalendarId(userId);
  if (!calendarId) throw new HttpError(409, "Connect Google Calendar in Settings first");
  return { gcal: await calendarClient(userId), calendarId };
}

export async function createBlockEvent(userId: string, ev: BlockEvent): Promise<string> {
  if (isDemo()) return `local-${randomUUID()}`;
  const { gcal, calendarId } = await tasksCalendar(userId);
  const res = await gcal.events.insert({
    calendarId,
    requestBody: {
      summary: ev.title,
      start: { dateTime: ev.start },
      end: { dateTime: ev.end },
      extendedProperties: {
        private: {
          blockId: ev.blockId,
          taskId: ev.taskId,
          ...(ev.stepId && { stepId: ev.stepId }),
        },
      },
    },
  });
  return res.data.id!;
}

export async function moveBlockEvent(userId: string, eventId: string, start: string, end: string) {
  if (isDemo() || eventId.startsWith("local-")) return;
  const { gcal, calendarId } = await tasksCalendar(userId);
  await gcal.events.patch({
    calendarId,
    eventId,
    requestBody: { start: { dateTime: start }, end: { dateTime: end } },
  });
}

/** Deletes the event; already-gone events (deleted in gcal) are fine. */
export async function deleteBlockEvent(userId: string, eventId: string) {
  if (isDemo() || eventId.startsWith("local-")) return;
  const { gcal, calendarId } = await tasksCalendar(userId);
  try {
    await gcal.events.delete({ calendarId, eventId });
  } catch (err) {
    const status = googleStatus(err);
    if (status !== 404 && status !== 410) throw err;
  }
}
