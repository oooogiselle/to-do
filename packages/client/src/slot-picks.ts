"use client";

import { useMutation } from "@tanstack/react-query";
import type { SlotPick, SuggestRequest } from "@tt/shared";
import { useApi } from "./api-context";
import { tempId, useCreateBlock } from "./data";

/**
 * AI picks for what to do in one free gap. `suggest` asks (nothing is saved); `accept` schedules a
 * pick as a time block through the usual optimistic path.
 */
export function useSlotPicks() {
  const api = useApi();
  const createBlock = useCreateBlock();
  const ask = useMutation({ mutationFn: (req: SuggestRequest) => api.suggest(req) });

  return {
    suggest: ask.mutate,
    reset: ask.reset,
    picks: ask.data?.picks ?? null,
    note: ask.data?.note ?? null,
    isPending: ask.isPending,
    error: ask.error,
    accept: (pick: SlotPick) =>
      createBlock.mutate({
        tempId: tempId(),
        body: { task_id: pick.task_id, step_id: pick.step_id, start: pick.start, end: pick.end },
      }),
  };
}
