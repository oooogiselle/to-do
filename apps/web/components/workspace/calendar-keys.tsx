"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { isCalendarPane, type PaneId, type WorkspaceLayout } from "./layout";

export type CalendarControls = {
  step: (dir: -1 | 1) => void;
  today: () => void;
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
};

type Registry = {
  register: (pane: "week" | "today", c: CalendarControls | null) => void;
  focus: (pane: "week" | "today") => void;
};

const RegistryContext = createContext<Registry | null>(null);

/** Lets a calendar pane take the timeline keyboard shortcuts while it's the one in use. */
export function useCalendarKeys(pane: "week" | "today", controls: CalendarControls) {
  const registry = useContext(RegistryContext);
  const latest = useRef(controls);
  latest.current = controls;
  useEffect(() => {
    if (!registry) return;
    registry.register(pane, {
      step: (d) => latest.current.step(d),
      today: () => latest.current.today(),
      zoomBy: (f) => latest.current.zoomBy(f),
      resetZoom: () => latest.current.resetZoom(),
    });
    return () => registry.register(pane, null);
  }, [registry, pane]);
  return { onFocus: () => registry?.focus(pane) };
}

/**
 * Timeline shortcuts for the workspace: ←/→ and t move the calendar in use (the last one
 * pointed at or focused, else the active tab), = - 0 zoom it, d/w bring up Today/Week.
 */
export function CalendarKeys({
  layout,
  onShow,
  children,
}: {
  layout: WorkspaceLayout;
  onShow: (pane: "week" | "today") => void;
  children: React.ReactNode;
}) {
  const panes = useRef(new Map<"week" | "today", CalendarControls>());
  const focused = useRef<"week" | "today" | null>(null);
  const registry = useRef<Registry>({
    register: (pane, c) => {
      if (c) panes.current.set(pane, c);
      else panes.current.delete(pane);
    },
    focus: (pane) => (focused.current = pane),
  }).current;

  const latestLayout = useRef(layout);
  latestLayout.current = layout;
  const latestShow = useRef(onShow);
  latestShow.current = onShow;

  useEffect(() => {
    const target = () => {
      const l = latestLayout.current;
      if (focused.current && panes.current.has(focused.current))
        return panes.current.get(focused.current)!;
      const active = l.activeCenter;
      if (active && isCalendarPane(active) && panes.current.has(active))
        return panes.current.get(active)!;
      const first = ([...l.left, ...l.center, ...l.right] as PaneId[]).find(
        (p): p is "week" | "today" => isCalendarPane(p) && panes.current.has(p),
      );
      return first ? panes.current.get(first)! : null;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "d" || e.key === "w") {
        const pane = e.key === "d" ? "today" : "week";
        focused.current = pane;
        return latestShow.current(pane);
      }
      const c = target();
      if (!c) return;
      if (e.key === "ArrowLeft") c.step(-1);
      else if (e.key === "ArrowRight") c.step(1);
      else if (e.key === "t") c.today();
      else if (e.key === "=" || e.key === "+") c.zoomBy(1.25);
      else if (e.key === "-") c.zoomBy(0.8);
      else if (e.key === "0") c.resetZoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}
