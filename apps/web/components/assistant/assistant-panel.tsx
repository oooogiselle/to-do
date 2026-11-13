"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Clock,
  History,
  Sparkles,
  SquarePen,
  X,
  type LucideIcon,
} from "lucide-react";
import { ASSISTANT_STARTERS, messageState, useAssistantChats, useAssistantMessages } from "@tt/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useAssistant } from "./assistant-context";
import { ChatHistory, chatTitle } from "./chat-history";
import { AssistantAvatar, ChatMessage } from "./message";

const headerBtn =
  "grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-row-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:opacity-40";

const STARTER_ICON: Record<(typeof ASSISTANT_STARTERS)[number]["icon"], LucideIcon> = {
  calendar: CalendarClock,
  alert: AlertCircle,
  clock: Clock,
  sparkles: Sparkles,
};

/** "Ask tt.": docked beside the page on wide screens, a floating sheet below that, full screen on phones. */
export function AssistantPanel() {
  const { open, setOpen, chatId, openChat, newChat, sendMessage, retry, send } = useAssistant();
  const [showHistory, setShowHistory] = useState(false);
  const messagesQ = useAssistantMessages(chatId ?? null, open && chatId !== undefined);
  const chatsQ = useAssistantChats(open);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQ.data ?? [];
  const last = messages[messages.length - 1];
  const thinking = !!last && last.role === "assistant" && messageState(last).state === "pending";
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const chat = chatId ? chatsQ.data?.find((c) => c.id === chatId) : undefined;
  const loading = chatId === undefined || (!!chatId && messagesQ.isLoading);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && !showHistory) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, last?.status, open, chatId, showHistory]);

  // A message sent from elsewhere ("Ask tt." on a Someday item) brings the chat back into view.
  useEffect(() => {
    if (send.isPending) setShowHistory(false);
  }, [send.isPending]);

  if (!open) return null;

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || thinking || send.isPending || chatId === undefined) return;
    sendMessage(t);
  };

  const subtitle = showHistory
    ? "Pick up where you left off"
    : messages.length
      ? chatTitle(chat)
      : "Sees your lists, calendar and My day";

  return (
    <aside
      aria-label="Ask tt."
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      className="fixed inset-0 z-40 flex flex-col bg-surface md:inset-y-2.5 md:right-2.5 md:left-auto md:w-[400px] md:rounded-2xl md:border md:border-line md:shadow-[-12px_0_40px_rgba(0,0,0,0.08)] xl:static xl:z-auto xl:w-[380px] xl:shrink-0 xl:rounded-none xl:border-0 xl:border-l xl:shadow-none"
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line-soft px-4">
        {showHistory ? (
          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className={`${headerBtn} -ml-1.5`}
            title="Back to chat"
            aria-label="Back to chat"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <AssistantAvatar />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] leading-tight font-medium text-ink">{showHistory ? "Chats" : "Ask tt."}</h2>
          <p className="truncate text-[11px] text-faint">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((h) => !h)}
          className={`${headerBtn} ${showHistory ? "bg-row-hover text-ink" : ""}`}
          title="Chats"
          aria-label="Chats"
          aria-pressed={showHistory}
        >
          <History className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => {
            newChat();
            setShowHistory(false);
          }}
          disabled={!showHistory && chatId === null}
          className={headerBtn}
          title="New chat"
          aria-label="New chat"
        >
          <SquarePen className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={headerBtn}
          title="Close (⌘J)"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
        {showHistory ? (
          <ChatHistory
            activeId={chatId}
            onOpen={(id) => {
              openChat(id);
              setShowHistory(false);
            }}
            onDeleted={(id) => {
              if (id === chatId) newChat();
            }}
          />
        ) : loading ? (
          <p className="text-[13px] text-faint">Loading…</p>
        ) : messagesQ.isError ? (
          <p className="text-[13px] text-risk">Couldn&apos;t load the chat.</p>
        ) : messages.length === 0 ? (
          <Welcome onPick={submit} />
        ) : (
          <div className="space-y-5">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                isLast={m.id === last?.id}
                showFollowUps={!thinking && m.id === lastAssistantId}
                onFollowUp={submit}
                onRetry={retry}
                retrying={send.isPending}
              />
            ))}
          </div>
        )}
        {!showHistory && send.error && (
          <p role="alert" className="mt-3 text-[12px] text-risk">
            {send.error.message}
          </p>
        )}
      </div>

      {!showHistory && (
        <div className="shrink-0 px-3 pb-3">
          <Composer disabled={thinking || send.isPending || chatId === undefined} onSend={submit} />
        </div>
      )}
    </aside>
  );
}

/** First name from the Google profile, when there is one. */
function useFirstName() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    createBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
        const full = meta?.full_name ?? meta?.name ?? "";
        setName(full.trim().split(/\s+/)[0] || null);
      });
  }, []);
  return name;
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const name = useFirstName();
  return (
    <div className="flex min-h-full flex-col">
      <div className="pt-2">
        <h3 className="text-[16px] font-medium tracking-tight text-ink">
          Hi{name ? ` ${name}` : ""}, what are we planning?
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          I can fill open time, add to-dos from a sentence, break something big into steps, or help you get going on a
          Someday goal.
        </p>
      </div>
      <ul className="mt-5 space-y-1.5">
        {ASSISTANT_STARTERS.map(({ prompt, hint, icon }) => {
          const Icon = STARTER_ICON[icon];
          return (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => onPick(prompt)}
                className="group flex w-full items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-row focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-row-hover text-chip-ink group-hover:bg-surface">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{prompt}</span>
                  <span className="block truncate text-[12px] text-faint">{hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-6 text-center text-[11px] text-faint">Nothing changes until you click Add.</p>
    </div>
  );
}

/** Longest message (matches AssistantSend); the count shows once a message gets close. */
const MAX_TEXT = 8000;
const COUNT_FROM = 7000;

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Grow with the text, up to about five lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors focus-within:border-faint"
    >
      <label htmlFor="assistant-input" className="sr-only">
        Message tt.
      </label>
      <textarea
        id="assistant-input"
        ref={ref}
        rows={1}
        value={text}
        maxLength={MAX_TEXT}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask, or tell me something to add…"
        className="block max-h-[120px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center gap-2 px-2 pt-1 pb-2 pl-3">
        <span className="text-[11px] text-faint">↵ send · ⇧↵ new line</span>
        {text.length > COUNT_FROM && (
          <span
            className={`ml-auto text-[11px] tabular-nums ${text.length >= MAX_TEXT ? "text-risk" : "text-faint"}`}
            aria-live="polite"
          >
            {text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}
          </span>
        )}
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          aria-label="Send"
          className={`${text.length > COUNT_FROM ? "" : "ml-auto "}grid h-7 w-7 place-items-center rounded-lg bg-ink text-white transition-colors hover:bg-[#27272A] focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:bg-line disabled:text-faint`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
