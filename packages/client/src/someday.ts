"use client";

import { useMemo } from "react";
import {
  addDays,
  formatMinutes,
  type Horizon,
  type IdeaKind,
  type List,
  type Task,
  type TaskResearch,
  toggleDoneDate,
} from "@tt/shared";
import type { ApiClient } from "./api-context";
import {
  isTemp,
  PALETTE,
  tempId,
  useCreateList,
  useCreateTask,
  useModel,
  useUpdateTask,
} from "./data";

/**
 * Someday: long-term goals, things to learn later and people to keep in touch with. They're ordinary tasks in "someday"
 * lists, kept out of the To-dos page and the Due rail.
 */
export const isSomedayList = (list: List | undefined) => list?.kind === "someday";

/** True when the task sits in a someday list. */
export const isSomedayTask = (task: Pick<Task, "list_id">, listById: Map<string, List>) =>
  !!task.list_id && isSomedayList(listById.get(task.list_id));

export const HORIZON_LABEL: Record<Horizon, string> = {
  month: "This month",
  year: "This year",
  someday: "Someday",
};
export const IDEA_KIND_LABEL: Record<IdeaKind, string> = {
  goal: "Goal",
  learn: "Learn",
  people: "People",
};

/** Most recent day the user logged connecting with this person ("YYYY-MM-DD"), or null. */
export const lastContact = (task: Pick<Task, "done_dates">): string | null =>
  task.done_dates.length ? [...task.done_dates].sort().at(-1)! : null;

/** "today", "yesterday", "Nov 3" for a logged contact date. */
export function contactLabel(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** Logs a day the user connected with someone; the free-time suggestions read it back. */
export function useLogContact() {
  const updateTask = useUpdateTask();
  return (task: Pick<Task, "id" | "done_dates">, date: string) =>
    updateTask.mutate({ id: task.id, patch: { done_dates: toggleDoneDate(task.done_dates, date, true) } });
}

/** Section order on the Someday page: soonest timeframe first, unsorted ideas last. */
export const HORIZON_ORDER: (Horizon | null)[] = ["month", "year", "someday", null];

export type SomedayItem = {
  task: Task;
  list: List;
  /** Steps done / total, for goal progress. total is 0 when the item has no steps. */
  progress: { done: number; total: number };
};

export type SomedayFilter = { kind?: IdeaKind | "all"; showDone?: boolean };

/** Someday lists and their items, newest first, grouped by timeframe. */
export function useSomeday({ kind = "all", showDone = false }: SomedayFilter = {}) {
  const { lists, listById, tasks, stepsByTask } = useModel();
  return useMemo(() => {
    const somedayLists = lists.filter((l) => l.kind === "someday");
    const items: SomedayItem[] = [];
    for (const task of tasks) {
      const list = task.list_id ? listById.get(task.list_id) : undefined;
      if (!list || !isSomedayList(list)) continue;
      if (task.status === "archived" || (task.status === "done" && !showDone)) continue;
      if (kind !== "all" && task.idea_kind !== kind) continue;
      const steps = stepsByTask.get(task.id) ?? [];
      items.push({
        task,
        list,
        progress: { done: steps.filter((s) => s.done).length, total: steps.length },
      });
    }
    // Open before done, then newest first.
    items.sort(
      (a, b) =>
        Number(a.task.status === "done") - Number(b.task.status === "done") ||
        b.task.created_at.localeCompare(a.task.created_at),
    );
    const sections = HORIZON_ORDER.map((horizon) => ({
      horizon,
      items: items.filter((i) => i.task.horizon === horizon),
    })).filter((s) => s.items.length);
    const openCount = items.filter((i) => i.task.status === "open").length;
    return { lists: somedayLists, items, sections, openCount };
  }, [lists, listById, tasks, stepsByTask, kind, showDone]);
}

type TaskBody = Parameters<ApiClient["createTask"]>[0];

/**
 * Adds a someday item. Without a someday list yet, it creates one named "Someday" first and
 * waits for its real id, so the task never points at a temp list.
 */
export function useAddSomeday() {
  const { lists } = useModel();
  const createList = useCreateList();
  const createTask = useCreateTask();
  return async (body: TaskBody, opts?: { listId?: string; onAdded?: (task: Task) => void }) => {
    let listId = opts?.listId ?? lists.find((l) => l.kind === "someday" && !isTemp(l.id))?.id;
    if (!listId) {
      const list = await createList.mutateAsync({
        tempId: tempId(),
        body: { name: "Someday", color: PALETTE[4]!, sort_order: lists.length, kind: "someday" },
      });
      listId = list.id;
    }
    createTask.mutate(
      { tempId: tempId(), body: { ...body, list_id: listId, due_at: null } },
      { onSuccess: opts?.onAdded },
    );
  };
}

/** A research request still pending after this long is treated as failed (the server gave up). */
const RESEARCH_STALE_MS = 4 * 60 * 1000;

export type ResearchState =
  | { state: "none" }
  | { state: "pending" }
  | { state: "done"; research: TaskResearch }
  | { state: "error"; message: string; research: TaskResearch };

/** Where a someday item's web research stands. */
export function researchState(task: Pick<Task, "research">, now = Date.now()): ResearchState {
  const r = task.research;
  if (!r) return { state: "none" };
  if (r.status === "pending") {
    return now - Date.parse(r.requested_at) < RESEARCH_STALE_MS
      ? { state: "pending" }
      : { state: "error", message: "That took too long. Try again.", research: r };
  }
  if (r.status === "error") {
    return { state: "error", message: r.error || "Couldn't look this up. Try again.", research: r };
  }
  return { state: "done", research: r };
}

/** "~30h" for a big total (whole hours), "45m" / "1h 30m" for small ones. */
export function formatEffort(min: number): string {
  return min < 120 ? formatMinutes(min) : `~${Math.round(min / 60)}h`;
}

/** The estimate line for a researched item: "~30h over about 3 months · 45m sessions". */
export function effortLabel(r: Pick<TaskResearch, "total_min" | "span" | "session_min">): string | null {
  const total = r.total_min ? [formatEffort(r.total_min), r.span].filter(Boolean).join(" ") : null;
  const session = r.session_min ? `${formatMinutes(r.session_min)} sessions` : null;
  return [total, session].filter(Boolean).join(" · ") || null;
}

