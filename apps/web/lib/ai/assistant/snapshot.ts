import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssistantNotes,
  addDays,
  findFreeSlots,
  formatMinutes,
  linkLabel,
  localDate,
  localWeekday,
  zonedInstant,
  type AssistantType,
  type Database,
  type Interval,
  type TaskResearch,
  type WorkingHours,
} from "@tt/shared";
import { assistantTypeOf } from "@/lib/ai/someday/prompts";

type Db = SupabaseClient<Database>;

const MAX_TASKS = 80;
const MAX_STEPS = 6;
const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HORIZON: Record<string, string> = { month: "this month", year: "this year", someday: "someday" };

const clip = (text: string, max = 140) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

export type DaySlots = { date: string; slots: Interval[] };

/** The planner as the model sees it this turn, plus what's needed to check its answer. */
export type Snapshot = {
  /** The <planner> block for the latest user turn. */
  text: string;
  timezone: string;
  today: DaySlots;
  tomorrow: DaySlots;
  /** The next working day after tomorrow, for planning past a weekend. */
  later: DaySlots | null;
  /** Task code -> task id, step code -> step id, and each offered task's step ids. */
  taskByCode: Map<string, string>;
  stepByCode: Map<string, string>;
  known: Map<string, Set<string>>;
  /** Due dates (epoch ms) of offered tasks. */
  dueOf: Map<string, number>;
  /** Offered someday tasks, and their own links. */
  somedayIds: Set<string>;
  linkOf: Map<string, string>;
  /** Lists a draft can go in, by lowercase name. */
  listByName: Map<string, string>;
  defaultListId: string | null;
  /** Titles of every task seen, for describing past replies. */
  titleOf: Map<string, string>;
  /** The user's assistant notes, and the item in focus. */
  notes: AssistantNotes | null;
  focus: { type: AssistantType; note: string | null; research: TaskResearch | null } | null;
};

