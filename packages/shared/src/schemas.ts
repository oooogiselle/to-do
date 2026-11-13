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

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const TaskStatus = z.enum(["open", "done", "archived"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Repeat = z.enum(["none", "daily", "weekdays", "custom"]);
export type Repeat = z.infer<typeof Repeat>;

/** A local calendar date, "YYYY-MM-DD". */
const PlainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Day of the week: 0 = Sunday ... 6 = Saturday. */
const Weekday = z.number().int().min(0).max(6);

/** "someday" lists hold ideas and optional things to do when there's free time. */
export const ListKind = z.enum(["normal", "someday"]);
export type ListKind = z.infer<typeof ListKind>;

/** Someday items: a long-term goal, something to learn, or someone to keep in touch with. */
export const IdeaKind = z.enum(["goal", "learn", "people"]);
export type IdeaKind = z.infer<typeof IdeaKind>;

/** A loose timeframe for a someday item, instead of a due date. */
export const Horizon = z.enum(["month", "year", "someday"]);
export type Horizon = z.infer<typeof Horizon>;

/** An http(s) link, e.g. the article or video a someday item came from. */
const LinkUrl = z
  .string()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://");

/** What kind of thing a researched resource is, for its icon. */
export const ResourceKind = z.enum(["article", "video", "course", "book", "tool", "community", "other"]);
export type ResourceKind = z.infer<typeof ResourceKind>;

/** A web resource the AI found for a someday item. */
export const ResearchResource = z.object({
  title: z.string().min(1).max(200),
  url: LinkUrl,
  kind: ResourceKind,
  /** Why it's worth a look, in a sentence. */
  note: z.string().max(200),
  /** Rough minutes to get through it, when that's meaningful (a video, a course). */
  minutes: z.number().int().positive().nullable().optional(),
});
export type ResearchResource = z.infer<typeof ResearchResource>;

/**
 * Web research for a someday item (tasks.research): resources plus an effort estimate.
 * The server writes it; "pending" while the search runs in the background.
 */
export const TaskResearch = z.object({
  status: z.enum(["pending", "done", "error"]),
  error: z.string().nullable().optional(),
  resources: z.array(ResearchResource).max(10),
  /** Total effort for the whole goal or topic, in minutes. */
  total_min: z.number().int().positive().nullable(),
  /** How that effort spreads out, e.g. "over about 3 months". */
  span: z.string().max(80).nullable(),
  /** A typical sitting, in minutes; also fills an empty estimate_min. */
  session_min: z.number().int().positive().nullable(),
  /** One sentence on how the estimate was reached. */
  basis: z.string().max(300).nullable(),
  requested_at: z.string(),
  finished_at: z.string().nullable().optional(),
});
export type TaskResearch = z.infer<typeof TaskResearch>;

/** Which assistant a someday item gets: its idea_kind, or "idea" when it has none. */
export const AssistantType = z.enum(["goal", "learn", "idea"]);
export type AssistantType = z.infer<typeof AssistantType>;

const AssistantNote = z.string().max(1000);

/** What the user tells the Someday assistant (settings.someday_assistant). */
export const AssistantNotes = z.object({
  /** About the user; applies to every type. */
  about: AssistantNote.optional(),
  goal: AssistantNote.optional(),
  learn: AssistantNote.optional(),
  idea: AssistantNote.optional(),
});
export type AssistantNotes = z.infer<typeof AssistantNotes>;

/** A proposed time block for a task (or one of its steps), inside a free slot. */
export const AssistantPick = z.object({
  task_id: z.string(),
  step_id: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  reason: z.string(),
});

/**
 * One card in an Ask tt. reply. The server checks every id and time before saving, and nothing
 * changes until the user acts on a card.
 */
export const AssistantBlock = z.discriminatedUnion("kind", [
  /** Copy; **phrases** render in medium-weight ink. */
  z.object({ kind: z.literal("text"), text: z.string() }),
  /** Blocks to put on the calendar, for one local date. */
  z.object({ kind: z.literal("schedule"), date: PlainDate, picks: z.array(AssistantPick) }),
  /** A short list of real tasks, with quick actions. */
  z.object({ kind: z.literal("tasks"), label: z.string(), task_ids: z.array(z.string()) }),
  /** A to-do the assistant parsed from a sentence. */
  z.object({
    kind: z.literal("draft"),
    draft: z.object({
      title: z.string(),
      list_id: z.string().nullable(),
      due_at: z.string().nullable(),
      estimate_min: z.number().int().positive().nullable(),
      priority: Priority,
      repeat: Repeat,
    }),
  }),
  /** Steps to add to a task. */
  z.object({
    kind: z.literal("steps"),
    task_id: z.string(),
    steps: z.array(z.object({ title: z.string(), estimate_min: z.number().int().positive().nullable() })),
  }),
  /** Free time on a local date. */
  z.object({
    kind: z.literal("slots"),
    date: PlainDate,
    slots: z.array(z.object({ start: z.string(), end: z.string() })),
  }),
  /** Sources or resources, e.g. for an explanation. */
  z.object({ kind: z.literal("links"), label: z.string(), resources: z.array(ResearchResource) }),
  /** A shaped Someday idea: type, timeframe, first steps and places to start. */
  z.object({
    kind: z.literal("idea"),
    plan: z.object({
      /** Set when the plan is for an item already in Someday. */
      task_id: z.string().nullable(),
      title: z.string(),
      link_url: z.string().nullable(),
      idea_kind: IdeaKind.nullable(),
      horizon: Horizon,
      estimate_min: z.number().int().positive().nullable(),
      steps: z.array(z.string()),
      resources: z.array(ResearchResource),
    }),
  }),
]);
export type AssistantBlock = z.infer<typeof AssistantBlock>;

/** One message in the Ask tt. conversation. Replies are "pending" while they run. */
export const AssistantMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  blocks: z.array(AssistantBlock),
  follow_ups: z.array(z.string()),
  focus_task_id: z.string().nullable(),
  /** Card actions already taken, keyed by "<block index>:<part>". */
  resolved: z.record(z.string(), z.string()),
  status: z.enum(["pending", "done", "error"]),
  error: z.string().nullable(),
  requested_at: z.string().nullable(),
  created_at: z.string(),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

/** A new message (optionally about one task), or a retry of the last reply when it failed. */
export const AssistantSend = z.union([
  z.object({
    text: z.string().trim().min(1).max(2000),
    focus_task_id: z.string().uuid().nullable().optional(),
  }),
  z.object({ retry: z.literal(true) }),
]);

/** Records card actions on a reply ("<block>:<part>" -> e.g. the new row's id). */
export const AssistantResolve = z.object({
  entries: z
    .record(z.string().min(1).max(40), z.string().max(200))
    .refine((e) => Object.keys(e).length >= 1 && Object.keys(e).length <= 20, "1 to 20 entries"),
});

export const List = z.object({
  ...syncFields,
  name: z.string().min(1),
  color: z.string(),
  sort_order: z.number().int(),
  kind: ListKind,
});
export type List = z.infer<typeof List>;

export const Task = z.object({
  ...syncFields,
  list_id: z.string().uuid().nullable(),
  /** The task's own color; null = use its list's. */
  color: z.string().nullable(),
  title: z.string().min(1),
  notes: z.string(),
  due_at: z.string().nullable(),
  priority: Priority,
  estimate_min: z.number().int().nullable(),
  status: TaskStatus,
  /** Repeating tasks are checked off per day (done_dates) rather than once. */
  repeat: Repeat,
  /** Days of the week for a custom repeat. */
  repeat_days: z.array(Weekday),
  /** Local dates a repeating task was done on. */
  done_dates: z.array(PlainDate),
  /** Set when the task came from an AI import; source_quote is the text it came from. */
  import_id: z.string().uuid().nullable(),
  source_quote: z.string().nullable(),
  /** Someday fields: where the idea came from, goal vs. learn, and a rough timeframe. */
  link_url: z.string().nullable(),
  idea_kind: IdeaKind.nullable(),
  horizon: Horizon.nullable(),
  /** Local date to start working on it; My day surfaces the task from then on. */
  start_date: PlainDate.nullable(),
  /** Someday research: web resources and an effort estimate. */
  research: TaskResearch.nullable(),
  /** Extra instructions for this item's Someday assistant. */
  assistant_note: z.string().nullable(),
});
export type Task = z.infer<typeof Task>;

/** A task planned for a day on the My day page; position orders the day's list. */
export const DayPlanItem = z.object({
  ...syncFields,
  task_id: z.string().uuid(),
  /** Set when one step is planned rather than the whole task. */
  step_id: z.string().uuid().nullable(),
  plan_date: PlainDate,
  position: z.number(),
});
export type DayPlanItem = z.infer<typeof DayPlanItem>;

export const Step = z.object({
  ...syncFields,
  task_id: z.string().uuid(),
  title: z.string().min(1),
  estimate_min: z.number().int().nullable(),
  order: z.number().int(),
  done: z.boolean(),
  /** The step's own deadline; null means it just follows the task's. */
  due_at: z.string().nullable(),
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
  /** The event's own gcal color, else its calendar's; null if Google gave neither. */
  color: z.string().nullable(),
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
  z
    .object({ start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/) })
    .nullable(),
);
export type WorkingHours = z.infer<typeof WorkingHours>;

export const Settings = z.object({
  working_hours: WorkingHours,
  default_block_min: z.number().int().positive(),
  timezone: z.string(),
  someday_assistant: AssistantNotes,
  updated_at: z.string(),
});
export type Settings = z.infer<typeof Settings>;

// ---- Request bodies ----

export const ListCreate = List.pick({ name: true, color: true }).extend({
  sort_order: z.number().int().optional(),
  kind: ListKind.optional(),
});
export const ListPatch = ListCreate.partial();

export const TaskCreate = z.object({
  list_id: z.string().uuid().nullable().optional(),
  color: HexColor.nullable().optional(),
  title: z.string().min(1),
  notes: z.string().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  priority: Priority.optional(),
  estimate_min: z.number().int().positive().nullable().optional(),
  repeat: Repeat.optional(),
  repeat_days: z.array(Weekday).optional(),
  link_url: LinkUrl.nullable().optional(),
  idea_kind: IdeaKind.nullable().optional(),
  horizon: Horizon.nullable().optional(),
  start_date: PlainDate.nullable().optional(),
  assistant_note: AssistantNote.nullable().optional(),
});
export const TaskPatch = TaskCreate.partial().extend({
  status: TaskStatus.optional(),
  done_dates: z.array(PlainDate).optional(),
  /** Only so the user can remove resources; research itself runs through /research. */
  research: TaskResearch.nullable().optional(),
});

export const StepCreate = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1),
  estimate_min: z.number().int().positive().nullable().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  order: z.number().int().optional(),
});
export const StepPatch = StepCreate.omit({ task_id: true })
  .partial()
  .extend({ done: z.boolean().optional() });

