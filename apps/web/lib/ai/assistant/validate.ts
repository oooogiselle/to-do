import "server-only";
import { z } from "zod/v4";
import {
  fitPicksToSlots,
  normalizeLink,
  urlKey,
  verifyResources,
  zonedInstant,
  type AssistantBlock,
} from "@tt/shared";
import type { Snapshot } from "./snapshot";

// The output schema has no unions or optional fields: each one multiplies the size of the grammar
// the API compiles (and it caps union-typed fields at 16). "Nothing" is an empty string, an empty
// list, 0, or "none", and the model fills every field.
// Plain strings rather than enums, normalized below: the model has returned "" for an enum.
const NoDay = z.string().describe("One of 'none', 'today', 'tomorrow', 'later'");
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => {
  const x = v.trim().toLowerCase() as T;
  return allowed.includes(x) ? x : fallback;
};
const DAYS = ["today", "tomorrow", "later"] as const;
const asDay = (v: string) => oneOf<(typeof DAYS)[number] | "none">(v, [...DAYS, "none"], "none");
const Code = z.string().describe("A task code from the latest snapshot, e.g. 't3'");

const Resource = z.object({
  title: z.string().describe("The page's real title, shortened if long"),
  url: z.string().describe("Exact URL from a search result"),
  kind: z.string().describe("One of 'article', 'video', 'course', 'book', 'tool', 'community', 'other'"),
  note: z.string().describe("One short sentence: why this is worth a look"),
  minutes: z.number().int().describe("Rough minutes to get through it, or 0 if unknown"),
});

/** What the model returns: a text reply, then the cards it wants, which name tasks by code. */
export const ReplyOut = z.object({
  text: z.string().describe("Your reply: usually 1 to 3 sentences"),
  schedule_day: NoDay.describe("The day of a schedule card, or 'none' for no schedule"),
  schedule: z
    .array(
      z.object({
        task: Code,
        step: z.string().describe("A step code of that task, e.g. 't3.s2', or ''"),
        start: z.string().describe("Local start time, 'HH:MM' (24h), inside a free slot"),
        duration_min: z.number().int(),
        reason: z.string().describe("Short and specific, under 60 characters"),
      }),
    )
    .describe("Schedule picks, up to 4; empty for no schedule"),
  tasks_label: z.string().describe("Heading for a task list card, e.g. 'Due this week'; '' for none"),
  tasks: z.array(Code).describe("Tasks for the task list card, up to 8; empty for none"),
  draft: z
    .array(
      z.object({
        title: z.string(),
        list: z.string().describe("The name of one of their lists"),
        due_date: z.string().describe("'YYYY-MM-DD', or '' for no due date"),
        due_time: z.string().describe("'HH:MM' (24h), or '' for end of day"),
        estimate_min: z.number().int().describe("Minutes, or 0 if unknown"),
        priority: z.string().describe("One of 'none', 'low', 'med', 'high'"),
        repeat: z.string().describe("One of 'none', 'daily', 'weekdays'"),
      }),
    )
    .describe("A new to-do to add: one item, or empty"),
  steps_task: Code.describe("The task a steps card is for, or ''"),
  steps: z
    .array(z.object({ title: z.string(), estimate_min: z.number().int() }))
    .describe("Steps to add to that task, 3 to 7; empty for none"),
  slots_day: NoDay.describe("Show their free time that day, or 'none'"),
  idea: z
    .array(
      z.object({
        task: z.string().describe("The Someday item's code if it already exists, else ''"),
        title: z.string(),
        link_url: z.string().describe("The user's own link for it, or ''"),
        idea_kind: z.string().describe("One of 'goal', 'learn', 'idea'"),
        horizon: z.string().describe("One of 'month', 'year', 'someday'"),
        estimate_min: z.number().int().describe("Total effort in minutes, or 0 if unknown"),
        steps: z.array(z.string()).describe("3 to 5 first steps"),
        resources: z.array(Resource).describe("2 to 4 places to start, from your searches"),
      }),
    )
    .describe("A shaped Someday idea: one item, or empty"),
  links_label: z.string().describe("Heading for a links card, e.g. 'Sources'; '' for none"),
  links: z.array(Resource).describe("Sources for something you explained, up to 5; empty for none"),
  follow_ups: z.array(z.string()).describe("Up to 3 short things they might say next"),
});
export type ReplyOut = z.infer<typeof ReplyOut>;

