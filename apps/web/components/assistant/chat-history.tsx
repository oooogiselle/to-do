"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { addDays, localDate, type AssistantChat } from "@tt/shared";
import { useAssistantChats, useDeleteChat, useModel, useRenameChat } from "@tt/client";

const rowBtn =
  "grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong";

export const chatTitle = (c: Pick<AssistantChat, "title"> | undefined) => c?.title || "New chat";

/** Saved Ask tt. chats, newest first, grouped by day. Open, rename or delete one. */
export function ChatHistory({
  activeId,
  onOpen,
  onDeleted,
}: {
  activeId: string | null | undefined;
  onOpen: (chatId: string) => void;
  /** After a chat is deleted, e.g. to leave it if it was open. */
  onDeleted: (chatId: string) => void;
}) {
  const chatsQ = useAssistantChats();
  const { settings } = useModel();
  const tz = settings.timezone;

  if (chatsQ.isLoading) return <p className="text-[13px] text-faint">Loading…</p>;
  if (chatsQ.isError) return <p className="text-[13px] text-risk">Couldn&apos;t load your chats.</p>;
  const chats = chatsQ.data ?? [];
  if (!chats.length) {
    return <p className="pt-2 text-[13px] text-faint">No chats yet. What you ask tt. is saved here.</p>;
  }

  const today = localDate(new Date(), tz);
  const yesterday = addDays(today, -1);
  const groupOf = (c: AssistantChat) => {
    const d = localDate(new Date(c.last_message_at), tz);
    return d === today ? "Today" : d === yesterday ? "Yesterday" : "Earlier";
  };
  const groups: { label: string; chats: AssistantChat[] }[] = [];
  for (const c of chats) {
    const label = groupOf(c);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.chats.push(c);
    else groups.push({ label, chats: [c] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-faint uppercase">{g.label}</h3>
          <ul className="space-y-0.5">
            {g.chats.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={c.id === activeId}
                when={formatWhen(c.last_message_at, g.label, tz)}
                onOpen={() => onOpen(c.id)}
                onDeleted={() => onDeleted(c.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatWhen(iso: string, group: string, tz: string) {
  const d = new Date(iso);
  if (group === "Today") return d.toLocaleTimeString(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (group === "Yesterday") return "";
  const sameYear = localDate(d, tz).slice(0, 4) === localDate(new Date(), tz).slice(0, 4);
  return d.toLocaleDateString(undefined, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function ChatRow({
  chat,
  active,
  when,
  onOpen,
  onDeleted,
}: {
  chat: AssistantChat;
  active: boolean;
  when: string;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const rename = useRenameChat();
  const del = useDeleteChat();
  const [mode, setMode] = useState<"view" | "rename" | "confirm">("view");

  if (mode === "rename") {
    return (
      <li>
        <RenameInput
          initial={chat.title}
          onCancel={() => setMode("view")}
          onSave={(title) => {
            setMode("view");
            if (title !== chat.title) rename.mutate({ chatId: chat.id, title });
          }}
        />
      </li>
    );
  }

  if (mode === "confirm") {
    return (
      <li className="flex items-center gap-2 rounded-[10px] bg-row px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">Delete “{chatTitle(chat)}”?</span>
        <button
          type="button"
          autoFocus
          onClick={() => {
            del.mutate(chat.id);
            onDeleted();
          }}
          className="rounded-md px-2 py-0.5 text-[12px] font-medium text-risk hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setMode("view")}
          className="rounded-md px-2 py-0.5 text-[12px] text-muted hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li
      className={`group relative flex items-center rounded-[10px] transition-colors ${active ? "bg-row-hover" : "hover:bg-row-hover"}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
      >
        <span className={`min-w-0 flex-1 truncate text-[13px] ${chat.title ? "text-ink" : "text-muted"}`}>
          {chatTitle(chat)}
        </span>
        {when && <span className="shrink-0 text-[11px] text-faint group-hover:invisible group-focus-within:invisible">{when}</span>}
      </button>
      <div className="absolute right-1.5 hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
        <button type="button" onClick={() => setMode("rename")} className={rowBtn} title="Rename" aria-label={`Rename “${chatTitle(chat)}”`}>
          <Pencil className="h-3 w-3" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => setMode("confirm")} className={rowBtn} title="Delete" aria-label={`Delete “${chatTitle(chat)}”`}>
          <Trash2 className="h-3 w-3" strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = () => {
    const t = text.trim();
    if (t) onSave(t);
    else onCancel();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex items-center gap-1 rounded-[10px] border border-line bg-surface px-1.5 py-1 focus-within:border-faint"
    >
      <label className="sr-only" htmlFor="chat-rename">
        Chat name
      </label>
      <input
        id="chat-rename"
        ref={ref}
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink focus:outline-none"
      />
      <button type="submit" className={rowBtn} aria-label="Save name">
        <Check className="h-3 w-3" strokeWidth={2} />
      </button>
      <button type="button" onClick={onCancel} className={rowBtn} aria-label="Cancel">
        <X className="h-3 w-3" strokeWidth={2} />
      </button>
    </form>
  );
}
