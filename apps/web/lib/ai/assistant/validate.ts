import "server-only";
import { z } from "zod/v4";
import {
  claimsAction,
  collectUrlKeys,
  guardText,
  localDate,
  localWeekday,
  normalizeLink,
  urlKey,
  verifyResources,
  zonedInstant,
  type AssistantBlock,
  type FittedPick,
  type Unplaced,
} from "@tt/shared";
import { buildChanges, placeTimes } from "./changes";
import type { Snapshot } from "./snapshot";

// The output schema has no unions or optional fields: each one multiplies the size of the grammar
// the API compiles (and it caps union-typed fields at 16). "Nothing" is an empty string, an empty
// list, 0, or "none", and the model fills every field.
// Plain strings rather than enums, normalized below: the model has returned "" for an enum.
const Day = z.string().describe("A day from the snapshot as 'YYYY-MM-DD'");
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => {
  const x = v.trim().toLowerCase() as T;
  return allowed.includes(x) ? x : fallback;
};
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
  schedule: z
    .array(
      z.object({
        task: Code,
        step: z.string().describe("A step code of that task, e.g. 't3.s2', or ''"),
        new_step: z
          .string()
          .describe(
            "When the task has no step for this session: a short name for what it works on ('Outline', 'Read ch. 3', 'Revise draft'), under 60 characters. Otherwise ''",
          ),
        day: Day.describe("The day for this block as 'YYYY-MM-DD', or '' for the earliest day that works"),
        when: z
          .string()
          .describe("'morning', 'afternoon', 'evening', 'HH:MM' (24h) only for a time they asked for, or 'any'"),
        duration_min: z.number().int().describe("Minutes for this block"),
        reason: z.string().describe("Short and specific, under 60 characters"),
      }),
    )
    .describe("Blocks to schedule, most pressing first, up to 8; empty for no schedule. The app fits exact times."),
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
        book: z
          .string()
          .describe("When to do it, if they said: 'YYYY-MM-DD HH:MM' (24h) or 'YYYY-MM-DD morning|afternoon|evening'; '' to not book"),
      }),
    )
    .describe("New to-dos to add, up to 5; empty for none"),
  // One generic list on purpose: the API caps how large the compiled output grammar can be
  // (web search's own grammar counts too), and separate edit/move/remove lists went over.
  changes: z
    .array(
      z.object({
        op: z.string().describe("'edit', 'move' or 'remove'"),
        code: z.string().describe("edit: a task or step code; move: a block code ('b3'); remove: a block, task or step code"),
        field: z
          .string()
          .describe("edit: 'title', 'due', 'estimate', 'priority', 'list' or 'done'; move: 'to' or 'length'; remove: 'block', 'task', 'step' or 'plan'"),
        value: z
          .string()
          .describe("edit: the new value (due as 'YYYY-MM-DD HH:MM', 'YYYY-MM-DD' or 'none'; estimate in minutes; done: 'yes'); move to: 'YYYY-MM-DD HH:MM', 'YYYY-MM-DD morning|afternoon|evening' or just a time that day; length: minutes; remove: ''"),
      }),
    )
    .describe("Changes to things that exist, one row per field; empty for none"),
  steps_task: Code.describe("The task a steps card is for, or ''"),
  steps: z
    .array(z.object({ title: z.string(), estimate_min: z.number().int() }))
    .describe("Steps to add to that task, 3 to 7; empty for none"),
  slots_day: z.string().describe("Show their free time on this day ('YYYY-MM-DD'), or ''"),
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
      }),
    )
    .describe("A shaped Someday idea: one item, or empty. Its 2 to 4 places to start go in links."),
  links_label: z.string().describe("Heading for a links card, e.g. 'Sources'; '' for none"),
  links: z
    .array(Resource)
    .describe("With an idea: its 2 to 4 places to start. Otherwise sources for something you explained, up to 5. Empty for none"),
  follow_ups: z.array(z.string()).describe("Up to 3 short things they might say next"),
  title: z.string().describe("On your first reply in a chat only: a 2 to 5 word title for the chat; otherwise ''"),
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

/** Cards the user can act on, as opposed to ones that only show something. */
const ACTIONABLE = new Set<AssistantBlock["kind"]>(["schedule", "draft", "changes", "steps", "idea"]);

