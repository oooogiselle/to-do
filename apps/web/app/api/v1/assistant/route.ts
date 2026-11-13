import { after } from "next/server";
import { z } from "zod";
import { AssistantSend, type Json } from "@tt/shared";
import { HttpError, parseBody, route, unwrap } from "@/lib/api";
import { assertAiAllowed } from "@/lib/ai/limits";
import { buildSnapshot } from "@/lib/ai/assistant/snapshot";
import { assistantTurn, type PastMessage } from "@/lib/ai/assistant/turn";
import { adminClient } from "@/lib/supabase/admin";
import { COLUMNS, toMessage, type Row } from "./rows";

export const maxDuration = 300;

/** A reply still pending this long is treated as dead, and a new message can be sent. */
const STALE_MS = 4 * 60 * 1000;
/** Messages before the chat has to be started over. */
const MAX_MESSAGES = 200;
/** Longest chat title taken from the first message, when the model doesn't name the chat. */
const FALLBACK_TITLE = 60;

const ChatId = z.string().uuid();

const isLive = (r: Pick<Row, "status" | "requested_at">) =>
  r.status === "pending" && !!r.requested_at && Date.now() - Date.parse(r.requested_at) < STALE_MS;

/** One chat's messages, oldest first. */
export const GET = route(async (req, { supabase }) => {
  const chatId = ChatId.safeParse(req.nextUrl.searchParams.get("chat_id"));
  if (!chatId.success) throw new HttpError(400, "Which chat?");
  const rows = unwrap(
    await supabase
      .from("assistant_messages")
      .select(COLUMNS)
      .eq("chat_id", chatId.data)
      .is("deleted_at", null)
      .order("created_at"),
  );
  return (rows as Row[]).map(toMessage);
});

/**
 * Sends a message (or retries a failed reply) in a chat, starting a new chat when there's no
 * `chat_id`. Limits are checked now, so a 429 reaches the client; the reply runs after the
 * response and fills in the pending row, which reaches the client through realtime.
 */
export const POST = route(async (req, { supabase, user }) => {
  const body = await parseBody(req, AssistantSend);
  const retry = "retry" in body;
  const givenChatId = body.chat_id ?? null;

  let chatTitle = "";
  let existing: Row[] = [];
  if (givenChatId) {
    const { data: chat } = await supabase
      .from("assistant_chats")
      .select("id, title")
      .eq("id", givenChatId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!chat) throw new HttpError(404, "That chat was deleted.");
    chatTitle = chat.title;
    existing = unwrap(
      await supabase
        .from("assistant_messages")
        .select(COLUMNS)
        .eq("chat_id", givenChatId)
        .is("deleted_at", null)
        .order("created_at"),
    ) as Row[];
  }
  if (existing.some(isLive)) throw new HttpError(409, "Still working on the last reply.");
  const last = existing[existing.length - 1];
  if (retry && !(last?.role === "assistant" && last.status !== "done")) {
    throw new HttpError(400, "There's no failed reply to retry.");
  }
  if (!retry && existing.length >= MAX_MESSAGES) {
    throw new HttpError(400, "This chat is full. Start a new one.");
  }

  // The item the message is about: given, or carried over from the message being retried.
  const lastUser = [...existing].reverse().find((r) => r.role === "user");
  const focusTaskId = retry ? (lastUser?.focus_task_id ?? null) : (body.focus_task_id ?? null);
  if (focusTaskId) {
    unwrap(await supabase.from("tasks").select("id").eq("id", focusTaskId).single());
  }

  await assertAiAllowed(user.id, "assistant");
  // Read the planner now, with the user's own (RLS-scoped) client: the request's cookies aren't
  // available once the response has gone.
  const snap = await buildSnapshot(supabase, { focusTaskId, lastMessageAt: last?.created_at ?? null });

  const admin = adminClient();
  const now = Date.now();
  const requestedAt = new Date(now).toISOString();

  if (givenChatId) {
    await admin
      .from("assistant_chats")
      .update({ last_message_at: requestedAt })
      .eq("id", givenChatId)
      .eq("user_id", user.id);
  }
  const chatId =
    givenChatId ??
    unwrap(
      await admin
        .from("assistant_chats")
        .insert({ user_id: user.id, focus_task_id: focusTaskId, last_message_at: requestedAt })
        .select("id")
        .single(),
    ).id;

  if (retry) {
    // The failed reply makes way for the new one.
    await admin.from("assistant_messages").update({ deleted_at: requestedAt }).eq("id", last!.id).eq("user_id", user.id);
  }
  // Every row sets the same columns: a multi-row insert fills a missing one with null, not
  // its default.
  const base = { user_id: user.id, chat_id: chatId, blocks: [], follow_ups: [], resolved: {}, error: null };
  const inserted = unwrap(
    await admin
      .from("assistant_messages")
      .insert([
        ...(retry
          ? []
          : [
              {
                ...base,
                role: "user",
                content: body.text,
                focus_task_id: focusTaskId,
                status: "done",
                requested_at: null,
                created_at: requestedAt,
              },
            ]),
        {
          ...base,
          role: "assistant",
          content: "",
          focus_task_id: focusTaskId,
          status: "pending",
          requested_at: requestedAt,
          // Just after the user's message, so the order is stable.
          created_at: new Date(now + 1).toISOString(),
        },
      ])
      .select(COLUMNS),
  ) as Row[];
  const pending = inserted.find((r) => r.role === "assistant")!;

  after(async () => {
    // The request is over, so write with the service role, scoped to this user, and only if
    // the pending row is still the live one (not cleared or replaced since).
    const finish = (patch: { blocks?: Json[]; follow_ups?: string[]; status: string; error?: string | null }) =>
      admin
        .from("assistant_messages")
        .update(patch)
        .eq("id", pending.id)
        .eq("user_id", user.id)
        .eq("requested_at", requestedAt)
        .is("deleted_at", null);
    let history: PastMessage[] = [];
    let title = "";
    try {
      const rows = unwrap(
        await admin
          .from("assistant_messages")
          .select(COLUMNS)
          .eq("user_id", user.id)
          .eq("chat_id", chatId)
          .is("deleted_at", null)
          .eq("status", "done")
          .order("created_at"),
      ) as Row[];
      history = rows.map((r) => {
        const m = toMessage(r);
        return { role: m.role, content: m.content, blocks: m.blocks, resolved: m.resolved };
      });
      const reply = await assistantTurn(user.id, history, snap);
      title = reply.title;
      await finish({
        blocks: reply.blocks as unknown as Json[],
        follow_ups: reply.follow_ups,
        status: "done",
        error: null,
      });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error("assistant", err);
      await finish({
        status: "error",
        error: err instanceof HttpError ? err.message : "Couldn't reply. Try again.",
      });
    }
    // Name the chat on its first reply: the model's title, else the first message. Only while
    // it has no title, so a rename made in the meantime stays.
    if (!chatTitle) {
      const first = history.find((m) => m.role === "user")?.content ?? (retry ? "" : body.text);
      const name = title || first.trim().replace(/\s+/g, " ").slice(0, FALLBACK_TITLE).trim();
      if (name) {
        await admin
          .from("assistant_chats")
          .update({ title: name })
          .eq("id", chatId)
          .eq("user_id", user.id)
          .eq("title", "");
      }
    }
  });

  return inserted.map(toMessage);
});
