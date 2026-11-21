"use client";

import { useCallback } from "react";
import type { Task, TimeBlock } from "@tt/shared";
import { tempId, useCreateBlock, useDeleteBlock, useDeleteTask, useDeleteTasks } from "./data";
import { setNotice } from "./notice";
import { addPendingDeletes, removePendingDeletes } from "./pending-deletes";

/** How long a deleted task can be brought back before the delete is sent. */
export const UNDO_MS = 8_000;

/** Delete batches waiting out their undo window, by batch id. */
const batches = new Map<string, { ids: string[]; timer: ReturnType<typeof setTimeout> }>();
let nextBatch = 0;

/**
 * Deleting tasks hides them at once and offers one Undo for the lot; the server delete is sent
 * when the window ends (one request however many there are).
 */
export function useDeleteTasksWithUndo() {
  const delOne = useDeleteTask();
  const delMany = useDeleteTasks();
  const commit = useCallback(
    (batchId: string) => {
      const batch = batches.get(batchId);
      if (!batch) return;
      batches.delete(batchId);
      const done = () => removePendingDeletes(batch.ids);
      if (batch.ids.length === 1) delOne.mutate(batch.ids[0]!, { onSettled: done });
      else delMany.mutate(batch.ids, { onSettled: done });
    },
    [delOne, delMany],
  );
  return useCallback(
    (tasks: Pick<Task, "id" | "title">[]) => {
      if (!tasks.length) return;
      const batchId = `del-${++nextBatch}`;
      const ids = tasks.map((t) => t.id);
      addPendingDeletes(ids);
      const label = tasks.length === 1 ? `“${tasks[0]!.title}”` : `${tasks.length} to-dos`;
      setNotice({ kind: "deleted", batchId, label });
      batches.set(batchId, { ids, timer: setTimeout(() => commit(batchId), UNDO_MS) });
    },
    [commit],
  );
}

/** Deleting a task hides it at once and offers Undo; the server delete is sent when the window ends. */
export function useDeleteTaskWithUndo() {
  const del = useDeleteTasksWithUndo();
  return useCallback((task: Pick<Task, "id" | "title">) => del([task]), [del]);
}

/** Brings just-deleted tasks back, if their delete hasn't been sent yet. */
export function undoDelete(batchId: string) {
  const batch = batches.get(batchId);
  if (!batch) return;
  clearTimeout(batch.timer);
  batches.delete(batchId);
  removePendingDeletes(batch.ids);
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
