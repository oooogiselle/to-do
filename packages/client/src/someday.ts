"use client";

import { useMemo } from "react";
import type { Horizon, IdeaKind, List, Task } from "@tt/shared";
import type { ApiClient } from "./api-context";
import { isTemp, PALETTE, tempId, useCreateList, useCreateTask, useModel } from "./data";

/**
 * Someday: long-term goals and things to learn later. They're ordinary tasks in "someday"
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
export const IDEA_KIND_LABEL: Record<IdeaKind, string> = { goal: "Goal", learn: "Learn" };

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
