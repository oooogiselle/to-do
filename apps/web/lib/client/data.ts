"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { List, Settings, Step, SyncResponse, Task, TimeBlock } from "@tt/shared";
import { api } from "./api";

export const keys = {
  sync: ["sync"] as const,
  settings: ["settings"] as const,
  calendars: ["calendars"] as const,
  events: (from: number, to: number) => ["events", from, to] as const,
};

/** Everything the app owns (lists, tasks, steps, blocks, settings) in one cached snapshot. */
export function useSync() {
  return useQuery({ queryKey: keys.sync, queryFn: () => api.sync() });
}

export function useEvents(from: number, to: number) {
  return useQuery({
    queryKey: keys.events(from, to),
    queryFn: () => api.events(new Date(from), new Date(to)),
    placeholderData: (prev) => prev,
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.settings() });
}

export function useCalendars() {
  return useQuery({ queryKey: keys.calendars, queryFn: () => api.calendars() });
}

const FALLBACK_SETTINGS: Settings = {
  working_hours: {},
  default_block_min: 60,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  updated_at: "",
};

/** Indexed, non-deleted views over the sync snapshot. */
export function useModel() {
  const { data, isLoading, error } = useSync();
  return useMemo(() => {
    const live = <T extends { deleted_at: string | null }>(rows: T[] = []) =>
      rows.filter((r) => !r.deleted_at);
    const lists = live(data?.lists).sort((a, b) => a.sort_order - b.sort_order);
    const tasks = live(data?.tasks);
    const steps = live(data?.steps).sort((a, b) => a.order - b.order);
    const blocks = live(data?.time_blocks);
    const stepsByTask = new Map<string, Step[]>();
    for (const s of steps) stepsByTask.set(s.task_id, [...(stepsByTask.get(s.task_id) ?? []), s]);
    return {
      isLoading,
      error,
      lists,
      listById: new Map(lists.map((l) => [l.id, l])),
      tasks,
      taskById: new Map(tasks.map((t) => [t.id, t])),
      stepsByTask,
      blocks,
      settings: data?.settings ?? FALLBACK_SETTINGS,
    };
  }, [data, isLoading, error]);
}

// ---------- Optimistic mutations on the sync snapshot ----------

type Collection = "lists" | "tasks" | "steps";
type RowOf<C extends Collection> = C extends "lists" ? List : C extends "tasks" ? Task : Step;

function patchSnapshot(
  qc: QueryClient,
  fn: (s: SyncResponse) => SyncResponse,
): SyncResponse | undefined {
  const prev = qc.getQueryData<SyncResponse>(keys.sync);
  if (prev) qc.setQueryData(keys.sync, fn(prev));
  return prev;
}

function useOptimistic<V, R>(opts: {
  mutationFn: (vars: V) => Promise<R>;
  apply: (s: SyncResponse, vars: V) => SyncResponse;
  /** Replace the optimistic row with the server's copy. */
  settle?: (s: SyncResponse, result: R, vars: V) => SyncResponse;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: keys.sync });
      return { prev: patchSnapshot(qc, (s) => opts.apply(s, vars)) };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.sync, ctx.prev);
    },
    onSuccess: (result, vars) => {
      if (opts.settle) patchSnapshot(qc, (s) => opts.settle!(s, result, vars));
    },
  });
}

const now = () => new Date().toISOString();

function upsertRow<C extends Collection>(s: SyncResponse, c: C, row: RowOf<C>): SyncResponse {
  const rows = s[c] as RowOf<C>[];
  const exists = rows.some((r) => r.id === row.id);
  return { ...s, [c]: exists ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row] };
}

function updateRow<C extends Collection>(
  s: SyncResponse,
  c: C,
  id: string,
  patch: Partial<RowOf<C>>,
): SyncResponse {
  const rows = s[c] as RowOf<C>[];
  return { ...s, [c]: rows.map((r) => (r.id === id ? { ...r, ...patch, updated_at: now() } : r)) };
}

function tempRow<T>(fields: T) {
  const t = now();
  return {
    id: `temp-${crypto.randomUUID()}`,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    ...fields,
  };
}

export function useCreateTask() {
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<typeof api.createTask>[0] }) =>
      api.createTask(v.body),
    apply: (s, v) =>
      upsertRow(s, "tasks", {
        ...tempRow({
          list_id: v.body.list_id ?? null,
          title: v.body.title,
          notes: v.body.notes ?? "",
          due_at: v.body.due_at ?? null,
          priority: v.body.priority ?? "none",
          estimate_min: v.body.estimate_min ?? null,
          status: "open" as const,
        }),
        id: v.tempId,
      }),
    settle: (s, task, v) => ({ ...s, tasks: s.tasks.map((t) => (t.id === v.tempId ? task : t)) }),
  });
}

