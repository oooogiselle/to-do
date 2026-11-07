"use client";

import { useCallback } from "react";
import { isDoneOn, isRecurring, localDate, toggleDoneDate, type TimeBlock } from "@tt/shared";
import {
  useDeleteStep,
  useModel,
  useRemoveUpcomingBlocks,
  useUpdateStep,
  useUpdateTask,
} from "./data";
import { setNotice, type Notice } from "./notice";

type Completion = Extract<Notice, { kind: "completion" }>;

/** Actions for a completion notice: remove the blocks, or undo the automatic status change. */
export function useCompletionActions(n: Completion) {
  const remove = useRemoveUpcomingBlocks();
  const updateTask = useUpdateTask();
  return {
    accept: () => {
      remove.mutate({ task_id: n.taskId, ...(n.stepId && { step_id: n.stepId }) });
      setNotice(null);
    },
    /** Reverts the automatic status change; the steps stay as they are. */
    undo: () => {
      if (!n.auto) return;
      const status = n.auto === "done" ? "open" : "done";
      updateTask.mutate({ id: n.taskId, patch: { status } });
      setNotice(null);
    },
  };
}

/**
 * Completing a task or step: updates it, then offers to remove its upcoming time blocks
 * from the calendar (spec: "its future TimeBlocks are offered for removal").
 * A task follows its steps: done once every step is, reopened when one is unchecked.
 */
export function useCompletion() {
  const { blocks, taskById, stepsByTask, settings } = useModel();
  const updateTask = useUpdateTask();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();

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

  const setTaskDone = (
    taskId: string,
    done: boolean,
    auto?: Completion["auto"],
    /** Local date to check a repeating task off for; today by default. */
    date?: string,
  ) => {
    // A repeating task is done for one day, not for good.
    const routine = taskById.get(taskId);
    if (routine && isRecurring(routine)) {
      const day = date ?? localDate(new Date(), settings.timezone);
      updateTask.mutate({
        id: taskId,
        patch: { done_dates: toggleDoneDate(routine.done_dates, day, done) },
      });
      return;
    }
    updateTask.mutate({ id: taskId, patch: { status: done ? "done" : "open" } });
    const count = done ? upcoming(taskId) : 0;
    const label = taskById.get(taskId)?.title ?? "this task";
    if (count || auto) setNotice({ kind: "completion", taskId, count, label, auto });
  };

  // Completing the task offers to remove all its blocks, the step's included.
  const completeIfAllDone = (taskId: string, steps: { done: boolean }[]) => {
    const open = taskById.get(taskId)?.status !== "done";
    if (open && steps.length && steps.every((s) => s.done)) {
      setTaskDone(taskId, true, "done");
      return true;
    }
    return false;
  };

  const setStepDone = (taskId: string, stepId: string, done: boolean) => {
    updateStep.mutate({ id: stepId, patch: { done } });
    const steps = (stepsByTask.get(taskId) ?? []).map((s) =>
      s.id === stepId ? { ...s, done } : s,
    );
    if (completeIfAllDone(taskId, steps)) return;
    if (!done && taskById.get(taskId)?.status === "done") {
      return setTaskDone(taskId, false, "reopened");
    }
    const count = done ? upcoming(taskId, stepId) : 0;
    const step = steps.find((s) => s.id === stepId);
    if (count) {
      setNotice({ kind: "completion", taskId, stepId, count, label: step?.title ?? "this step" });
    }
  };

  // A block of a repeating task stands for the occurrence on the day it starts, so it's done
  // exactly when the task is checked off for that day, in the list or on the calendar.
  const blockDay = (b: Pick<TimeBlock, "start">) => localDate(new Date(b.start), settings.timezone);

  return {
    setTaskDone: (taskId: string, done: boolean) => setTaskDone(taskId, done),
    setStepDone,
    /** Done state of a block: its step's, its task's for that day if it repeats, else its task's. */
    isBlockDone: (b: Pick<TimeBlock, "task_id" | "step_id" | "start">) => {
      const task = taskById.get(b.task_id);
      if (b.step_id) return !!stepsByTask.get(b.task_id)?.find((s) => s.id === b.step_id)?.done;
      if (!task) return false;
      return isDoneOn(task, blockDay(b));
    },
    /** Checks a block off (or back on), keeping it in step with its to-do. */
    setBlockDone: (b: Pick<TimeBlock, "task_id" | "step_id" | "start">, done: boolean) => {
      if (b.step_id) return setStepDone(b.task_id, b.step_id, done);
      setTaskDone(b.task_id, done, undefined, blockDay(b));
    },
    deleteStep: (taskId: string, stepId: string) => {
      deleteStep.mutate(stepId);
      completeIfAllDone(
        taskId,
        (stepsByTask.get(taskId) ?? []).filter((s) => s.id !== stepId),
      );
    },
  };
}
