"use client";

import { useSyncExternalStore } from "react";

/**
 * The single toast at the bottom of the screen.
 * - completion: after completing a task or step, offers to remove its upcoming time blocks
 *   (`count` > 0), and says when the task was completed or reopened because of its steps
 *   (`auto`), with an undo.
 * - added: confirms a task created from quick add, with shortcuts to open or schedule it.
 * - deleted: a task was deleted; offers Undo until the delete is sent.
 * - blockRemoved: a time block was taken off the calendar; Undo schedules it again.
 */
export type Notice =
  | {
      kind: "completion";
      taskId: string;
      stepId?: string;
      count: number;
      label: string;
      auto?: "done" | "reopened";
    }
  | { kind: "added"; taskId: string; label: string; listName?: string }
  | { kind: "deleted"; taskId: string; label: string }
  | {
      kind: "blockRemoved";
      label: string;
      block: { task_id: string; step_id: string | null; start: string; end: string };
    };

let notice: Notice | null = null;
const listeners = new Set<() => void>();

export const setNotice = (next: Notice | null) => {
  notice = next;
  listeners.forEach((l) => l());
};

export function useNotice() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => notice,
    () => null,
  );
}
