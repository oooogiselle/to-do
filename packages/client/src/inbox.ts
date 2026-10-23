"use client";

import { useMemo } from "react";
import type { List, Priority, Task } from "@tt/shared";
import { useModel } from "./data";

export type InboxSort = "due" | "priority";
const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2, none: 3 };
export const PRIORITY_MARK: Record<Priority, string> = {
  high: "!!!",
  med: "!!",
  low: "!",
  none: "",
};

const byDue = (a: Task, b: Task) =>
  (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity);
const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b);

/**
 * Tasks grouped by list ("No list" first, then every list even when empty), sorted by due date
 * or priority, plus the start of each task's next upcoming (or in-progress) block.
 */
export function useInbox(sort: InboxSort, showDone: boolean) {
  const { lists, tasks, blocks } = useModel();

  const nextBlock = useMemo(() => {
    const now = Date.now();
    const next = new Map<string, number>();
    for (const b of blocks) {
      if (Date.parse(b.end) <= now) continue;
      const start = Date.parse(b.start);
      const prev = next.get(b.task_id);
      if (prev === undefined || start < prev) next.set(b.task_id, start);
    }
    return next;
  }, [blocks]);

  const groups = useMemo(() => {
    const visible = tasks.filter((t) => t.status === "open" || (showDone && t.status === "done"));
    const sorted = [...visible].sort(sort === "due" ? byDue : byPriority);
    const withList: { list: List | null; tasks: Task[] }[] = [
      {
        list: null,
        tasks: sorted.filter((t) => !t.list_id || !lists.some((l) => l.id === t.list_id)),
      },
      ...lists.map((list) => ({ list, tasks: sorted.filter((t) => t.list_id === list.id) })),
    ];
    return withList.filter((g) => g.list || g.tasks.length);
  }, [tasks, lists, sort, showDone]);

  return { groups, nextBlock };
}
