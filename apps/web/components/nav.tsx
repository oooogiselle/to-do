"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, ClipboardPaste, ListChecks, Plus, Settings } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const LINKS = [
  { href: "/", label: "Workspace", icon: CalendarRange, color: "var(--tt-sky)" },
  { href: "/to-dos", label: "To-dos", icon: ListChecks, color: "var(--tt-coral)" },
  { href: "/import", label: "Import", icon: ClipboardPaste, color: "var(--tt-sun)" },
  { href: "/settings", label: "Settings", icon: Settings, color: "var(--tt-grape)" },
];

function initials(email: string | null): string {
  if (!email) return "";
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

/** Logo: four rounded squares in the list hues. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Timeline"
      className={`grid h-8 w-8 grid-cols-2 gap-[3px] rounded-[9px] bg-white/10 p-[5px] ${className}`}
    >
      <span className="rounded-[3px] bg-coral" />
      <span className="rounded-[3px] bg-sun" />
      <span className="rounded-[3px] bg-sky" />
      <span className="rounded-[3px] bg-mint" />
    </div>
  );
}

export function Nav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const path = usePathname();
  const email = useUserEmail();
  return (
    <aside className="flex shrink-0 items-center gap-2 bg-ink px-3 py-2 text-white md:h-full md:w-14 md:flex-col md:px-0 md:py-3.5">
      <Logo className="md:mb-2" />
      <nav aria-label="Main" className="flex gap-1.5 md:flex-col">
        {LINKS.map(({ href, label, icon: Icon, color }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-[10px] transition-colors focus-visible:outline-white ${
                active ? "bg-white/[0.14]" : "hover:bg-white/[0.07]"
              }`}
            >
              <Icon
                className="h-[18px] w-[18px] transition-colors"
                style={{ color: active ? color : "rgba(255,255,255,0.45)" }}
                strokeWidth={2.4}
              />
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onQuickAdd}
        title="Add task (⌘K)"
        aria-label="Add task"
        className="ml-auto grid h-9 w-9 place-items-center rounded-[10px] bg-coral text-white transition-colors hover:bg-[#cb6a51] focus-visible:outline-white md:mt-2 md:ml-0"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={3} />
      </button>
      <div className="hidden flex-1 md:block" />
      {email && (
        <Link
          href="/settings"
          title={email}
          aria-label={`Signed in as ${email}`}
          className="hidden h-7 w-7 place-items-center rounded-full border-2 border-white/20 bg-grape text-[10px] font-bold md:grid"
        >
          {initials(email)}
        </Link>
      )}
    </aside>
  );
}
