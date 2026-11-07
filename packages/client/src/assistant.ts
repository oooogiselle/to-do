"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssistantMessage } from "@tt/shared";
import { useApi } from "./api-context";

/** The Ask tt. conversation; not part of sync, fetched on its own. */
export const assistantKey = ["assistant"] as const;

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

export function useAssistantMessages(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: assistantKey,
    queryFn: () => api.assistant(),
    enabled,
    // Realtime normally brings the reply; poll as a fallback while one is on its way.
    refetchInterval: (q) =>
      q.state.data?.some((m) => messageState(m).state === "pending") ? 4000 : false,
  });
}

const local = (m: Partial<AssistantMessage>): AssistantMessage => ({
  id: `temp-${Math.random().toString(36).slice(2)}`,
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

export type AssistantSendInput = { text: string; focusTaskId?: string | null } | { retry: true };

/**
 * Sends a message (optionally about one task), or `{ retry: true }` to ask again for a failed
 * reply. The message and a pending reply show right away; the reply fills in through realtime.
 */
export function useSendAssistant() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AssistantSendInput) =>
      "retry" in v ? api.retryAssistant() : api.sendAssistant(v.text, v.focusTaskId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: assistantKey });
      const prev = qc.getQueryData<AssistantMessage[]>(assistantKey);
      const pending = local({ role: "assistant", status: "pending", requested_at: new Date().toISOString() });
      qc.setQueryData<AssistantMessage[]>(assistantKey, (old = []) => {
        if ("retry" in v) {
          const last = old[old.length - 1];
          return [...(last?.role === "assistant" ? old.slice(0, -1) : old), pending];
        }
        return [...old, local({ content: v.text, focus_task_id: v.focusTaskId ?? null }), pending];
      });
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(assistantKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: assistantKey }),
  });
}

/** Starts a new chat. */
export function useClearAssistant() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearAssistant(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: assistantKey });
      const prev = qc.getQueryData<AssistantMessage[]>(assistantKey);
      qc.setQueryData<AssistantMessage[]>(assistantKey, []);
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(assistantKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: assistantKey }),
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
      qc.setQueryData<AssistantMessage[]>(assistantKey, (old = []) =>
        old.map((m) => (m.id === v.messageId ? { ...m, resolved: { ...m.resolved, ...v.entries } } : m)),
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
