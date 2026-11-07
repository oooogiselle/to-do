import { after } from "next/server";
import type { Json, TaskResearch } from "@tt/shared";
import { HttpError, route, unwrap } from "@/lib/api";
import { researchIdea } from "@/lib/ai/research";
import { assertAiAllowed } from "@/lib/ai/limits";
import { assistantNotes } from "@/lib/ai/someday/load";
import { assistantTypeOf } from "@/lib/ai/someday/prompts";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** A research request still running this long is treated as dead and can be started again. */
const STALE_MS = 4 * 60 * 1000;

/**
 * Starts web research for a someday item: resources plus an effort estimate. Limits are checked
 * now (so a 429 reaches the client) and the task is marked pending; the search runs after the
 * response and writes tasks.research, which reaches clients through sync and realtime.
 */
export const POST = route<{ id: string }>(async (_req, { supabase, user, params }) => {
  const task = unwrap(
    await supabase.from("tasks").select("*").eq("id", params.id).is("deleted_at", null).single(),
  );
  const list = task.list_id
    ? (await supabase.from("lists").select("name, kind").eq("id", task.list_id).maybeSingle()).data
    : null;
  if (list?.kind !== "someday") throw new HttpError(400, "Research is only for Someday items");
  if (task.idea_kind === "people") throw new HttpError(400, "People items don't need research");

  const current = task.research as TaskResearch | null;
  if (current?.status === "pending" && Date.now() - Date.parse(current.requested_at) < STALE_MS) {
    return task; // already running
  }

  await assertAiAllowed(user.id, "research");
  const notes = await assistantNotes(supabase);

  const requestedAt = new Date().toISOString();
  const pending: TaskResearch = {
    status: "pending",
    error: null,
    // Keep what was found before, so a re-run doesn't blank the card while it searches.
    resources: current?.resources ?? [],
    total_min: current?.total_min ?? null,
    span: current?.span ?? null,
    session_min: current?.session_min ?? null,
    basis: current?.basis ?? null,
    requested_at: requestedAt,
  };
  const updated = unwrap(
    await supabase
      .from("tasks")
      .update({ research: pending as unknown as Json })
      .eq("id", task.id)
      .select("*")
      .single(),
  );

  after(async () => {
    // The request is over, so write with the service role, scoped to this user's task, and only
    // if no newer research request has started since.
    const save = (research: TaskResearch) =>
      adminClient()
        .from("tasks")
        .update({ research: research as unknown as Json })
        .eq("id", task.id)
        .eq("user_id", user.id)
        .eq("research->>requested_at", requestedAt);
    try {
      const found = await researchIdea(user.id, {
        title: task.title,
        notes: task.notes,
        type: assistantTypeOf(task.idea_kind),
        horizon: task.horizon,
        link_url: task.link_url,
        list: list.name,
        assistant: { settings: notes, item: task.assistant_note },
      });
      await save({ ...found, status: "done", requested_at: requestedAt, finished_at: new Date().toISOString() });
      // The session length sizes My day blocks, but never replaces a time the user set.
      if (found.session_min) {
        await adminClient()
          .from("tasks")
          .update({ estimate_min: found.session_min })
          .eq("id", task.id)
          .eq("user_id", user.id)
          .is("estimate_min", null);
      }
    } catch (err) {
      if (!(err instanceof HttpError)) console.error("someday research", err);
      await save({
        ...pending,
        status: "error",
        error: err instanceof HttpError ? err.message : "Couldn't look this up. Try again.",
        finished_at: new Date().toISOString(),
      });
    }
  });

  return updated;
});
