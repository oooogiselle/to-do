"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardPaste,
  ListChecks,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
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

const COLLAPSED_KEY = "tt.sidebar.collapsed";

/** Whether the desktop sidebar is folded to an icon rail; kept per browser, toggled with ⌘\. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, was ? "0" : "1");
      } catch {}
      return !was;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return [collapsed, toggle] as const;
}

type SidebarProps = { onQuickAdd: () => void };
type BodyProps = SidebarProps & { collapsed: boolean; onToggle: () => void };

/**
 * The open list (?list=<id>) comes from the search params, which need a Suspense boundary;
 * until they're read, the sidebar renders with no list highlighted.
 */
export function Sidebar(props: SidebarProps) {
  // Held here, above the Suspense boundary, so it survives the fallback swapping out.
  const [collapsed, onToggle] = useCollapsed();
  const body = { ...props, collapsed, onToggle };
  return (
    <Suspense fallback={<SidebarBody {...body} activeList={null} />}>
      <SidebarWithParams {...body} />
    </Suspense>
  );
}

function SidebarWithParams(props: BodyProps) {
  const activeList = useSearchParams().get("list");
  return <SidebarBody {...props} activeList={activeList} />;
}

function SidebarBody({ onQuickAdd, collapsed, onToggle, activeList }: BodyProps & { activeList: string | null }) {
  const path = usePathname();
  const email = useUserEmail();
  const { lists, tasks } = useModel();
  const { isError } = useSync();
  const assistant = useAssistant();

  const count = (l: List) => tasks.filter((t) => t.list_id === l.id && t.status === "open").length;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // A list's own row is highlighted instead of its page when one is open.
  const listOpen = (href: string) => !!activeList && lists.some((l) => l.id === activeList) && path.startsWith(href);
  const linkClass = (active: boolean) =>
    `${itemBase} ${collapsed ? "md:justify-center md:px-0" : ""} ${active ? "bg-active text-ink" : "text-chip-ink hover:bg-row-hover hover:text-ink"}`;
  /** Text that shows on a wide desktop sidebar only. */
  const wide = collapsed ? "hidden" : "hidden md:inline";
  const toggleLabel = `${collapsed ? "Expand" : "Collapse"} sidebar (⌘\\)`;

  return (
    <aside
      className={`flex shrink-0 items-center gap-2 border-b border-line-soft bg-rail px-3 py-2 md:h-full md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:py-4 ${collapsed ? "md:w-[44px] md:px-1.5" : "md:w-[232px]"}`}
    >
      <div className={`flex items-center gap-2 md:pb-4 ${collapsed ? "md:flex-col md:px-0" : "md:px-1.5"}`}>
        <AppLogo />
        <span className={`${wide} text-[16px] font-medium tracking-tight text-ink`}>tt.</span>
        <button
          type="button"
          onClick={onToggle}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className={`hidden h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-row-hover hover:text-ink focus-visible:outline-2 md:grid ${collapsed ? "md:mt-3" : "md:ml-auto"}`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onQuickAdd}
        title="Add task (⌘K)"
        aria-label={collapsed ? "Add task" : undefined}
        className={`ml-auto flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[13px] text-ink shadow-card transition-colors hover:bg-row md:mb-4 md:ml-0 ${collapsed ? "px-3 md:px-0" : "px-3"}`}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className={collapsed ? "hidden sm:inline md:hidden" : "hidden sm:inline"}>Add task</span>
        <kbd className={`ml-auto text-[11px] text-faint ${wide}`}>⌘K</kbd>
      </button>

      <nav aria-label="Main" className="order-first flex gap-0.5 md:order-none md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href) && !listOpen(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span className={wide}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto md:flex">
        <ListLinks
          title="Lists"
          lists={lists.filter((l) => l.kind !== "someday")}
          href={(l) => `/to-dos?list=${l.id}`}
          isActive={(l) => path.startsWith("/to-dos") && l.id === activeList}
          count={count}
          linkClass={linkClass}
          collapsed={collapsed}
        />
        <ListLinks
          title="Someday"
          lists={lists.filter((l) => l.kind === "someday")}
          href={(l) => `/someday?list=${l.id}`}
          isActive={(l) => path.startsWith("/someday") && l.id === activeList}
          count={count}
          linkClass={linkClass}
          collapsed={collapsed}
        />
      </div>

      <button
        type="button"
        onClick={assistant.toggle}
        aria-pressed={assistant.open}
        title="Ask tt. (⌘J)"
        className={`${linkClass(assistant.open)} order-last grid h-8 w-8 place-items-center p-0 md:order-none md:mb-2 md:flex md:h-auto md:w-auto md:py-1.5 ${collapsed ? "" : "md:px-2"}`}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
        <span className={wide}>Ask tt.</span>
        <kbd className={`ml-auto text-[11px] text-faint ${wide}`}>⌘J</kbd>
      </button>

      <div className="hidden border-t border-line-soft pt-3 md:block">
        <Link
          href="/settings"
          title="Settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className={linkClass(isActive("/settings"))}
        >
          <Settings className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
          <span className={wide}>Settings</span>
        </Link>
        {email && (
          <div
            className={`relative mt-2 flex items-center gap-2.5 py-1.5 ${collapsed ? "justify-center" : "px-2"}`}
            title={email}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-line text-[10px] text-chip-ink">
              {initials(email)}
            </span>
            {!collapsed && <span className="min-w-0 flex-1 truncate text-[13px] text-chip-ink">{email}</span>}
            <span
              role="img"
              aria-label={isError ? "Sync problem" : "Synced"}
              className={`h-1.5 w-1.5 rounded-full ${isError ? "bg-risk" : "bg-mint"} ${collapsed ? "absolute top-1.5 right-2.5 ring-2 ring-rail" : ""}`}
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
  isActive,
  count,
  linkClass,
  collapsed,
}: {
  title: string;
  lists: List[];
  href: (l: List) => string;
  isActive: (l: List) => boolean;
  count: (l: List) => number;
  linkClass: (active: boolean) => string;
  collapsed: boolean;
}) {
  if (!lists.length) return null;
  return (
    <>
      {collapsed ? (
        <div role="presentation" className="mx-2 mt-4 mb-2 border-t border-line-soft" />
      ) : (
        <p className="px-2 pt-6 pb-1.5 text-[11px] tracking-[0.08em] text-faint uppercase">{title}</p>
      )}
      <ul className="space-y-0.5">
        {lists.map((l) => (
          <li key={l.id}>
            <Link
              href={href(l)}
              title={collapsed ? `${l.name} · ${count(l)}` : undefined}
              aria-label={collapsed ? l.name : undefined}
              aria-current={isActive(l) ? "page" : undefined}
              className={linkClass(isActive(l))}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                <span className="h-2 w-2 rounded-full" style={{ background: swatch(l.color).solid }} />
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className="text-[11px] text-faint">{count(l)}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