export const DayPlanItemCreate = z.object({
  task_id: z.string().uuid(),
  step_id: z.string().uuid().nullable().optional(),
  plan_date: PlainDate,
  position: z.number().optional(),
});
export const DayPlanItemPatch = DayPlanItemCreate.omit({ task_id: true, step_id: true }).partial();

export const SettingsPatch = Settings.omit({ updated_at: true }).partial();
export const CalendarSelectionPatch = z.object({ selected: z.boolean() });

// ---- Responses ----

export const SyncResponse = z.object({
  cursor: z.string(),
  lists: z.array(List),
  tasks: z.array(Task),
  steps: z.array(Step),
  time_blocks: z.array(TimeBlock),
  day_plan_items: z.array(DayPlanItem),
  settings: Settings.nullable(),
});
export type SyncResponse = z.infer<typeof SyncResponse>;

export const EventsResponse = z.object({ events: z.array(CalendarEvent) });
export type EventsResponse = z.infer<typeof EventsResponse>;

// ---- Scheduling & AI ----

const MAX_BLOCK_MIN = 12 * 60;

export const TimeBlockCreate = z
  .object({
    task_id: z.string().uuid(),
    step_id: z.string().uuid().nullable().optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .refine((b) => Date.parse(b.end) > Date.parse(b.start), "end must be after start")
  .refine(
    (b) => Date.parse(b.end) - Date.parse(b.start) <= MAX_BLOCK_MIN * 60_000,
    "Blocks can be at most 12 hours",
  );

export const TimeBlockPatch = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .refine((b) => Date.parse(b.end) > Date.parse(b.start), "end must be after start");

/** Ends a block early (its to-do was checked off); it can only get shorter. */
export const TimeBlockTrim = z.object({ end: z.string().datetime({ offset: true }) });

export const BreakdownMode = z.enum(["default", "more_detailed"]);
export const BreakdownRequest = z.object({ mode: BreakdownMode.default("default") });

export const ProposedStep = z.object({
  title: z.string().min(1).max(200),
  estimate_min: z.number().int().min(5).max(480),
});
export type ProposedStep = z.infer<typeof ProposedStep>;
export const BreakdownResponse = z.object({ steps: z.array(ProposedStep) });
export type BreakdownResponse = z.infer<typeof BreakdownResponse>;

export const Energy = z.enum(["low", "ok", "high"]);
export type Energy = z.infer<typeof Energy>;

/** What the user feels like doing in a free gap. Leaving it out means "any". */
export const SuggestFocus = z.enum(["any", "assignments", "build", "learn", "people"]);
export type SuggestFocus = z.infer<typeof SuggestFocus>;

/** Asks the AI what to do in a free gap. Nothing is saved. */
export const SuggestRequest = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    energy: Energy.optional(),
    /** Tasks already shown (shuffle / regenerate), so they aren't repeated. */
    exclude_task_ids: z.array(z.string().uuid()).max(50).optional(),
    /** Free-text steer for a regenerate, e.g. "something lighter". */
    feedback: z.string().trim().max(300).optional(),
    /** What kind of work the user wants right now. Pressing deadlines still come first. */
    focus: SuggestFocus.optional(),
  })
  .refine((r) => Date.parse(r.end) > Date.parse(r.start), "end must be after start");
