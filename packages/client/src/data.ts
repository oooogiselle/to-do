"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { HUES, toggleDoneDate, type DayPlanItem, type List, type Settings, type Step, type SyncResponse, type Task, type TimeBlock } from "@tt/shared";
import { useApi, type ApiClient } from "./api-context";
import { usePendingDeletes } from "./pending-deletes";

/** Colors lists and tasks can take. */
export const PALETTE: string[] = [
  HUES.coral,
  HUES.sun,
  HUES.mint,
  HUES.sky,
  HUES.grape,
  HUES.pink,
  HUES.slate,
];

/** What a task shows in when neither it nor its list has a color. */
export const NO_COLOR: string = HUES.slate;

export const keys = {
  sync: ["sync"] as const,
  settings: ["settings"] as const,
  calendars: ["calendars"] as const,
  events: (from: number, to: number) => ["events", from, to] as const,
};

/** Everything the app owns (lists, tasks, steps, blocks, settings) in one cached snapshot. */
export function useSync() {
  const api = useApi();
  return useQuery({ queryKey: keys.sync, queryFn: () => api.sync() });
}

export function useEvents(from: number, to: number) {
  const api = useApi();
  return useQuery({
    queryKey: keys.events(from, to),
    queryFn: () => api.events(new Date(from), new Date(to)),
    placeholderData: (prev) => prev,
  });
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: keys.settings, queryFn: () => api.settings() });
}

export function useCalendars() {
  const api = useApi();
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
  const pendingDeletes = usePendingDeletes();
  return useMemo(() => {
    const live = <T extends { deleted_at: string | null }>(rows: T[] = []) =>
      rows.filter((r) => !r.deleted_at);
    // Tasks deleted in the UI but not yet sent to the server stay hidden, with their steps and blocks.
    const kept = <T extends { task_id: string }>(rows: T[]) =>
      pendingDeletes.size ? rows.filter((r) => !pendingDeletes.has(r.task_id)) : rows;
    const lists = live(data?.lists).sort((a, b) => a.sort_order - b.sort_order);
    const tasks = live(data?.tasks).filter((t) => !pendingDeletes.has(t.id));
    const steps = kept(live(data?.steps)).sort((a, b) => a.order - b.order);
    const blocks = kept(live(data?.time_blocks));
    const taskIds = new Set(tasks.map((t) => t.id));
    const dayPlanItems = live(data?.day_plan_items).filter((i) => taskIds.has(i.task_id));
    const planByDate = new Map<string, DayPlanItem[]>();
    for (const i of [...dayPlanItems].sort((a, b) => a.position - b.position))
      planByDate.set(i.plan_date, [...(planByDate.get(i.plan_date) ?? []), i]);
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
      /** My day: planned tasks per local date, in order. */
      planByDate,
      settings: data?.settings ?? FALLBACK_SETTINGS,
    };
  }, [data, isLoading, error, pendingDeletes]);
}

/** The color a task shows in: its own, else its list's, else gray. */
export function taskColor(task: Task | undefined, listById: Map<string, List>) {
  if (task?.color) return task.color;
  return (task?.list_id && listById.get(task.list_id)?.color) || NO_COLOR;
}

// ---------- Optimistic mutations on the sync snapshot ----------

type Collection = "lists" | "tasks" | "steps" | "day_plan_items";
type RowOf<C extends Collection> = C extends "lists"
  ? List
  : C extends "tasks"
    ? Task
    : C extends "steps"
      ? Step
      : DayPlanItem;

function patchSnapshot(
  qc: QueryClient,
  fn: (s: SyncResponse) => SyncResponse,
): SyncResponse | undefined {
  const prev = qc.getQueryData<SyncResponse>(keys.sync);
  if (prev) qc.setQueryData(keys.sync, fn(prev));
  return prev;
}

/**
 * Applies an optimistic change right away, in the same render as the gesture that caused it
 * (awaiting first leaves a frame where the old state shows). Then drops any in-flight refetch,
 * which carries pre-change data; a cancel reverts to the state we just set.
 */
