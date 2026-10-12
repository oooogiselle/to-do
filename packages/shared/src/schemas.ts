import { z } from "zod";

// Fields every synced record carries so clients can merge by updated_at cursor.
const syncFields = {
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
};

export const Priority = z.enum(["none", "low", "med", "high"]);
export type Priority = z.infer<typeof Priority>;

export const TaskStatus = z.enum(["open", "done", "archived"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const List = z.object({
  ...syncFields,
  name: z.string().min(1),
  color: z.string(),
  sort_order: z.number().int(),
});
export type List = z.infer<typeof List>;

export const Task = z.object({
  ...syncFields,
  list_id: z.string().uuid().nullable(),
  title: z.string().min(1),
  notes: z.string(),
  due_at: z.string().nullable(),
  priority: Priority,
  estimate_min: z.number().int().nullable(),
  status: TaskStatus,
});
export type Task = z.infer<typeof Task>;

export const Step = z.object({
  ...syncFields,
  task_id: z.string().uuid(),
  title: z.string().min(1),
  estimate_min: z.number().int().nullable(),
  order: z.number().int(),
  done: z.boolean(),
});
export type Step = z.infer<typeof Step>;

export const TimeBlock = z.object({
  ...syncFields,
  task_id: z.string().uuid(),
  step_id: z.string().uuid().nullable(),
  gcal_event_id: z.string(),
  start: z.string(),
  end: z.string(),
});
export type TimeBlock = z.infer<typeof TimeBlock>;

export const CalendarEvent = z.object({
  calendar_id: z.string(),
  gcal_event_id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  all_day: z.boolean(),
  busy: z.boolean(),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export const Calendar = z.object({
  id: z.string(),
  summary: z.string(),
  color: z.string().nullable(),
  selected: z.boolean(),
  is_tasks_calendar: z.boolean(),
});
export type Calendar = z.infer<typeof Calendar>;

/** Working hours per weekday (0 = Sunday), as "HH:mm" local times. null = day off. */
export const WorkingHours = z.record(
  z.enum(["0", "1", "2", "3", "4", "5", "6"]),
  z.object({ start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/) }).nullable(),
);
export type WorkingHours = z.infer<typeof WorkingHours>;

export const Settings = z.object({
  working_hours: WorkingHours,
  default_block_min: z.number().int().positive(),
  timezone: z.string(),
  updated_at: z.string(),
});
export type Settings = z.infer<typeof Settings>;

// ---- Request bodies ----

export const ListCreate = List.pick({ name: true, color: true }).extend({
  sort_order: z.number().int().optional(),
});
export const ListPatch = ListCreate.partial();

export const TaskCreate = z.object({
  list_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  notes: z.string().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  priority: Priority.optional(),
  estimate_min: z.number().int().positive().nullable().optional(),
});
export const TaskPatch = TaskCreate.partial().extend({ status: TaskStatus.optional() });

export const StepCreate = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1),
  estimate_min: z.number().int().positive().nullable().optional(),
  order: z.number().int().optional(),
});
export const StepPatch = StepCreate.omit({ task_id: true })
  .partial()
  .extend({ done: z.boolean().optional() });

export const SettingsPatch = Settings.omit({ updated_at: true }).partial();
export const CalendarSelectionPatch = z.object({ selected: z.boolean() });

// ---- Responses ----

export const SyncResponse = z.object({
  cursor: z.string(),
  lists: z.array(List),
  tasks: z.array(Task),
  steps: z.array(Step),
  time_blocks: z.array(TimeBlock),
  settings: Settings.nullable(),
});
export type SyncResponse = z.infer<typeof SyncResponse>;

export const EventsResponse = z.object({ events: z.array(CalendarEvent) });
export type EventsResponse = z.infer<typeof EventsResponse>;
