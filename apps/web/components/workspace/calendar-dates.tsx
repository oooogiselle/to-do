"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { addDays, localDate } from "@tt/shared";
import { fmtDay, useModel } from "@tt/client";
import { paneLabel, type PaneId } from "./layout";

type CalendarPaneId = "week" | "today";
type Anchors = Record<CalendarPaneId, string | null>;
type Ctx = { anchors: Anchors; set: (pane: CalendarPaneId, day: string | null) => void };

const DatesContext = createContext<Ctx | null>(null);

/**
 * The date each calendar pane is showing (null = follow today). Lives above the panes so
 * switching tabs or moving a pane, which remounts it, keeps the chosen day.
 */
export function CalendarDatesProvider({ children }: { children: React.ReactNode }) {
  const [anchors, setAnchors] = useState<Anchors>({ week: null, today: null });
  const set = useCallback(
    (pane: CalendarPaneId, day: string | null) => setAnchors((a) => ({ ...a, [pane]: day })),
    [],
  );
  return <DatesContext.Provider value={{ anchors, set }}>{children}</DatesContext.Provider>;
}

export function useCalendarAnchor(pane: CalendarPaneId) {
  const ctx = useContext(DatesContext);
  const [local, setLocal] = useState<string | null>(null);
  const anchor = ctx ? ctx.anchors[pane] : local;
  const setAnchor = useCallback(
    (day: string | null) => (ctx ? ctx.set(pane, day) : setLocal(day)),
    [ctx, pane],
  );
  return [anchor, setAnchor] as const;
}

/** "Today", "Tomorrow", "Yesterday", else "Mon, Nov 3". */
export function dayLabel(day: string, today: string, tz: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return fmtDay(day, tz);
}

/** Pane names, with the day pane named after the day it's showing. */
export function usePaneLabel(now: number) {
  const { lists, settings } = useModel();
  const ctx = useContext(DatesContext);
  const tz = settings.timezone;
  return (pane: PaneId) => {
    if (pane !== "today") return paneLabel(pane, lists);
    const today = localDate(new Date(now), tz);
    return dayLabel(ctx?.anchors.today ?? today, today, tz);
  };
}
