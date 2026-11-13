import { z } from "zod";
import { AssistantBlock, type AssistantMessage, type Json } from "@tt/shared";

export const COLUMNS =
  "id, chat_id, role, content, blocks, follow_ups, focus_task_id, resolved, status, error, requested_at, created_at";

export type Row = {
  id: string;
  chat_id: string | null;
  role: string;
  content: string;
  blocks: Json;
  follow_ups: Json;
  focus_task_id: string | null;
  resolved: Json;
  status: string;
  error: string | null;
  requested_at: string | null;
  created_at: string;
};

/** Stored cards, skipping any that no longer parse (e.g. after a schema change). */
export function parseBlocks(v: Json): AssistantBlock[] {
  return Array.isArray(v)
    ? v.flatMap((b) => {
        const r = AssistantBlock.safeParse(b);
        return r.success ? [r.data] : [];
      })
    : [];
}

const Strings = z.array(z.string()).catch([]);
const Resolved = z.record(z.string(), z.string()).catch({});

export const toMessage = (r: Row): AssistantMessage => ({
  id: r.id,
  chat_id: r.chat_id,
  role: r.role === "assistant" ? "assistant" : "user",
  content: r.content,
  blocks: parseBlocks(r.blocks),
  follow_ups: Strings.parse(r.follow_ups),
  focus_task_id: r.focus_task_id,
  resolved: Resolved.parse(r.resolved),
  status: r.status === "pending" || r.status === "error" ? r.status : "done",
  error: r.error,
  requested_at: r.requested_at,
  created_at: r.created_at,
});

export const CHAT_COLUMNS = "id, title, focus_task_id, last_message_at, created_at";
