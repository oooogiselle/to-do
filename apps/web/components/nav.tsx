"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Timeline" },
  { href: "/inbox", label: "Inbox" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:w-44 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-2 md:py-4">
      <span className="mr-3 px-2 text-[15px] font-semibold tracking-tight md:mr-0 md:mb-4">
        Timeline
      </span>
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2 py-1.5 ${active ? "bg-paper font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        onClick={onQuickAdd}
        className="ml-auto flex items-center justify-between gap-3 rounded-md border border-line-strong px-2 py-1.5 text-left hover:border-ink md:mt-4 md:ml-0"
      >
        <span>Add task</span>
        <kbd className="hidden text-xs text-muted md:inline">⌘K</kbd>
      </button>
    </nav>
  );
}
