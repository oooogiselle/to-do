"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSendAssistant } from "@tt/client";

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and sends a message in one go, optionally about one task. */
  ask: (text: string, opts?: { taskId?: string | null }) => void;
  /** The one send mutation, so the panel shows errors from "Ask tt." buttons too. */
  send: ReturnType<typeof useSendAssistant>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Ask tt.'s open state and the ⌘J shortcut, for the panel and the "Ask tt." buttons. */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const send = useSendAssistant();
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

  const { mutate } = send;
  const ask = useCallback(
    (text: string, opts?: { taskId?: string | null }) => {
      setOpen(true);
      mutate({ text, focusTaskId: opts?.taskId ?? null });
    },
    [mutate],
  );

  const value = useMemo(() => ({ open, setOpen, toggle, ask, send }), [open, toggle, ask, send]);
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside AssistantProvider");
  return ctx;
}
