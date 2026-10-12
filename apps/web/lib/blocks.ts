import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventTitle, type Database, type TimeBlock } from "@tt/shared";
import { HttpError, unwrap } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { createBlockEvent, deleteBlockEvent, moveBlockEvent } from "@/lib/gcal/write";

type UserDb = SupabaseClient<Database>;

/**
 * Time blocks are written with the service role (users can't write them directly) so the
 * database row and its gcal event are always created, moved and removed together.
 * Ownership is checked first through the user's own RLS-scoped client.
 */
export async function createTimeBlock(
  db: UserDb,
  userId: string,
  input: { task_id: string; step_id?: string | null; start: string; end: string },
): Promise<TimeBlock> {
  const task = unwrap(
    await db
      .from("tasks")
      .select("id, title, list_id")
      .eq("id", input.task_id)
      .is("deleted_at", null)
      .single(),
  );
  let stepTitle: string | null = null;
  if (input.step_id) {
    const step = unwrap(
      await db
        .from("steps")
        .select("title")
        .eq("id", input.step_id)
        .eq("task_id", task.id)
        .is("deleted_at", null)
        .single(),
    );
    stepTitle = step.title;
  }
  const list = task.list_id
    ? (await db.from("lists").select("name").eq("id", task.list_id).maybeSingle()).data
    : null;

  const blockId = randomUUID();
  const start = new Date(input.start).toISOString();
  const end = new Date(input.end).toISOString();
  const eventId = await createBlockEvent(userId, {
    blockId,
    taskId: task.id,
    stepId: input.step_id ?? null,
    title: eventTitle(list?.name, task.title, stepTitle),
    start,
    end,
  });

  const { data, error } = await adminClient()
    .from("time_blocks")
    .insert({
      id: blockId,
      user_id: userId,
      task_id: task.id,
      step_id: input.step_id ?? null,
      gcal_event_id: eventId,
      start,
      end,
    })
    .select()
    .single();
  if (error) {
    await deleteBlockEvent(userId, eventId).catch(() => {});
    throw new Error(error.message);
  }
  return data;
}

async function ownBlock(db: UserDb, id: string) {
  return unwrap(
    await db.from("time_blocks").select("*").eq("id", id).is("deleted_at", null).single(),
  );
}

export async function moveTimeBlock(
  db: UserDb,
  userId: string,
  id: string,
  start: string,
  end: string,
): Promise<TimeBlock> {
  const block = await ownBlock(db, id);
  const s = new Date(start).toISOString();
  const e = new Date(end).toISOString();
  await moveBlockEvent(userId, block.gcal_event_id, s, e);
  return unwrap(
    await adminClient()
      .from("time_blocks")
      .update({ start: s, end: e })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single(),
  );
}

export async function removeTimeBlock(db: UserDb, userId: string, id: string): Promise<void> {
  const block = await ownBlock(db, id);
  await deleteBlockEvent(userId, block.gcal_event_id);
  const { error } = await adminClient()
    .from("time_blocks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Removes a task's (or step's) blocks that haven't ended yet. Past blocks stay as a record. */
export async function removeUpcomingBlocks(
  db: UserDb,
  userId: string,
  filter: { task_id: string; step_id?: string },
): Promise<number> {
  let q = db
    .from("time_blocks")
    .select("id")
    .eq("task_id", filter.task_id)
    .is("deleted_at", null)
    .gt("end", new Date().toISOString());
  if (filter.step_id) q = q.eq("step_id", filter.step_id);
  const blocks = unwrap(await q);
  for (const b of blocks) await removeTimeBlock(db, userId, b.id);
  return blocks.length;
}

export function assertNotPast(end: string) {
  if (Date.parse(end) <= Date.now()) throw new HttpError(400, "That time has already passed");
}
