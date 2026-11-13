"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAssistantChats, useSendAssistant } from "@tt/client";

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** The open chat: an id, `null` for a new chat, `undefined` until the chats have loaded. */
  chatId: string | null | undefined;
  /** Opens a saved chat. */
  openChat: (chatId: string) => void;
  /** Starts a new chat; nothing is saved until the first message. */
  newChat: () => void;
  /** Sends a message to the open chat. */
  sendMessage: (text: string) => void;
  /** Asks again for the open chat's failed reply. */
  retry: () => void;
  /** Opens the panel and sends a message in a new chat, optionally about one task. */
  ask: (text: string, opts?: { taskId?: string | null }) => void;
  /** The one send mutation, so the panel shows errors from "Ask tt." buttons too. */
  send: ReturnType<typeof useSendAssistant>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Ask tt.'s open state, the open chat, and the ⌘J shortcut, for the panel and the "Ask tt." buttons. */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null | undefined>(undefined);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const send = useSendAssistant();
  const chats = useAssistantChats(open && chatId === undefined);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // First open after a page load: pick up the most recent chat, like before chats were saved.
  useEffect(() => {
    if (chatId === undefined && chats.data) setChatId(chats.data[0]?.id ?? null);
    else if (chatId === undefined && chats.isError) setChatId(null);
  }, [chatId, chats.data, chats.isError]);

  const { mutate, reset } = send;
  const switchTo = useCallback(
    (id: string | null) => {
      if (id !== chatIdRef.current) reset();
      setChatId(id);
    },
    [reset],
  );
  const openChat = useCallback((id: string) => switchTo(id), [switchTo]);
  const newChat = useCallback(() => switchTo(null), [switchTo]);

  const sendTo = useCallback(
    (target: string | null, text: string, focusTaskId: string | null = null) => {
      mutate(
        { chatId: target, text, focusTaskId },
        {
          // A new chat gets its id from the server; follow it unless another chat was opened since.
          onSuccess: (messages) => {
            const id = messages[0]?.chat_id;
            if (target === null && id && chatIdRef.current === null) setChatId(id);
          },
        },
      );
    },
    [mutate],
  );

  const sendMessage = useCallback((text: string) => sendTo(chatIdRef.current ?? null, text), [sendTo]);
  const retry = useCallback(() => {
    const id = chatIdRef.current;
    if (id) mutate({ chatId: id, retry: true });
  }, [mutate]);
  const ask = useCallback(
    (text: string, opts?: { taskId?: string | null }) => {
      setOpen(true);
      switchTo(null);
      sendTo(null, text, opts?.taskId ?? null);
    },
    [switchTo, sendTo],
  );

  const value = useMemo(
    () => ({ open, setOpen, toggle, chatId, openChat, newChat, sendMessage, retry, ask, send }),
    [open, toggle, chatId, openChat, newChat, sendMessage, retry, ask, send],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside AssistantProvider");
  return ctx;
}