function optimistic(qc: QueryClient, fn: (s: SyncResponse) => SyncResponse) {
  const prev = patchSnapshot(qc, fn);
  void qc.cancelQueries({ queryKey: keys.sync });
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
    onMutate: (vars: V) => ({ prev: optimistic(qc, (s) => opts.apply(s, vars)) }),
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
    id: tempId(),
    created_at: t,
    updated_at: t,
    deleted_at: null,
    ...fields,
  };
}

export function useCreateTask() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<ApiClient["createTask"]>[0] }) =>
      api.createTask(v.body),
    apply: (s, v) =>
      upsertRow(s, "tasks", {
        ...tempRow({
          list_id: v.body.list_id ?? null,
          color: v.body.color ?? null,
          title: v.body.title,
          notes: v.body.notes ?? "",
          due_at: v.body.due_at ?? null,
          priority: v.body.priority ?? "none",
          estimate_min: v.body.estimate_min ?? null,
          status: "open" as const,
          repeat: v.body.repeat ?? "none",
          repeat_days: v.body.repeat_days ?? [],
          done_dates: [],
          import_id: null,
          source_quote: null,
        }),
        id: v.tempId,
      }),
    settle: (s, task, v) => ({ ...s, tasks: s.tasks.map((t) => (t.id === v.tempId ? task : t)) }),
  });
}

export function useUpdateTask() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<ApiClient["updateTask"]>[1] }) =>
      api.updateTask(v.id, v.patch),
    apply: (s, v) => updateRow(s, "tasks", v.id, v.patch as Partial<Task>),
    settle: (s, task) => upsertRow(s, "tasks", task),
  });
}

export function useDeleteTask() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (id: string) => api.deleteTask(id),
    apply: (s, id) => updateRow(s, "tasks", id, { deleted_at: now() }),
  });
}

export function useCreateStep() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<ApiClient["createStep"]>[0] }) =>
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
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<ApiClient["updateStep"]>[1] }) =>
      api.updateStep(v.id, v.patch),
    apply: (s, v) => updateRow(s, "steps", v.id, v.patch as Partial<Step>),
    settle: (s, step) => upsertRow(s, "steps", step),
  });
}

export function useDeleteStep() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (id: string) => api.deleteStep(id),
    apply: (s, id) => updateRow(s, "steps", id, { deleted_at: now() }),
  });
}

export function useCreateList() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { tempId: string; body: Parameters<ApiClient["createList"]>[0] }) =>
      api.createList(v.body),
    apply: (s, v) =>
      upsertRow(s, "lists", {
        ...tempRow({ name: v.body.name, color: v.body.color, sort_order: v.body.sort_order ?? 0 }),
        id: v.tempId,
      }),
    settle: (s, list, v) => ({ ...s, lists: s.lists.map((l) => (l.id === v.tempId ? list : l)) }),
  });
}

export function useUpdateList() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<ApiClient["updateList"]>[1] }) =>
      api.updateList(v.id, v.patch),
    apply: (s, v) => updateRow(s, "lists", v.id, v.patch),
    settle: (s, list) => upsertRow(s, "lists", list),
  });
}

/** Its tasks stay; with the list gone they show under "No list". */
export function useDeleteList() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (id: string) => api.deleteList(id),
    apply: (s, id) => updateRow(s, "lists", id, { deleted_at: now() }),
  });
}

export function useUpdateSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (settings) => {
      patchSnapshot(qc, (s) => ({ ...s, settings }));
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

/** Deletes the account. The caller signs out and leaves the app afterwards. */
export function useDeleteAccount() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => qc.clear(),
  });
}

export const isTemp = (id: string) => id.startsWith("temp-");

/**
 * A v4 UUID. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), so
 * opening the dev server by its network address needs the getRandomValues fallback.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Id for an optimistic row until the server returns the real one. */
export const tempId = () => `temp-${uuid()}`;

// ---------- Time blocks (scheduling) ----------

function updateBlocks(s: SyncResponse, fn: (blocks: TimeBlock[]) => TimeBlock[]): SyncResponse {
  return { ...s, time_blocks: fn(s.time_blocks) };
}