const round5 = (n: number) => Math.round(n / 5) * 5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const orNull = (s: string) => s.trim() || null;
const KINDS = ["article", "video", "course", "book", "tool", "community", "other"] as const;
const resources = (rs: z.infer<typeof Resource>[]) =>
  rs.map((r) => ({ ...r, kind: oneOf(r.kind, KINDS, "other"), minutes: r.minutes > 0 ? r.minutes : null }));

/**
 * Turns the model's reply into stored cards with real ids, dropping anything that doesn't check
 * out: unknown codes, times outside free slots, links that didn't come from a search.
 */
export function validateReply(
  out: ReplyOut,
  snap: Snapshot,
  ctx: { toolBlocks: unknown[]; userText: string; trusted: string[] },
): { blocks: AssistantBlock[]; follow_ups: string[] } {
  const task = (code: string | null) => (code ? (snap.taskByCode.get(code.trim()) ?? null) : null);
  const dayOf = (d: "today" | "tomorrow" | "later") =>
    d === "today" ? snap.today : d === "tomorrow" ? snap.tomorrow : snap.later;
  const blocks: AssistantBlock[] = [];
  const draft = out.draft[0];
  const idea = out.idea[0];
  const scheduleDay = asDay(out.schedule_day);
  const slotsDay = asDay(out.slots_day);
  const parts = [
    { kind: "text" as const, text: out.text },
    scheduleDay !== "none" &&
      out.schedule.length > 0 && {
        kind: "schedule" as const,
        day: scheduleDay,
        picks: out.schedule.slice(0, 6).map((p) => ({ ...p, step: orNull(p.step) })),
      },
    out.tasks.length > 0 && { kind: "tasks" as const, label: out.tasks_label, tasks: out.tasks.slice(0, 8) },
    draft && {
      kind: "draft" as const,
      ...draft,
      list: orNull(draft.list),
      due_date: orNull(draft.due_date),
      due_time: orNull(draft.due_time),
      estimate_min: draft.estimate_min > 0 ? draft.estimate_min : null,
      priority: oneOf(draft.priority, ["none", "low", "med", "high"] as const, "none"),
      repeat: oneOf(draft.repeat, ["none", "daily", "weekdays"] as const, "none"),
    },
    out.steps_task.trim() &&
      out.steps.length > 0 && { kind: "steps" as const, task: out.steps_task, steps: out.steps.slice(0, 7) },
    slotsDay !== "none" && { kind: "slots" as const, day: slotsDay },
    idea && {
      kind: "idea" as const,
      ...idea,
      task: orNull(idea.task),
      link_url: orNull(idea.link_url),
      estimate_min: idea.estimate_min > 0 ? idea.estimate_min : null,
      idea_kind: oneOf(idea.idea_kind, ["goal", "learn", "idea"] as const, "idea"),
      horizon: oneOf(idea.horizon, ["month", "year", "someday"] as const, "someday"),
      resources: resources(idea.resources),
    },
    out.links.length > 0 && { kind: "links" as const, label: out.links_label, resources: resources(out.links) },
  ].filter((p) => !!p);

  for (const b of parts) {
    switch (b.kind) {
      case "text": {
        const text = b.text.trim().slice(0, 1500);
        if (text) blocks.push({ kind: "text", text });
        break;
      }
      case "schedule": {
        const day = dayOf(b.day);
        if (!day) break;
        const raw = b.picks.flatMap((p) => {
          const task_id = task(p.task);
          if (!task_id || !HHMM.test(p.start.trim())) return [];
          const start = zonedInstant(day.date, p.start.trim(), snap.timezone).getTime();
          // Work booked after the deadline doesn't help (overdue tasks are fine: they're late anyway).
          const due = snap.dueOf.get(task_id);
          if (due && due > Date.now() && start >= due) return [];
          return [
            {
              task_id,
              step_id: p.step ? (snap.stepByCode.get(p.step.trim()) ?? null) : null,
              start,
              duration_min: p.duration_min,
              reason: p.reason,
            },
          ];
        });
        const picks = fitPicksToSlots(raw, day.slots, snap.known);
        if (picks.length) blocks.push({ kind: "schedule", date: day.date, picks });
        break;
      }
      case "tasks": {
        const ids = [...new Set(b.tasks.map(task).filter((id): id is string => !!id))];
        if (ids.length) blocks.push({ kind: "tasks", label: b.label.trim().slice(0, 60) || "Tasks", task_ids: ids });
        break;
      }
      case "draft": {
        const title = b.title.trim().slice(0, 200);
        if (!title) break;
        const date = b.due_date && DATE.test(b.due_date) ? b.due_date : null;
        const time = b.due_time && HHMM.test(b.due_time) ? b.due_time : "23:59";
        blocks.push({
          kind: "draft",
          draft: {
            title,
            list_id: (b.list && snap.listByName.get(b.list.trim().toLowerCase())) || snap.defaultListId,
            due_at: date ? zonedInstant(date, time, snap.timezone).toISOString() : null,
            estimate_min: b.estimate_min && b.estimate_min > 0 ? clamp(round5(b.estimate_min), 5, 600) : null,
            priority: b.priority,
            repeat: b.repeat,
          },
        });
        break;
      }
      case "steps": {
        const task_id = task(b.task);
        const steps = b.steps
          .map((s) => ({
            title: s.title.trim().slice(0, 120),
            estimate_min: s.estimate_min > 0 ? clamp(round5(s.estimate_min), 5, 240) : null,
          }))
          .filter((s) => s.title);
        if (task_id && steps.length) blocks.push({ kind: "steps", task_id, steps });
        break;
      }
      case "slots": {
        const day = dayOf(b.day);
        if (!day) break;
        blocks.push({
          kind: "slots",
          date: day.date,
          slots: day.slots.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
        });
        break;
      }
      case "idea": {
        const title = b.title.trim().slice(0, 200);
        if (!title) break;
        const existing = task(b.task);
        const task_id = existing && snap.somedayIds.has(existing) ? existing : null;
        // A link has to be the item's own, or one the user typed.
        const own = task_id ? (snap.linkOf.get(task_id) ?? null) : null;
        const typed = b.link_url ? normalizeLink(b.link_url) : null;
        const typedKey = typed ? urlKey(typed) : null;
        const fromUser =
          typed && typedKey && ctx.userText.split(/\s+/).some((w) => urlKey(w.replace(/[).,]+$/, "")) === typedKey)
            ? typed
            : null;
        const link_url = own ?? fromUser;
        blocks.push({
          kind: "idea",
          plan: {
            task_id,
            title,
            link_url,
            idea_kind: b.idea_kind === "idea" ? null : b.idea_kind,
            horizon: b.horizon,
            estimate_min: b.estimate_min && b.estimate_min > 0 ? clamp(round5(b.estimate_min), 15, 2000 * 60) : null,
            steps: b.steps.map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 5),
            resources: verifyResources(b.resources, ctx.toolBlocks, {
              skip: [link_url],
              trusted: ctx.trusted,
              max: 4,
            }),
          },
        });
        break;
      }
      case "links": {
        const resources = verifyResources(b.resources, ctx.toolBlocks, { trusted: ctx.trusted, max: 5 });
        if (resources.length) blocks.push({ kind: "links", label: b.label.trim().slice(0, 60) || "Sources", resources });
        break;
      }
    }
  }

  if (!blocks.length) {
    blocks.push({ kind: "text", text: "I couldn't put that together. Try asking another way." });
  }
  const follow_ups = [...new Set(out.follow_ups.map((f) => f.trim().slice(0, 60)).filter(Boolean))].slice(0, 3);
  return { blocks, follow_ups };
}