/**
 * Turns the model's reply into stored cards with real ids, dropping anything that doesn't check
 * out: unknown codes, times outside free slots, links that didn't come from a search, deletes
 * the user didn't ask for. The text gets the same treatment (`guardText`): no codes, no
 * unverified links, no markdown beyond bold and bullets. `guard` lists every check that fired.
 */
export function validateReply(
  out: ReplyOut,
  snap: Snapshot,
  ctx: { toolBlocks: unknown[]; userText: string; trusted: string[] },
): { blocks: AssistantBlock[]; follow_ups: string[]; title: string; guard: string[] } {
  const task = (code: string | null) => (code ? (snap.taskByCode.get(code.trim()) ?? null) : null);
  const dayOf = (v: string) => dayIn(snap, v);
  const blocks: AssistantBlock[] = [];
  /** Said after the reply's text, e.g. what couldn't be fitted before its due date. */
  const notes: string[] = [];
  // Every time in the reply (new blocks, moves, draft bookings) is worked out together.
  const times = placeTimes(out, snap);
  const { changes, skipped } = buildChanges(out, snap, times, ctx.userText);
  const guard = new Set<string>();
  if (skipped.length) guard.add("changes:delete_no_intent");
  // Links the text may show: this turn's search results, earlier verified links, the user's own.
  const allowedUrlKeys = collectUrlKeys([ctx.toolBlocks, ctx.trusted, ctx.userText]);
  const nameOf = (code: string) => {
    const c = code.toLowerCase();
    const stepId = snap.stepByCode.get(c);
    if (stepId) return snap.stepInfo.get(stepId)?.title ?? null;
    const taskId = snap.taskByCode.get(c);
    if (taskId) return snap.titleOf.get(taskId) ?? null;
    const block = snap.blockByCode.get(c);
    if (block) {
      const title = snap.titleOf.get(block.task_id);
      return title ? `${title} block` : null;
    }
    return null;
  };
  const clean = (text: string) => {
    const r = guardText(text, { nameOf, allowedUrlKeys });
    for (const tag of r.fired) guard.add(`text:${tag}`);
    return r.text;
  };
  const idea = out.idea[0];
  const slotsDay = out.slots_day.trim();
  const parts = [
    { kind: "text" as const, text: out.text },
    changes.length > 0 && { kind: "changes" as const },
    out.schedule.length > 0 && { kind: "schedule" as const },
    out.tasks.length > 0 && { kind: "tasks" as const, label: out.tasks_label, tasks: out.tasks.slice(0, 8) },
    ...out.draft.slice(0, 5).map((draft, i) => ({
      kind: "draft" as const,
      ...draft,
      book: times.drafts.get(i) ?? null,
      list: orNull(draft.list),
      due_date: orNull(draft.due_date),
      due_time: orNull(draft.due_time),
      estimate_min: draft.estimate_min > 0 ? draft.estimate_min : null,
      priority: oneOf(draft.priority, ["none", "low", "med", "high"] as const, "none"),
      repeat: oneOf(draft.repeat, ["none", "daily", "weekdays"] as const, "none"),
    })),
    out.steps_task.trim() &&
      out.steps.length > 0 && { kind: "steps" as const, task: out.steps_task, steps: out.steps.slice(0, 7) },
    !!slotsDay && slotsDay.toLowerCase() !== "none" && { kind: "slots" as const, day: slotsDay },
    idea && {
      kind: "idea" as const,
      ...idea,
      task: orNull(idea.task),
      link_url: orNull(idea.link_url),
      estimate_min: idea.estimate_min > 0 ? idea.estimate_min : null,
      idea_kind: oneOf(idea.idea_kind, ["goal", "learn", "idea"] as const, "idea"),
      horizon: oneOf(idea.horizon, ["month", "year", "someday"] as const, "someday"),
      resources: resources(out.links),
    },
    // With an idea, the links are its places to start, not a card of their own.
    !idea && out.links.length > 0 ? { kind: "links" as const, label: out.links_label, resources: resources(out.links) } : null,
  ].filter((p) => !!p);

  for (const b of parts) {
    switch (b.kind) {
      case "text": {
        const text = clean(b.text).slice(0, 1500);
        if (text) blocks.push({ kind: "text", text });
        break;
      }
      case "changes": {
        blocks.push({ kind: "changes", changes });
        break;
      }
      case "schedule": {
        const placed = times.schedule;
        if (placed.length) blocks.push({ kind: "schedule", date: localDay(snap, placed[0]!.start), picks: placed });
        notes.push(...unplacedNote(times.scheduleUnplaced, placed, snap));
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
          // A repeating to-do is added, not booked.
          book: b.repeat === "none" ? b.book : null,
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
          slots: day.shown.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
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

  // The reply may already mention an overlap; don't say it twice.
  const said = out.text.toLowerCase();
  notes.push(...times.notes.filter((n) => !(n.includes(" overlaps ") && said.includes("overlap"))));
  if (skipped.length) {
    const names = skipped.map((t) => `**${t}**`);
    notes.push(
      `I left out deleting ${names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ")}. Say so if you want ${skipped.length > 1 ? "them" : "it"} gone.`,
    );
  }
  // The model only proposes; if it says something already happened, set that straight.
  if (claimsAction(out.text)) {
    guard.add("text:claim");
    notes.push(
      blocks.some((b) => ACTIONABLE.has(b.kind))
        ? "Nothing's changed yet. Use the card to make it happen."
        : "Nothing's changed yet. I can only suggest changes, as cards you apply.",
    );
  }
  if (notes.length) {
    const first = blocks.find((b) => b.kind === "text");
    if (first) first.text = `${first.text}\n\n${notes.join(" ")}`;
    else blocks.unshift({ kind: "text", text: notes.join(" ") });
  }
  if (!blocks.length) {
    blocks.push({ kind: "text", text: "I couldn't put that together. Try asking another way." });
  }
  const follow_ups = [...new Set(out.follow_ups.map((f) => clean(f).slice(0, 60)).filter(Boolean))].slice(0, 3);
  return { blocks, follow_ups, title: cleanTitle(out.title), guard: [...guard] };
}

/** The model's chat title, one line without wrapping quotes or a final period; '' for none. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘]+|["'”’.]+$/g, "")
    .trim()
    .slice(0, 60)
    .trim();
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** A day of the snapshot from what the model wrote: 'YYYY-MM-DD', 'today', 'tomorrow' or a weekday. */
export function dayIn(snap: Pick<Snapshot, "days" | "timezone">, raw: string) {
  const v = raw.trim().toLowerCase();
  if (v === "today") return snap.days[0] ?? null;
  if (v === "tomorrow") return snap.days[1] ?? null;
  if (DATE.test(v)) return snap.days.find((d) => d.date === v) ?? null;
  const wd = WEEKDAY_NAMES.indexOf(v.slice(0, 3));
  if (wd < 0) return null;
  return snap.days.find((d) => localWeekday(zonedInstant(d.date, "12:00", snap.timezone), snap.timezone) === wd) ?? null;
}

const localDay = (snap: Pick<Snapshot, "timezone">, iso: string) => localDate(new Date(iso), snap.timezone);

const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** One honest line on work that didn't fit, so the text never promises more than the card holds. */
function unplacedNote(unplaced: Unplaced[], placed: FittedPick[], snap: Pick<Snapshot, "titleOf">): string[] {
  const title = (id: string) => `**${snap.titleOf.get(id) ?? "a task"}**`;
  const placedIds = new Set(placed.map((p) => p.task_id));
  const late = [...new Set(unplaced.filter((u) => u.reason === "no_time_before_due").map((u) => u.task_id))];
  const noRoom = [
    ...new Set(unplaced.filter((u) => u.reason === "no_time" && !placedIds.has(u.task_id)).map((u) => u.task_id)),
  ].filter((id) => !late.includes(id));
  const out: string[] = [];
  if (late.length) {
    const names = late.map((id) => (placedIds.has(id) ? `all of ${title(id)}` : title(id)));
    out.push(`I couldn't fit ${listOf(names)} before ${late.length > 1 ? "they're" : "it's"} due. Want to move something else, or ask for more time?`);
  }
  if (noRoom.length) out.push(`There wasn't room for ${listOf(noRoom.map(title))} in the days I can plan.`);
  return out;
}
