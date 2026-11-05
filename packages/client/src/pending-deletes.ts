"use client";

import { useSyncExternalStore } from "react";

/**
 * Task ids deleted in the UI but not yet sent to the server (the undo window).
 * The model hides them so a refetch during the window can't bring them back.
 */
let pending: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const emit = (next: Set<string>) => {
  pending = next;
  listeners.forEach((l) => l());
};

export const addPendingDelete = (id: string) => emit(new Set(pending).add(id));
export const removePendingDelete = (id: string) => {
  const next = new Set(pending);
  next.delete(id);
  emit(next);
};

export function usePendingDeletes() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => pending,
    () => pending,
  );
}
