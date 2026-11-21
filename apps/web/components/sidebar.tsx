"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardPaste,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { swatch, weekProgress, type List } from "@tt/shared";
import { useModel, useSomeday, useSync } from "@tt/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AppLogo } from "./app-logo";

const NAV = [
  { href: "/", label: "My day", icon: Sun },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/to-dos", label: "To-dos", icon: ListChecks },
  { href: "/someday", label: "Someday", icon: Sparkles },
];

/** The active page's thread on the rail's edge (DESIGN.md, Threads). Desktop only. */
const activeThread =
  "md:before:absolute md:before:top-2 md:before:bottom-2 md:before:w-[3px] md:before:rounded-r-full md:before:bg-accent";

const itemBase =
  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2";

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
  const { lists, tasks, settings } = useModel();
  const { isError } = useSync();
  const someday = useSomeday();

  const now = Date.now();
  const progress = (l: List) =>
    weekProgress(
      tasks.filter((t) => t.list_id === l.id),
      now,
      settings.timezone,
    );
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // A list's own row is highlighted instead of its page when one is open.
  const listOpen = (href: string) => !!activeList && lists.some((l) => l.id === activeList) && path.startsWith(href);
  const linkClass = (active: boolean) =>
    `${itemBase} relative ${collapsed ? "md:justify-center md:px-0" : ""} ${active ? `bg-active text-ink ${activeThread} ${collapsed ? "md:before:-left-1.5" : "md:before:-left-3"}` : "text-chip-ink hover:bg-row-hover hover:text-ink"}`;
  /** Text that shows on a wide desktop sidebar only. */
  const wide = collapsed ? "hidden" : "hidden md:inline";
  const toggleLabel = `${collapsed ? "Expand" : "Collapse"} sidebar (⌘\\)`;

  return (
    <aside
      className={`flex shrink-0 items-center gap-2 border-b border-line-soft bg-rail px-3 py-2 md:h-full md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:pt-2.5 md:pb-4 ${collapsed ? "md:w-[44px] md:px-1.5" : "md:w-[232px]"}`}
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
        className={`${itemBase} ml-auto text-ink hover:bg-row-hover md:ml-0 ${collapsed ? "md:justify-center md:px-0" : ""}`}
      >
        <Plus className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className={collapsed ? "hidden sm:inline md:hidden" : "hidden sm:inline"}>Add task</span>
        <kbd className={`ml-auto text-[11px] font-normal text-faint ${wide}`}>⌘K</kbd>
      </button>

      <nav
        aria-label="Main"
        className="order-first flex gap-0.5 md:order-none md:mt-3 md:flex-col md:border-t md:border-line-soft md:pt-3"
      >
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
              {href === "/someday" && someday.openCount > 0 && (
                <span className={`ml-auto text-[11px] font-normal text-faint tabular-nums ${wide}`}>
                  {someday.openCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto md:flex">
        <ListLinks
          lists={lists.filter((l) => l.kind !== "someday")}
          isActive={(l) => path.startsWith("/to-dos") && l.id === activeList}
          progress={progress}
          linkClass={linkClass}
          collapsed={collapsed}
        />
      </div>

      <div className="hidden space-y-0.5 border-t border-line-soft pt-3 md:block">
        <Link
          href="/import"
          title="Import"
          aria-current={isActive("/import") ? "page" : undefined}
          className={linkClass(isActive("/import"))}
        >
          <ClipboardPaste className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
          <span className={wide}>Import</span>
        </Link>
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
              className={`h-1.5 w-1.5 rounded-full ${isError ? "bg-risk" : "bg-open-ink"} ${collapsed ? "absolute top-1.5 right-2.5 ring-2 ring-rail" : ""}`}
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

/** The to-do lists, each with how much of its week is done (DESIGN.md, Layout pieces). */
function ListLinks({
  lists,
  isActive,
  progress,
  linkClass,
  collapsed,
}: {
  lists: List[];
  isActive: (l: List) => boolean;
  progress: (l: List) => { done: number; total: number };
  linkClass: (active: boolean) => string;
  collapsed: boolean;
}) {
  if (!lists.length) return null;
  return (
    <>
      {collapsed ? (
        <div role="presentation" className="mx-2 mt-4 mb-2 border-t border-line-soft" />
      ) : (
        <p className="flex items-baseline justify-between px-2 pt-6 pb-1.5">
          <span className="text-[12px] font-semibold text-faint">Lists</span>
          <span className="text-[11px] text-faint">done this week</span>
        </p>
      )}
      <ul className="space-y-0.5">
        {lists.map((l) => {
          const { done, total } = progress(l);
          const color = swatch(l.color).solid;
          return (
            <li key={l.id}>
              <Link
                href={`/to-dos?list=${l.id}`}
                title={collapsed ? `${l.name} · ${done} of ${total} done this week` : undefined}
                aria-label={collapsed ? l.name : undefined}
                aria-current={isActive(l) ? "page" : undefined}
                className={`${linkClass(isActive(l))} ${collapsed ? "" : "flex-wrap gap-y-1.5"}`}
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span
                      className="text-[11px] font-normal text-faint tabular-nums"
                      aria-label={`${done} of ${total} done this week`}
                    >
                      {done} of {total}
                    </span>
                    <span aria-hidden className="ml-[26px] h-[3px] basis-full overflow-hidden rounded-full bg-line-soft">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: total ? `${(done / total) * 100}%` : 0, background: color }}
                      />
                    </span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
