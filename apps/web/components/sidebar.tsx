"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardPaste, ListChecks, MessageCircle, Plus, Settings, Sparkles, Sun } from "lucide-react";
import { swatch, type List } from "@tt/shared";
import { useModel, useSync } from "@tt/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AppLogo } from "./app-logo";
import { useAssistant } from "./assistant/assistant-context";

const NAV = [
  { href: "/", label: "My day", icon: Sun },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/to-dos", label: "To-dos", icon: ListChecks },
  { href: "/someday", label: "Someday", icon: Sparkles },
  { href: "/import", label: "Import", icon: ClipboardPaste },
];

const itemBase =
  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors focus-visible:outline-2";

function initials(email: string): string {
  const name = email.split("@")[0]!;
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0]!.toUpperCase();
}

function useUserEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    createBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  return email;
}

export function Sidebar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const path = usePathname();
  const email = useUserEmail();
  const { lists, tasks } = useModel();
  const { isError } = useSync();
  const assistant = useAssistant();

  const count = (l: List) => tasks.filter((t) => t.list_id === l.id && t.status === "open").length;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const linkClass = (active: boolean) =>
    `${itemBase} ${active ? "bg-active text-ink" : "text-chip-ink hover:bg-row-hover hover:text-ink"}`;

  return (
    <aside className="flex shrink-0 items-center gap-2 border-b border-line-soft bg-rail px-3 py-2 md:h-full md:w-[232px] md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:py-4">
      <div className="flex items-center gap-2 md:px-1.5 md:pb-4">
        <AppLogo />
        <span className="hidden text-[16px] font-medium tracking-tight text-ink md:inline">tt.</span>
      </div>

      <button
        type="button"
        onClick={onQuickAdd}
        title="Add task (⌘K)"
        className="ml-auto flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink shadow-card transition-colors hover:bg-row md:mb-4 md:ml-0"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Add task</span>
        <kbd className="ml-auto hidden text-[11px] text-faint md:inline">⌘K</kbd>
      </button>

      <nav aria-label="Main" className="order-first flex gap-0.5 md:order-none md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto md:flex">
        <ListLinks
          title="Lists"
          lists={lists.filter((l) => l.kind !== "someday")}
          href={(l) => `/to-dos#${l.id}`}
          count={count}
          linkClass={linkClass}
        />
        <ListLinks
          title="Someday"
          lists={lists.filter((l) => l.kind === "someday")}
          href={(l) => `/someday#${l.id}`}
          count={count}
          linkClass={linkClass}
        />
      </div>

      <button
        type="button"
        onClick={assistant.toggle}
        aria-pressed={assistant.open}
        title="Ask tt. (⌘J)"
        className={`${linkClass(assistant.open)} order-last grid h-8 w-8 place-items-center p-0 md:order-none md:mb-2 md:flex md:h-auto md:w-auto md:px-2 md:py-1.5`}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
        <span className="hidden md:inline">Ask tt.</span>
        <kbd className="ml-auto hidden text-[11px] text-faint md:inline">⌘J</kbd>
      </button>

      <div className="hidden border-t border-line-soft pt-3 md:block">
        <Link
          href="/settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className={linkClass(isActive("/settings"))}
        >
          <Settings className="h-4 w-4 text-muted" strokeWidth={1.75} />
          Settings
        </Link>
        {email && (
          <div className="mt-2 flex items-center gap-2.5 px-2 py-1.5" title={email}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-line text-[10px] text-chip-ink">
              {initials(email)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-chip-ink">{email}</span>
            <span
              role="img"
              aria-label={isError ? "Sync problem" : "Synced"}
              className={`h-1.5 w-1.5 rounded-full ${isError ? "bg-risk" : "bg-mint"}`}
            />
          </div>
        )}
      </div>

      <Link
        href="/settings"
        aria-label="Settings"
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-row-hover md:hidden"
      >
        <Settings className="h-4 w-4" strokeWidth={1.75} />
      </Link>
    </aside>
  );
}

function ListLinks({
  title,
  lists,
  href,
  count,
  linkClass,
}: {
  title: string;
  lists: List[];
  href: (l: List) => string;
  count: (l: List) => number;
  linkClass: (active: boolean) => string;
}) {
  if (!lists.length) return null;
  return (
    <>
      <p className="px-2 pt-6 pb-1.5 text-[11px] tracking-[0.08em] text-faint uppercase">{title}</p>
      <ul className="space-y-0.5">
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={href(l)} className={linkClass(false)}>
              <span className="grid h-4 w-4 place-items-center">
                <span className="h-2 w-2 rounded-full" style={{ background: swatch(l.color).solid }} />
              </span>
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="text-[11px] text-faint">{count(l)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
