import type { AssistantChat } from "@tt/shared";
import { route, unwrap } from "@/lib/api";
import { CHAT_COLUMNS } from "../rows";

/** How many recent chats the history list shows. */
const LIMIT = 50;

/** Saved Ask tt. chats, most recent first. */
export const GET = route(async (_req, { supabase }) => {
  const rows = unwrap(
    await supabase
      .from("assistant_chats")
      .select(CHAT_COLUMNS)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(LIMIT),
  );
  return rows as AssistantChat[];
});