export function useCreateBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tempId: string; body: Parameters<ApiClient["createTimeBlock"]>[0] }) =>
      api.createTimeBlock(v.body),
    onMutate: (v) => {
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
      return { prev: optimistic(qc, (s) => updateBlocks(s, (b) => [...b, temp])) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.sync, ctx.prev),
    onSuccess: (block, v) =>
      patchSnapshot(qc, (s) =>
        updateBlocks(s, (b) => b.map((x) => (x.id === v.tempId ? block : x))),
      ),
  });
}

const MOVE_BLOCK = ["move-block"] as const;

/** While a move is saving, refetches return the old times; its own settle refetches anyway. */
export const blockMovesPending = (qc: QueryClient) =>
  qc.isMutating({ mutationKey: MOVE_BLOCK }) > 0;

/**
 * Moves and resizes run one at a time, so a quick move-then-resize can't land out of order on
 * the server. Once the last one settles, the snapshot is refetched: a refetch that started
 * while a move was in flight may have brought back the old times.
 */
export function useMoveBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: MOVE_BLOCK,
    scope: { id: "move-block" },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: MOVE_BLOCK }) <= 1)
        qc.invalidateQueries({ queryKey: keys.sync });
    },
    mutationFn: (v: { id: string; start: string; end: string }) =>
      api.moveTimeBlock(v.id, { start: v.start, end: v.end }),
    onMutate: (v) => {
      return {
        prev: optimistic(qc, (s) =>
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
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTimeBlock(id),
    onMutate: (id) => {
      return {
        prev: optimistic(qc, (s) =>
          updateBlocks(s, (b) => b.map((x) => (x.id === id ? { ...x, deleted_at: now() } : x))),
        ),
      };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.sync, ctx.prev),
  });
}

export function useRemoveUpcomingBlocks() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeUpcomingBlocks,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sync }),
  });
}

export function useReplaceSteps() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; steps: Parameters<ApiClient["replaceSteps"]>[1] }) =>
      api.replaceSteps(v.taskId, v.steps),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sync }),
  });
}

// ---------- My day (daily plan) ----------

/** The position that puts an item after everything already on a day. */
export const endPosition = (items: DayPlanItem[] = []) =>
  items.reduce((max, i) => Math.max(max, i.position), 0) + 1;

/** The position between two neighbors; pass undefined for the start or end of the list. */
export const positionBetween = (before?: number, after?: number) =>
  before === undefined ? (after === undefined ? 1 : after - 1) : after === undefined ? before + 1 : (before + after) / 2;

export function useAddToPlan() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: {
      tempId: string;
      body: Parameters<ApiClient["createDayPlanItem"]>[0];
    }) => api.createDayPlanItem(v.body),
    apply: (s, v) =>
      upsertRow(s, "day_plan_items", {
        ...tempRow({
          task_id: v.body.task_id,
          plan_date: v.body.plan_date,
          position: v.body.position ?? 0,
        }),
        id: v.tempId,
      }),
    settle: (s, item, v) => ({
      ...s,
      day_plan_items: s.day_plan_items.map((i) => (i.id === v.tempId ? item : i)),
    }),
  });
}

/** Reorders within a day or moves an item to another day. */
export function useMovePlanItem() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (v: { id: string; patch: Parameters<ApiClient["updateDayPlanItem"]>[1] }) =>
      api.updateDayPlanItem(v.id, v.patch),
    apply: (s, v) => updateRow(s, "day_plan_items", v.id, v.patch as Partial<DayPlanItem>),
    settle: (s, item) => upsertRow(s, "day_plan_items", item),
  });
}

export function useRemoveFromPlan() {
  const api = useApi();
  return useOptimistic({
    mutationFn: (id: string) => api.deleteDayPlanItem(id),
    apply: (s, id) => updateRow(s, "day_plan_items", id, { deleted_at: now() }),
  });
}

/** Checks a repeating task off (or back on) for one local date. */
export function useToggleRoutine() {
  const update = useUpdateTask();
  return (task: Pick<Task, "id" | "done_dates">, date: string, done: boolean) =>
    update.mutate({ id: task.id, patch: { done_dates: toggleDoneDate(task.done_dates, date, done) } });
}
