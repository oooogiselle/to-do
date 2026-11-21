"use client";

import { useCallback, useMemo } from "react";
import { isStaleOverdue, type Task } from "@tt/shared";
import { useModel, useUpdateTask } from "./data";
import { isSomedayTask } from "./someday";

/**
 * To-dos more than 3 days past due that To-dos should ask about deleting, oldest first. Someday
 * ideas and to-dos already kept at their due date are left out. `listId` narrows it to one list.
 */
export function useStaleOverdue(now: number, listId?: string | null): Task[] {
  const { tasks, listById } = useModel();
  return useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            (!listId || t.list_id === listId) &&
            !isSomedayTask(t, listById) &&
            isStaleOverdue(t, now),
        )
        .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!)),
    [tasks, listById, now, listId],
  );
}

/** Keeps an overdue to-do: it stays as it is and isn't asked about again at this due date. */
export function useKeepOverdue() {
  const update = useUpdateTask();
  return useCallback(
    (task: Pick<Task, "id" | "due_at">) =>
      update.mutate({ id: task.id, patch: { overdue_kept_due: task.due_at } }),
    [update],
  );
}
