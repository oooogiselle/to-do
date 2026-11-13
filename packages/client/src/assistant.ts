"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssistantChat, AssistantMessage } from "@tt/shared";
import { useApi } from "./api-context";

/** Ask tt. isn't part of sync; realtime invalidates everything under this prefix. */
export const assistantKey = ["assistant"] as const;
/** The saved chats, most recent first. */
export const assistantChatsKey = ["assistant", "chats"] as const;
/** One chat's messages. A chat that hasn't been sent yet lives under "new". */
export const assistantChatKey = (chatId: string | null) => ["assistant", "chat", chatId ?? "new"] as const;
const allChatsKey = ["assistant", "chat"] as const;

/** A reply still pending after this long is treated as failed (the server gave up). */
const REPLY_STALE_MS = 4 * 60 * 1000;

/** Where a reply stands: one pending for too long counts as failed. */
export function messageState(
  m: Pick<AssistantMessage, "status" | "requested_at" | "error">,
  now = Date.now(),
): { state: "pending" } | { state: "done" } | { state: "error"; message: string } {
  if (m.status === "pending") {
    return m.requested_at && now - Date.parse(m.requested_at) < REPLY_STALE_MS
      ? { state: "pending" }
      : { state: "error", message: "That took too long. Try again." };
  }
  if (m.status === "error") return { state: "error", message: m.error || "Couldn't reply. Try again." };
  return { state: "done" };
}

export function useAssistantChats(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: assistantChatsKey, queryFn: () => api.assistantChats(), enabled });
}

/** One chat's messages; `null` is a new chat, which only holds what's being sent. */
export function useAssistantMessages(chatId: string | null, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: assistantChatKey(chatId),
    queryFn: () => (chatId ? api.assistant(chatId) : Promise.resolve([])),
    enabled: enabled && !!chatId,
    // Realtime normally brings the reply; poll as a fallback while one is on its way.
    refetchInterval: (q) =>
      q.state.data?.some((m) => messageState(m).state === "pending") ? 4000 : false,
  });
}

const local = (m: Partial<AssistantMessage>): AssistantMessage => ({
  id: `temp-${Math.random().toString(36).slice(2)}`,
  chat_id: null,
  role: "user",
  content: "",
  blocks: [],
  follow_ups: [],
  focus_task_id: null,
  resolved: {},
  status: "done",
  error: null,
  requested_at: null,
  created_at: new Date().toISOString(),
  ...m,
});

export type AssistantSendInput =
  | { chatId: string | null; text: string; focusTaskId?: string | null }
  | { chatId: string; retry: true };

/**
 * Sends a message to a chat (`chatId: null` starts a new one, optionally about one task), or
 * `{ retry: true }` to ask again for a failed reply. The message and a pending reply show right
 * away; the reply fills in through realtime. Resolves to the messages, which carry the chat id.
 */
export function useSendAssistant() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AssistantSendInput) =>
      "retry" in v
        ? api.retryAssistant(v.chatId)
        : api.sendAssistant(v.text, { chatId: v.chatId, focusTaskId: v.focusTaskId }),
    onMutate: async (v) => {
      const key = assistantChatKey(v.chatId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AssistantMessage[]>(key);
      const pending = local({ role: "assistant", status: "pending", requested_at: new Date().toISOString() });
      qc.setQueryData<AssistantMessage[]>(key, (old = []) => {
        if ("retry" in v) {
          const last = old[old.length - 1];
          return [...(last?.role === "assistant" ? old.slice(0, -1) : old), pending];
        }
        return [...old, local({ content: v.text, focus_task_id: v.focusTaskId ?? null }), pending];
      });
      return { prev };
    },
    onSuccess: (messages, v) => {
      const chatId = messages[0]?.chat_id;
      if (v.chatId === null && chatId) {
        // The new chat has its id now: move what was sent there and clear the draft.
        qc.setQueryData<AssistantMessage[]>(assistantChatKey(chatId), messages);
        qc.removeQueries({ queryKey: assistantChatKey(null), exact: true });
      }
    },
    onError: (_err, v, ctx) => {
      qc.setQueryData(assistantChatKey(v.chatId), ctx?.prev ?? []);
    },
    onSettled: (messages, _err, v) => {
      const chatId = v.chatId ?? messages?.[0]?.chat_id;
      if (chatId) qc.invalidateQueries({ queryKey: assistantChatKey(chatId) });
      qc.invalidateQueries({ queryKey: assistantChatsKey });
    },
  });
}

export function useRenameChat() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { chatId: string; title: string }) => api.renameAssistantChat(v.chatId, v.title),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: assistantChatsKey });
      const prev = qc.getQueryData<AssistantChat[]>(assistantChatsKey);
      qc.setQueryData<AssistantChat[]>(assistantChatsKey, (old = []) =>
        old.map((c) => (c.id === v.chatId ? { ...c, title: v.title } : c)),
      );
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(assistantChatsKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: assistantChatsKey }),
  });
}

export function useDeleteChat() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => api.deleteAssistantChat(chatId),
    onMutate: async (chatId) => {
      await qc.cancelQueries({ queryKey: assistantChatsKey });
      const prev = qc.getQueryData<AssistantChat[]>(assistantChatsKey);
      qc.setQueryData<AssistantChat[]>(assistantChatsKey, (old = []) => old.filter((c) => c.id !== chatId));
      return { prev };
    },
    onSuccess: (_data, chatId) => qc.removeQueries({ queryKey: assistantChatKey(chatId) }),
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(assistantChatsKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: assistantChatsKey }),
  });
}

/**
 * Marks card actions as done ("<block>:<part>" -> a value such as the new row's id). Shows at
 * once; the server keeps them so the cards stay resolved after a reload.
 */
export function useResolveCard() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { messageId: string; entries: Record<string, string> }) =>
      api.resolveAssistantCard(v.messageId, v.entries),
    onMutate: (v) => {
      qc.setQueriesData<AssistantMessage[]>({ queryKey: allChatsKey }, (old) =>
        old?.map((m) => (m.id === v.messageId ? { ...m, resolved: { ...m.resolved, ...v.entries } } : m)),
      );
    },
  });
}

/** Suggestions on an empty chat. */
export const ASSISTANT_STARTERS = [
  { prompt: "Plan the rest of my day", hint: "Fill open time with what's most pressing", icon: "calendar" },
  { prompt: "What's due soon?", hint: "Deadlines this week and what's at risk", icon: "alert" },
  { prompt: "When am I free?", hint: "Open time left today", icon: "clock" },
  { prompt: "Anything from Someday?", hint: "Goals and things to learn, for a free hour", icon: "sparkles" },
] as const;
