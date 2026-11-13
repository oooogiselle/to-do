import { AssistantChatPatch, type AssistantChat } from "@tt/shared";
import { HttpError, parseBody, route } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { CHAT_COLUMNS } from "../../rows";

type P = { id: string };

/** Renames a chat. Chats are written only by the server, so this goes through the service role. */
export const PATCH = route<P>(async (req, { user, params }) => {
  const { title } = await parseBody(req, AssistantChatPatch);
  const { data, error } = await adminClient()
    .from("assistant_chats")
    .update({ title })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select(CHAT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "That chat was deleted.");
  return data as AssistantChat;
});

/** Deletes a chat and its messages (soft delete). */
export const DELETE = route<P>(async (_req, { user, params }) => {
  const admin = adminClient();
  const deletedAt = new Date().toISOString();
  const { error } = await admin
    .from("assistant_chats")
    .update({ deleted_at: deletedAt })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  await admin
    .from("assistant_messages")
    .update({ deleted_at: deletedAt })
    .eq("chat_id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  return { ok: true };
});
