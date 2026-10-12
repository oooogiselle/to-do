"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useModel, useRemoveUpcomingBlocks, useUpdateStep, useUpdateTask } from "./data";

/** Pending "remove upcoming blocks?" offer shown after completing a task or step. */
export type BlockRemovalOffer = { taskId: string; stepId?: string; count: number; label: string };

let offer: BlockRemovalOffer | null = null;
const listeners = new Set<() => void>();
const setOffer = (next: BlockRemovalOffer | null) => {
  offer = next;
  listeners.forEach((l) => l());
};

export function useBlockRemovalOffer() {
  const current = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => offer,
    () => null,
  );
  const remove = useRemoveUpcomingBlocks();
  return {
    offer: current,
    dismiss: () => setOffer(null),
    accept: () => {
      if (!current) return;
      remove.mutate({
        task_id: current.taskId,
        ...(current.stepId && { step_id: current.stepId }),
      });
      setOffer(null);
    },
  };
}

/**
 * Completing a task or step: updates it, then offers to remove its upcoming time blocks
 * from the calendar (spec: "its future TimeBlocks are offered for removal").
 */
export function useCompletion() {
  const { blocks, taskById, stepsByTask } = useModel();
  const updateTask = useUpdateTask();
  const updateStep = useUpdateStep();

  const upcoming = useCallback(
    (taskId: string, stepId?: string) =>
      blocks.filter(
        (b) =>
          b.task_id === taskId &&
          (!stepId || b.step_id === stepId) &&
          Date.parse(b.end) > Date.now(),
      ).length,
    [blocks],
  );

  return {
    setTaskDone: (taskId: string, done: boolean) => {
      updateTask.mutate({ id: taskId, patch: { status: done ? "done" : "open" } });
      const count = done ? upcoming(taskId) : 0;
      if (count) setOffer({ taskId, count, label: taskById.get(taskId)?.title ?? "this task" });
    },
    setStepDone: (taskId: string, stepId: string, done: boolean) => {
      updateStep.mutate({ id: stepId, patch: { done } });
      const count = done ? upcoming(taskId, stepId) : 0;
      const step = stepsByTask.get(taskId)?.find((s) => s.id === stepId);
      if (count) setOffer({ taskId, stepId, count, label: step?.title ?? "this step" });
    },
  };
}
