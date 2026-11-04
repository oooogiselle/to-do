"use client";

import { useCallback } from "react";
import type { Task, TimeBlock } from "@tt/shared";
import { tempId, useCreateBlock, useDeleteBlock, useDeleteTask } from "./data";
import { setNotice } from "./notice";
import { addPendingDelete, removePendingDelete } from "./pending-deletes";

/** How long a deleted task can be brought back before the delete is sent. */
export const UNDO_MS = 8_000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Deleting a task hides it at once and offers Undo; the server delete is sent when the window ends. */
export function useDeleteTaskWithUndo() {
  const del = useDeleteTask();
  const commit = useCallback(
    (id: string) => {
      timers.delete(id);
      del.mutate(id, { onSettled: () => removePendingDelete(id) });
    },
    [del],
  );
  return useCallback(
    (task: Pick<Task, "id" | "title">) => {
      addPendingDelete(task.id);
      setNotice({ kind: "deleted", taskId: task.id, label: task.title });
      timers.set(task.id, setTimeout(() => commit(task.id), UNDO_MS));
    },
    [commit],
  );
}

/** Brings a just-deleted task back, if its delete hasn't been sent yet. */
export function undoDeleteTask(taskId: string) {
  const t = timers.get(taskId);
  if (t === undefined) return;
  clearTimeout(t);
  timers.delete(taskId);
  removePendingDelete(taskId);
  setNotice(null);
}

/** Takes a block off the calendar (the task stays). Upcoming blocks get an Undo toast. */
export function useRemoveBlockWithUndo() {
  const del = useDeleteBlock();
  return useCallback(
    (block: TimeBlock, label: string) => {
      del.mutate(block.id);
      // A block that already ended can't be scheduled again, so there's nothing to undo.
      if (Date.parse(block.end) <= Date.now()) return;
      setNotice({
        kind: "blockRemoved",
        label,
        block: {
          task_id: block.task_id,
          step_id: block.step_id,
          start: block.start,
          end: block.end,
        },
      });
    },
    [del],
  );
}

/** Schedules a just-removed block again. */
export function useRestoreBlock() {
  const create = useCreateBlock();
  return useCallback(
    (block: Extract<Parameters<typeof setNotice>[0], { kind: "blockRemoved" }>["block"]) => {
      create.mutate({ tempId: tempId(), body: block });
      setNotice(null);
    },
    [create],
  );
}