export type SuggestRequest = z.infer<typeof SuggestRequest>;

export const SlotPick = z.object({
  task_id: z.string().uuid(),
  step_id: z.string().uuid().nullable(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  reason: z.string(),
});
export type SlotPick = z.infer<typeof SlotPick>;
/** A new keep-in-touch item the AI proposes for a gap. Scheduling it creates the task. */
export const SlotIdea = z.object({
  title: z.string().min(1).max(80),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  reason: z.string(),
});
export type SlotIdea = z.infer<typeof SlotIdea>;
/** "I called Mom on Tuesday": a past date to log on a people item, once the user confirms. */
export const ContactLog = z.object({ task_id: z.string().uuid(), date: PlainDate });
export type ContactLog = z.infer<typeof ContactLog>;
export const SuggestResponse = z.object({
  picks: z.array(SlotPick),
  /** New people items (focus "people" only). */
  ideas: z.array(SlotIdea).default([]),
  /** Contact dates the user mentioned, to confirm. Nothing is saved until they do. */
  logs: z.array(ContactLog).default([]),
  note: z.string().nullable(),
});
export type SuggestResponse = z.infer<typeof SuggestResponse>;

/** Accepting a breakdown: replaces the task's unfinished steps; done steps are kept. */
export const StepsReplace = z.object({ steps: z.array(ProposedStep).min(1).max(20) });
