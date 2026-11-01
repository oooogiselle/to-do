"use client";

import { CalendarPane } from "./calendar-pane";
import { DuePane } from "./due-pane";
import { ListPane } from "./list-pane";
import { listIdOf, type PaneId } from "./layout";

export function PaneContent({ pane, now }: { pane: PaneId; now: number }) {
  if (pane === "week" || pane === "today") return <CalendarPane pane={pane} now={now} />;
  if (pane === "due") return <DuePane pane={pane} now={now} />;
  return <ListPane listId={listIdOf(pane) ?? null} pane={pane} now={now} />;
}