export function useUpdateTask() {
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateTask>[1] }) =>
      api.updateTask(v.id, v.patch),
    apply: (s, v) => updateRow(s, "tasks", v.id, v.patch as Partial<Task>),
    settle: (s, task) => upsertRow(s, "tasks", task),
  });
}

export function useDeleteTask() {
  return useOptimistic({
    mutationFn: (id: string) => api.deleteTask(id),
    apply: (s, id) => updateRow(s, "tasks", id, { deleted_at: now() }),
  });
}

export function useCreateStep() {
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<typeof api.createStep>[0] }) =>
      api.createStep(v.body),
    apply: (s, v) =>
      upsertRow(s, "steps", {
        ...tempRow({
          task_id: v.body.task_id,
          title: v.body.title,
          estimate_min: v.body.estimate_min ?? null,
          order: v.body.order ?? 0,
          done: false,
        }),
        id: v.tempId,
      }),
    settle: (s, step, v) => ({ ...s, steps: s.steps.map((x) => (x.id === v.tempId ? step : x)) }),
  });
}

export function useUpdateStep() {
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateStep>[1] }) =>
      api.updateStep(v.id, v.patch),
    apply: (s, v) => updateRow(s, "steps", v.id, v.patch as Partial<Step>),
    settle: (s, step) => upsertRow(s, "steps", step),
  });
}

export function useDeleteStep() {
  return useOptimistic({
    mutationFn: (id: string) => api.deleteStep(id),
    apply: (s, id) => updateRow(s, "steps", id, { deleted_at: now() }),
  });
}

export function useCreateList() {
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<typeof api.createList>[0] }) =>
      api.createList(v.body),
    apply: (s, v) =>
      upsertRow(s, "lists", {
        ...tempRow({ name: v.body.name, color: v.body.color, sort_order: v.body.sort_order ?? 0 }),
        id: v.tempId,
      }),
    settle: (s, list, v) => ({ ...s, lists: s.lists.map((l) => (l.id === v.tempId ? list : l)) }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (settings) => {
      patchSnapshot(qc, (s) => ({ ...s, settings }));
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export const isTemp = (id: string) => id.startsWith("temp-");

// ---------- Time blocks (scheduling) ----------

function updateBlocks(s: SyncResponse, fn: (blocks: TimeBlock[]) => TimeBlock[]): SyncResponse {
  return { ...s, time_blocks: fn(s.time_blocks) };
}

export function useCreateBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tempId: string; body: Parameters<typeof api.createTimeBlock>[0] }) =>
      api.createTimeBlock(v.body),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.sync });
      const t = now();
      const temp: TimeBlock = {
        id: v.tempId,
        created_at: t,
        updated_at: t,
        deleted_at: null,
        task_id: v.body.task_id,
        step_id: v.body.step_id ?? null,
        gcal_event_id: "",
        start: v.body.start,
        end: v.body.end,
      };
      return { prev: patchSnapshot(qc, (s) => updateBlocks(s, (b) => [...b, temp])) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.sync, ctx.prev),
    onSuccess: (block, v) =>
      patchSnapshot(qc, (s) =>
        updateBlocks(s, (b) => b.map((x) => (x.id === v.tempId ? block : x))),
      ),
  });
}

export function useMoveBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; start: string; end: string }) =>
      api.moveTimeBlock(v.id, { start: v.start, end: v.end }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.sync });
      return {
        prev: patchSnapshot(qc, (s) =>
          updateBlocks(s, (b) =>
            b.map((x) => (x.id === v.id ? { ...x, start: v.start, end: v.end } : x)),
          ),
        ),
      };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.sync, ctx.prev),
  });
}

export function useDeleteBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTimeBlock(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.sync });
      return {
        prev: patchSnapshot(qc, (s) =>
          updateBlocks(s, (b) => b.map((x) => (x.id === id ? { ...x, deleted_at: now() } : x))),
        ),
      };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.sync, ctx.prev),
  });
}

export function useRemoveUpcomingBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeUpcomingBlocks,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sync }),
  });
}

export function useReplaceSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; steps: Parameters<typeof api.replaceSteps>[1] }) =>
      api.replaceSteps(v.taskId, v.steps),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sync }),
  });
}
