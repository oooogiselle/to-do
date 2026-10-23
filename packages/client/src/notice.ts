"use client";

import { useSyncExternalStore } from "react";

/**
 * The single toast at the bottom of the screen.
 * - completion: after completing a task or step, offers to remove its upcoming time blocks
 *   (`count` > 0), and says when the task was completed or reopened because of its steps
 *   (`auto`), with an undo.
 * - added: confirms a task created from quick add, with shortcuts to open or schedule it.
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
  | { kind: "added"; taskId: string; label: string; listName?: string };

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
