"use client";

import { useMutation } from "@tanstack/react-query";
import type { ContactLog, SlotIdea, SlotPick, SuggestRequest } from "@tt/shared";
import { useApi } from "./api-context";
import { tempId, useCreateBlock, useModel } from "./data";
import { useAddSomeday, useLogContact } from "./someday";

/**
 * AI picks for what to do in one free gap. `suggest` asks (nothing is saved); `accept` schedules a
 * pick as a time block through the usual optimistic path. `acceptIdea` turns a new people idea
 * into a Someday item and schedules it; `logContact` saves a day the user connected with someone.
 */
export function useSlotPicks() {
  const api = useApi();
  const { taskById } = useModel();
  const createBlock = useCreateBlock();
  const addSomeday = useAddSomeday();
  const logContact = useLogContact();
  const ask = useMutation({ mutationFn: (req: SuggestRequest) => api.suggest(req) });

  const schedule = (task_id: string, step_id: string | null, start: string, end: string) =>
    createBlock.mutate({ tempId: tempId(), body: { task_id, step_id, start, end } });

  return {
    suggest: ask.mutate,
    reset: ask.reset,
    picks: ask.data?.picks ?? null,
    // An older server leaves these out.
    ideas: ask.data?.ideas ?? [],
    logs: ask.data?.logs ?? [],
    note: ask.data?.note ?? null,
    isPending: ask.isPending,
    error: ask.error,
    accept: (pick: SlotPick) => schedule(pick.task_id, pick.step_id, pick.start, pick.end),
    /** Creates the people item (waiting for its real id), then books the block. */
    acceptIdea: (idea: SlotIdea) =>
      addSomeday(
        { title: idea.title, idea_kind: "people" },
        { onAdded: (task) => schedule(task.id, null, idea.start, idea.end) },
      ).catch(() => undefined), // only fails if the Someday list couldn't be created
    /** Logs a contact date: a confirmed AI log, or a day the user picked. */
    logContact: ({ task_id, date }: ContactLog) => {
      const task = taskById.get(task_id);
      if (task) logContact(task, date);
    },
  };
}