export async function buildSnapshot(
  db: Db,
  opts: { focusTaskId: string | null; lastMessageAt: string | null; nowMs?: number },
): Promise<Snapshot> {
  const nowMs = opts.nowMs ?? Date.now();
  const [settingsRes, listsRes, tasksRes, stepsRes, calsRes] = await Promise.all([
    db.from("settings").select("timezone, working_hours, default_block_min, someday_assistant").single(),
    db.from("lists").select("id, name, kind, sort_order").is("deleted_at", null).order("sort_order"),
    db
      .from("tasks")
      .select(
        "id, list_id, title, notes, due_at, priority, estimate_min, repeat, repeat_days, done_dates, idea_kind, horizon, link_url, start_date",
      )
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(1000),
    db
      .from("steps")
      .select("id, task_id, title, estimate_min, done, order")
      .is("deleted_at", null)
      .order("order"),
    db.from("calendars").select("id").eq("selected", true),
  ]);
  for (const r of [settingsRes, listsRes, tasksRes, stepsRes, calsRes]) {
    if (r.error) throw new Error(r.error.message);
  }
  const settings = settingsRes.data!;
  const tz = settings.timezone;
  const workingHours = settings.working_hours as WorkingHours;
  const lists = new Map(listsRes.data!.map((l) => [l.id, l]));

  const todayDate = localDate(new Date(nowMs), tz);
  const tomorrowDate = addDays(todayDate, 1);
  const dayStart = zonedInstant(todayDate, "00:00", tz).getTime();
  const tomorrowStart = zonedInstant(tomorrowDate, "00:00", tz).getTime();
  const dayAfter = addDays(todayDate, 2);
  // The next day after tomorrow with working hours, within a week.
  let laterDate: string | null = null;
  for (let i = 2; i <= 8 && !laterDate; i++) {
    const d = addDays(todayDate, i);
    const h = workingHours[String(localWeekday(zonedInstant(d, "12:00", tz), tz)) as keyof WorkingHours];
    if (h) laterDate = d;
  }
  const rangeEnd = zonedInstant(laterDate ? addDays(laterDate, 1) : dayAfter, "00:00", tz).getTime();
  const tomorrowEnd = zonedInstant(dayAfter, "00:00", tz).getTime();

  const calIds = calsRes.data!.map((c) => c.id);
  const [blocksRes, eventsRes, planRes] = await Promise.all([
    db
      .from("time_blocks")
      .select("task_id, step_id, start, end")
      .is("deleted_at", null)
      .gte("end", new Date(dayStart).toISOString()),
    calIds.length
      ? db
          .from("calendar_events")
          .select("title, start, end, all_day, busy")
          .in("calendar_id", calIds)
          .lt("start", new Date(rangeEnd).toISOString())
          .gt("end", new Date(dayStart).toISOString())
          .order("start")
      : Promise.resolve({ data: [], error: null }),
    db
      .from("day_plan_items")
      .select("task_id, step_id, position")
      .eq("plan_date", todayDate)
      .is("deleted_at", null)
      .order("position"),
  ]);
  for (const r of [blocksRes, eventsRes, planRes]) if (r.error) throw new Error(r.error.message);
  const blocks = blocksRes.data!;
  const events = eventsRes.data ?? [];
  const plan = planRes.data!;

  // Minutes already booked from now on, per task.
  const bookedAhead = new Map<string, number>();
  for (const b of blocks) {
    const s = Math.max(Date.parse(b.start), nowMs);
    const e = Date.parse(b.end);
    if (e > s) bookedAhead.set(b.task_id, (bookedAhead.get(b.task_id) ?? 0) + (e - s) / 60_000);
  }

  const stepsByTask = new Map<string, NonNullable<typeof stepsRes.data>>();
  for (const s of stepsRes.data!) {
    const arr = stepsByTask.get(s.task_id) ?? [];
    arr.push(s);
    stepsByTask.set(s.task_id, arr);
  }

  // The focus item may be done or outside the open list, so fetch it on its own.
  const focusRes = opts.focusTaskId
    ? await db
        .from("tasks")
        .select("id, title, status, idea_kind, research, assistant_note, list_id")
        .eq("id", opts.focusTaskId)
        .is("deleted_at", null)
        .maybeSingle()
    : null;
  const focusTask = focusRes?.data ?? null;

  // Planned today but no longer open (done), for "how am I doing".
  const openIds = new Set(tasksRes.data!.map((t) => t.id));
  const plannedClosedIds = plan.map((p) => p.task_id).filter((id) => !openIds.has(id));
  const plannedClosed = plannedClosedIds.length
    ? ((await db.from("tasks").select("id, title, status").in("id", plannedClosedIds)).data ?? [])
    : [];

  const planned = new Set(plan.map((p) => p.task_id));
  const PRIORITY = { high: 0, med: 1, low: 2, none: 3 } as const;
  const isSomeday = (listId: string | null) => lists.get(listId ?? "")?.kind === "someday";
  const candidates = [...tasksRes.data!]
    .sort((a, b) => {
      const ap = planned.has(a.id) || a.id === opts.focusTaskId;
      const bp = planned.has(b.id) || b.id === opts.focusTaskId;
      if (ap !== bp) return ap ? -1 : 1;
      const as = isSomeday(a.list_id);
      const bs = isSomeday(b.list_id);
      if (as !== bs) return as ? 1 : -1;
      const ad = a.due_at ? Date.parse(a.due_at) : Infinity;
      const bd = b.due_at ? Date.parse(b.due_at) : Infinity;
      return ad - bd || PRIORITY[a.priority] - PRIORITY[b.priority];
    })
    .slice(0, MAX_TASKS);

  const fmtWhen = (ms: number) =>
    new Date(ms).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

  const taskByCode = new Map<string, string>();
  const stepByCode = new Map<string, string>();
  const known = new Map<string, Set<string>>();
  const somedayIds = new Set<string>();
  const linkOf = new Map<string, string>();
  const dueOf = new Map<string, number>();
  const titleOf = new Map<string, string>();
  const codeOf = new Map<string, string>();
  const taskLines: string[] = [];
  const somedayLines: string[] = [];

  candidates.forEach((t, i) => {
    const code = `t${i + 1}`;
    taskByCode.set(code, t.id);
    codeOf.set(t.id, code);
    titleOf.set(t.id, t.title);
    if (t.link_url) linkOf.set(t.id, t.link_url);
    if (t.due_at) dueOf.set(t.id, Date.parse(t.due_at));
    const steps = stepsByTask.get(t.id) ?? [];
    const open = steps.filter((s) => !s.done);
    known.set(t.id, new Set(open.map((s) => s.id)));
    const list = lists.get(t.list_id ?? "");
    const someday = list?.kind === "someday";
    if (someday) somedayIds.add(t.id);
    const work = open.length
      ? open.reduce((n, s) => n + (s.estimate_min ?? 30), 0)
      : (t.estimate_min ?? settings.default_block_min);
    const left = Math.max(0, Math.round(work - (bookedAhead.get(t.id) ?? 0)));
    const repeating = t.repeat !== "none";
    const facts = [
      list && `list ${list.name}`,
      someday && (t.idea_kind === "goal" ? "Goal" : t.idea_kind === "learn" ? "Learn" : "Idea"),
      someday && t.horizon && `timeframe ${HORIZON[t.horizon] ?? t.horizon}`,
      t.link_url && `link ${linkLabel(t.link_url)}`,
      !someday && (t.due_at ? `due ${fmtWhen(Date.parse(t.due_at))}` : "no due date"),
      t.priority !== "none" && `priority ${t.priority}`,
      repeating && `repeats ${t.repeat}${t.done_dates.includes(todayDate) ? ", done today" : ""}`,
      !repeating && !someday && (left ? `${formatMinutes(left)} not booked` : "time booked"),
      planned.has(t.id) && "on My day",
      t.notes.trim() && `notes: ${clip(t.notes)}`,
    ].filter(Boolean);
    const line = `${code} "${t.title}" — ${facts.join("; ")}`;
    const stepLines = open.slice(0, MAX_STEPS).map((s, j) => {
      const sc = `${code}.s${j + 1}`;
      stepByCode.set(sc, s.id);
      return `  ${sc} "${s.title}"${s.estimate_min ? ` (${formatMinutes(s.estimate_min)})` : ""}`;
    });
    const done = steps.length - open.length;
    const progress = steps.length ? [`  steps done: ${done} of ${steps.length}`] : [];
    (someday ? somedayLines : taskLines).push(line, ...progress, ...stepLines);
  });

  // Free time and what's around it, today (from now) and tomorrow.
  const busy = [
    ...events.filter((e) => !e.all_day).map((e) => ({ start: e.start, end: e.end, busy: e.busy })),
    ...blocks.map((b) => ({ start: b.start, end: b.end })),
  ];
  const free = (from: number, to: number) => findFreeSlots(busy, { workingHours, timezone: tz, from, to, minMinutes: 30 });
  const today: DaySlots = { date: todayDate, slots: free(Math.max(nowMs, dayStart), tomorrowStart) };
  const tomorrow: DaySlots = { date: tomorrowDate, slots: free(tomorrowStart, tomorrowEnd) };
  const laterStart = laterDate ? zonedInstant(laterDate, "00:00", tz).getTime() : 0;
  const laterEnd = laterDate ? zonedInstant(addDays(laterDate, 1), "00:00", tz).getTime() : 0;
  const later: DaySlots | null = laterDate ? { date: laterDate, slots: free(laterStart, laterEnd) } : null;

  const agendaFor = (from: number, to: number) =>
    [
      ...events
        .filter((e) => e.busy && !e.all_day && Date.parse(e.start) < to && Date.parse(e.end) > from)
        .map((e) => ({ s: Date.parse(e.start), e: Date.parse(e.end), what: e.title || "Busy" })),
      ...blocks
        .filter((b) => Date.parse(b.start) < to && Date.parse(b.end) > from)
        .map((b) => ({
          s: Date.parse(b.start),
          e: Date.parse(b.end),
          what: `work on "${titleOf.get(b.task_id) ?? "a task"}"`,
        })),
    ]
      .sort((a, b) => a.s - b.s)
      .map((a) => `- ${hhmm(a.s)}-${hhmm(a.e)} ${a.what}`);
  const slotLines = (d: DaySlots) =>
    d.slots.length
      ? d.slots.map((s) => `- ${hhmm(s.start)}-${hhmm(s.end)} (${formatMinutes((s.end - s.start) / 60_000)})`)
      : ["- none"];
  const hoursFor = (date: string) => {
    const h = workingHours[String(localWeekday(zonedInstant(date, "12:00", tz), tz)) as keyof WorkingHours];
    return h ? `${h.start}-${h.end}` : "day off";
  };

  const closedTitle = new Map(plannedClosed.map((t) => [t.id, t]));
  const planLines = plan.map((p) => {
    const code = codeOf.get(p.task_id);
    if (code) return `- ${code}${p.step_id ? " (a step)" : ""}`;
    const t = closedTitle.get(p.task_id);
    return `- "${t?.title ?? "a task"}"${t?.status === "done" ? " [done]" : ""}`;
  });

  const weekday = (date: string) => WEEKDAYS[localWeekday(zonedInstant(date, "12:00", tz), tz)];
  const gap = opts.lastMessageAt
    ? Math.round(
        (Date.parse(`${todayDate}T00:00:00Z`) -
          Date.parse(`${localDate(new Date(opts.lastMessageAt), tz)}T00:00:00Z`)) /
          DAY,
      )
    : null;

  let focusLines: string[] = [];
  let focus: Snapshot["focus"] = null;
  if (focusTask) {
    const research = (focusTask.research as TaskResearch | null) ?? null;
    const type = assistantTypeOf(focusTask.idea_kind);
    focus = { type, note: focusTask.assistant_note, research };
    if (focusTask.id && !titleOf.has(focusTask.id)) titleOf.set(focusTask.id, focusTask.title);
    const code = codeOf.get(focusTask.id);
    focusLines = [
      `This message is about ${code ? `${code} ` : ""}"${focusTask.title}"${isSomeday(focusTask.list_id) ? ` (a Someday ${type === "idea" ? "Idea" : type === "goal" ? "Goal" : "Learn item"})` : ""}${focusTask.status !== "open" ? ` [${focusTask.status}]` : ""}.`,
      research?.resources.length
        ? `Its saved resources:\n${research.resources.map((r) => `- ${r.title}: ${r.url}`).join("\n")}`
        : "",
      research?.total_min ? `Its effort estimate: about ${formatMinutes(research.total_min)}${research.span ? ` ${research.span}` : ""}.` : "",
    ].filter(Boolean);
  }

  const notes = AssistantNotes.safeParse(settings.someday_assistant ?? {});
  const normalLists = listsRes.data!.filter((l) => l.kind !== "someday");

  const text = [
    "<planner>",
    `Now: ${fmtWhen(nowMs)} (${tz}).`,
    gap === null ? "Last message: none, this is the start of the chat." : `Last message: ${gap === 0 ? "earlier today" : gap === 1 ? "yesterday" : `${gap} days ago`}.`,
    `Lists: ${normalLists.map((l) => l.name).join(", ") || "none"}. Someday lists: ${listsRes.data!.filter((l) => l.kind === "someday").map((l) => l.name).join(", ") || "none"}.`,
    `Today (${weekday(todayDate)} ${todayDate}), working hours ${hoursFor(todayDate)}:\nAgenda:\n${agendaFor(dayStart, tomorrowStart).join("\n") || "- nothing"}\nFree time from now (30 min or more):\n${slotLines(today).join("\n")}`,
    `Tomorrow (${weekday(tomorrowDate)} ${tomorrowDate}), working hours ${hoursFor(tomorrowDate)}:\nAgenda:\n${agendaFor(tomorrowStart, tomorrowEnd).join("\n") || "- nothing"}\nFree time:\n${slotLines(tomorrow).join("\n")}`,
    later &&
      `Next working day after tomorrow ("later": ${weekday(later.date)} ${later.date}), working hours ${hoursFor(later.date)}:\nAgenda:\n${agendaFor(laterStart, laterEnd).join("\n") || "- nothing"}\nFree time:\n${slotLines(later).join("\n")}`,
    `My day (today's plan):\n${planLines.join("\n") || "- nothing planned"}`,
    `Open tasks:\n${taskLines.join("\n") || "- none"}`,
    `Someday:\n${somedayLines.join("\n") || "- none"}`,
    tasksRes.data!.length > MAX_TASKS && `(${tasksRes.data!.length - MAX_TASKS} more open tasks not shown.)`,
    ...focusLines,
    "</planner>",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    timezone: tz,
    today,
    tomorrow,
    later,
    taskByCode,
    stepByCode,
    known,
    dueOf,
    somedayIds,
    linkOf,
    listByName: new Map(normalLists.map((l) => [l.name.toLowerCase(), l.id])),
    defaultListId: normalLists[0]?.id ?? null,
    titleOf,
    notes: notes.success ? notes.data : null,
    focus,
  };
}
