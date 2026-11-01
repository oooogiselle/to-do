"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Nav } from "./nav";
import { NoticeBanner } from "./notice-banner";
import { QuickAdd } from "./quick-add";
import { TaskSheet } from "./task-sheet";

/**
 * Opens a task's detail sheet by setting ?task=<id> on the current page; `panel` opens it
 * on that panel (?panel=schedule). Closing (null) clears both.
 */
export function useOpenTask() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return useCallback(
    (id: string | null, opts?: { panel?: "schedule" }) => {
      const next = new URLSearchParams(params);
      if (id) next.set("task", id);
      else next.delete("task");
      if (id && opts?.panel) next.set("panel", opts.panel);
      else next.delete("panel");
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [router, path, params],
  );
}

function OpenTaskSheet() {
  const params = useSearchParams();
  const taskId = params.get("task");
  const openTask = useOpenTask();
  return taskId ? (
    <TaskSheet
      key={taskId}
      taskId={taskId}
      initialPanel={params.get("panel") === "schedule" ? "schedule" : null}
      onClose={() => openTask(null)}
    />
  ) : null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [quickAdd, setQuickAdd] = useState(false);
  const closeQuickAdd = useCallback(() => setQuickAdd(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickAdd(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-paper md:flex-row">
      <Nav onQuickAdd={() => setQuickAdd(true)} />
      <main className="min-h-0 min-w-0 flex-1">{children}</main>
      <QuickAdd open={quickAdd} onClose={closeQuickAdd} />
      <NoticeBanner />
      <Suspense>
        <OpenTaskSheet />
      </Suspense>
    </div>
  );
}
