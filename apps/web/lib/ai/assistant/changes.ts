import "server-only";
import {
  hasDeleteIntent,
  localDate,
  placePicks,
  subtract,
  zonedInstant,
  type AssistantChange,
  type AssistantEditFields,
  type FittedPick,
  type Interval,
  type PickRequest,
  type Unplaced,
} from "@tt/shared";
import type { SnapBlock, Snapshot } from "./snapshot";
import type { ReplyOut } from "./validate";
import { dayIn } from "./validate";

const MIN = 60_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ["none", "low", "med", "high"] as const;
const round5 = (n: number) => Math.round(n / 5) * 5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const bold = (s: string) => `**${s}**`;
/** Most to-dos one reply can offer to delete (all removals together stay at 6). */
const MAX_TASK_DELETES = 3;

type Span = { start: string; end: string };

/** A session name that only repeats the task's title ("Work on Essay 2" for "Essay 2") says nothing. */
export function echoesTitle(name: string, title: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/^(work on|finish|start|continue|do|complete)\s+/, "")
      .replace(/^(the|my)\s+/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const n = norm(name);
  const t = norm(title);
  return !n || t.includes(n);
}

/** The model's change rows, sorted into edits, moves (one per block) and removals. */
export function splitChanges(out: Pick<ReplyOut, "changes">) {
  const edits: { code: string; field: string; value: string }[] = [];
  const moves = new Map<string, { block: string; to: string; duration_min: number; reason: string }>();
  const removes: { code: string; what: string }[] = [];
  for (const r of out.changes.slice(0, 24)) {
    const code = r.code.trim().toLowerCase();
    const field = r.field.trim().toLowerCase();
    const op = r.op.trim().toLowerCase();
    if (!code) continue;
    if (op === "remove" || ["block", "task", "step", "plan"].includes(field)) {
      removes.push({ code, what: field });
    } else if (op === "move" || field === "to" || field === "length") {
      const m = moves.get(code) ?? { block: code, to: "", duration_min: 0, reason: "" };
      if (field === "length") m.duration_min = Number.parseInt(r.value, 10) || 0;
      else m.to = r.value;
      moves.set(code, m);
    } else {
      edits.push({ code, field, value: r.value });
    }
  }
  return { edits, moves: [...moves.values()], removes };
}

const WINDOWS = ["morning", "afternoon", "evening", "any"];
/**
 * A time as the model wrote it ("2026-11-19 15:00", "tomorrow afternoon", "16:00"), split into a
 * day and a time of day; '' for whichever part is missing.
 */
export function splitWhen(raw: string): { day: string; when: string } {
  let day = "";
  let when = "";
  for (const tok of raw.trim().toLowerCase().split(/[\s,]+/)) {
    const t = /^\d:\d\d$/.test(tok) ? `0${tok}` : tok;
    if (HHMM.test(t) || WINDOWS.includes(t)) when ||= t;
    else if (t) day ||= t;
  }
  return { day, when };
}
/** What placement asks for, before it's split into exact times and times to fit. */
type Want = PickRequest & { ref: string };

export type TimeResult = {
  /** New blocks for the schedule card, sorted by start. */
  schedule: FittedPick[];
  scheduleUnplaced: Unplaced[];
  /** Where each move (by index into `out.moves`) lands. */
  moves: Map<number, { block: SnapBlock; to: Span; reason: string }>;
  /** The time each draft (by index) is booked at. */
  drafts: Map<number, Span>;
  /** Honest lines on what couldn't go where it was asked, or overlaps something. */
  notes: string[];
};

/**
 * Works out every time in a reply in one pass, so nothing in it overlaps: blocks being moved
 * free their own time first, then times the user named are kept exactly (with a note when they
 * overlap something), then the rest is fitted around them by `placePicks`.
 */
export function placeTimes(out: ReplyOut, snap: Snapshot, now = Date.now()): TimeResult {
  const tz = snap.timezone;
  const notes: string[] = [];
  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const nice = (ms: number) =>
    new Date(ms)
      .toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
      .replace(":00", "")
      .replace(/[\s\u202f]+/g, "")
      .toLowerCase();
  const titleOf = (id: string) => snap.titleOf.get(id) ?? "a task";
  /** A day the model wrote, as a snapshot date; undefined when it wrote one we don't have. */
  const dateOf = (raw: string): string | null | undefined => {
    const v = raw.trim();
    if (!v) return null;
    return dayIn(snap, v)?.date;
  };

  const known = new Map(snap.known);
  const dueOf = new Map(snap.dueOf);
  const wants: Want[] = [];
  const movedIds = new Set<string>();
  const moveBlocks = new Map<number, SnapBlock>();
  const labels = new Map<string, string>();

  splitChanges(out).moves.slice(0, 6).forEach((m, i) => {
    const block = snap.blockByCode.get(m.block.trim().toLowerCase());
    if (!block || movedIds.has(block.id)) return;
    const start = Date.parse(block.start);
    const len = (Date.parse(block.end) - start) / MIN;
    const curDay = localDate(new Date(start), tz);
    const to = splitWhen(m.to);
    const date = dateOf(to.day);
    const label = block.step_id ? (snap.stepInfo.get(block.step_id)?.title ?? titleOf(block.task_id)) : titleOf(block.task_id);
    if (date === undefined) {
      notes.push(`I can only move ${bold(label)} within the next seven days.`);
      return;
    }
    const when = to.when || hhmm(start);
    const duration = m.duration_min > 0 ? clamp(round5(m.duration_min), 15, 8 * 60) : len;
    if ((date ?? curDay) === curDay && when === hhmm(start) && duration === len) return;
    movedIds.add(block.id);
    moveBlocks.set(i, block);
    const steps = new Set(known.get(block.task_id) ?? []);
    if (block.step_id) steps.add(block.step_id);
    known.set(block.task_id, steps);
    const ref = `m${i}`;
    labels.set(ref, label);
    wants.push({
      ref,
      task_id: block.task_id,
      step_id: block.step_id,
      date: date ?? curDay,
      when,
      duration_min: duration,
      reason: m.reason,
      keep_length: true,
    });
  });

  out.schedule.slice(0, 12).forEach((p, i) => {
    const task_id = snap.taskByCode.get(p.task.trim());
    if (!task_id) return;
    const date = dateOf(p.day);
    const ref = `s${i}`;
    labels.set(ref, titleOf(task_id));
    wants.push({
      ref,
      task_id,
      step_id: p.step.trim() ? (snap.stepByCode.get(p.step.trim()) ?? null) : null,
      step_title: echoesTitle(p.new_step, titleOf(task_id)) ? "" : p.new_step,
      // A day the snapshot doesn't have stays as given, so it's reported as not placed.
      date: date === undefined ? p.day.trim() : date,
      when: p.when,
      duration_min: p.duration_min,
      reason: p.reason,
    });
  });

  out.draft.slice(0, 5).forEach((d, i) => {
    const { day, when } = splitWhen(d.book);
    if (!when && !day) return;
    const title = d.title.trim();
    if (!title || d.repeat.trim().toLowerCase() !== "none") return;
    const date = dateOf(day);
    if (date === undefined) return;
    const task_id = `draft:${i}`;
    known.set(task_id, new Set());
    if (DATE.test(d.due_date.trim())) {
      const t = HHMM.test(d.due_time.trim()) ? d.due_time.trim() : "23:59";
      dueOf.set(task_id, zonedInstant(d.due_date.trim(), t, tz).getTime());
    }
    const ref = `d${i}`;
    labels.set(ref, title);
    const minutes = d.estimate_min > 0 ? d.estimate_min : snap.defaultBlockMin;
    wants.push({
      ref,
      task_id,
      step_id: null,
      date,
      when: when || "any",
      duration_min: clamp(round5(minutes), 15, 8 * 60),
      reason: "",
      keep_length: true,
    });
  });

  // Times the user named are kept exactly. Without a day, the first day that time is still ahead.
  const exact: (FittedPick & { ref: string })[] = [];
  const fuzzy: Want[] = [];
  const unplaced: Unplaced[] = [];
  for (const w of wants) {
    const when = w.when.trim();
    if (!HHMM.test(when) || (w.date && !snap.days.some((d) => d.date === w.date))) {
      fuzzy.push(w);
      continue;
    }
    const len = Math.max(15, round5(w.duration_min)) * MIN;
    const days = w.date ? [w.date] : snap.days.map((d) => d.date);
    const start = days.map((date) => zonedInstant(date, when, tz).getTime()).find((s) => s + len > now);
    if (start === undefined) {
      notes.push(`${nice(zonedInstant(days[0]!, when, tz).getTime())} has already passed, so I left ${bold(labels.get(w.ref)!)} out.`);
      unplaced.push({ task_id: w.task_id, step_id: w.step_id, reason: "no_time", ref: w.ref });
      continue;
    }
    const steps = known.get(w.task_id);
    if (!steps) continue;
    const step_id = w.step_id && steps.has(w.step_id) ? w.step_id : null;
    const step_title = step_id ? "" : (w.step_title ?? "").trim().slice(0, 120);
    const pick = {
      ref: w.ref,
      task_id: w.task_id,
      step_id,
      ...(step_title ? { step_title } : {}),
      start: new Date(start).toISOString(),
      end: new Date(start + len).toISOString(),
      reason: w.reason.trim().slice(0, 200),
    };
    const overlaps = [
      ...snap.busy.filter((b) => !(b.blockId && movedIds.has(b.blockId))),
      ...exact.map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end), label: labels.get(e.ref)! })),
    ].filter((b) => b.start < start + len && b.end > start);
    if (overlaps.length) {
      const names = [...new Set(overlaps.map((o) => o.label))].slice(0, 2).join(" and ");
      notes.push(`${bold(labels.get(w.ref)!)} at ${nice(start)} overlaps ${names}.`);
    }
    const due = dueOf.get(w.task_id);
    // A new to-do's due time is often the appointment itself, so only starting late counts.
    const late = w.ref.startsWith("d") ? start > due! : start + len > due!;
    if (due !== undefined && late && due > now) {
      notes.push(`${bold(labels.get(w.ref)!)} at ${nice(start)} runs past its due date.`);
    }
    exact.push(pick);
  }

  // Everything else fits around the exact times, in free time that doesn't count moved blocks.
  const pad = snap.prefs.break_min * MIN;
  const taken: Interval[] = exact
    .map((e) => ({ start: Date.parse(e.start) - pad, end: Date.parse(e.end) + pad }))
    .sort((a, b) => a.start - b.start);
  const days = snap.daysWithout(movedIds).map((d) => ({ ...d, free: subtract(d.free, taken) }));
  const fitted = placePicks({ picks: fuzzy, days, known, dueOf, prefs: snap.prefs, now, timezone: tz, max: 20 });
  const placed = [...exact, ...fitted.placed] as (FittedPick & { ref: string })[];
  unplaced.push(...fitted.unplaced);

  const moves: TimeResult["moves"] = new Map();
  const drafts = new Map<number, Span>();
  const schedule: FittedPick[] = [];
  for (const p of placed) {
    const i = Number(p.ref.slice(1));
    const { ref, ...pick } = p;
    if (ref.startsWith("m")) moves.set(i, { block: moveBlocks.get(i)!, to: { start: p.start, end: p.end }, reason: p.reason });
    else if (ref.startsWith("d")) drafts.set(i, { start: p.start, end: p.end });
    else schedule.push(pick);
  }
  for (const u of unplaced) {
    if (u.ref?.startsWith("m") && !notes.some((n) => n.includes(bold(labels.get(u.ref!)!)))) {
      notes.push(`There wasn't room to move ${bold(labels.get(u.ref)!)} there.`);
    }
    if (u.ref?.startsWith("d") && !notes.some((n) => n.includes(bold(labels.get(u.ref!)!)))) {
      notes.push(`I couldn't find a time for ${bold(labels.get(u.ref)!)}; Schedule will look for one.`);
    }
  }
  return {
    schedule: schedule.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 8),
    scheduleUnplaced: unplaced.filter((u) => u.ref?.startsWith("s")),
    moves,
    drafts,
    notes,
  };
}

/**
 * The edits, moves and removals in a reply, checked against the snapshot; empty when none hold up.
 * Deleting a to-do or step needs the user's latest message to ask for something to go: otherwise
 * the delete is left out (and named in `skipped`), so text in a task's notes or a search result
 * can't talk the model into offering one.
 */
export function buildChanges(
  out: ReplyOut,
  snap: Snapshot,
  times: TimeResult,
  userText: string,
): { changes: AssistantChange[]; skipped: string[] } {
  const mayDelete = hasDeleteIntent(userText);
  const skipped: string[] = [];
  let taskDeletes = 0;
  const tz = snap.timezone;
  const changes: AssistantChange[] = [];
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const today = snap.days[0]?.date ?? localDate(new Date(), tz);

  // One row per field; gather them per task or step.
  const rows = new Map<string, { title: string; due: string; estimate: number; priority: string; list: string; done: boolean }>();
  const { edits, removes } = splitChanges(out);
  for (const r of edits.slice(0, 18)) {
    const code = r.code.trim().toLowerCase();
    if (!code) continue;
    const e = rows.get(code) ?? { title: "", due: "", estimate: 0, priority: "", list: "", done: false };
    const v = r.value.trim();
    const field = r.field.trim().toLowerCase();
    if (field === "title") e.title = v;
    else if (field === "due") e.due = v;
    else if (field === "estimate") e.estimate = Number.parseInt(v, 10) || 0;
    else if (field === "priority") e.priority = v;
    else if (field === "list") e.list = v;
    else if (field === "done") e.done = ["yes", "true", "done"].includes(v.toLowerCase());
    rows.set(code, e);
  }

  for (const [code, e] of [...rows].slice(0, 6)) {
    const done = e.done;
    const title = e.title.trim().slice(0, 200);
    const patch: AssistantEditFields = {};
    const before: AssistantEditFields = {};

    const stepId = snap.stepByCode.get(code);
    if (stepId) {
      const step = snap.stepInfo.get(stepId)!;
      if (title && title !== step.title) [patch.title, before.title] = [title.slice(0, 120), step.title];
      if (done && !step.done) [patch.done, before.done] = [true, false];
      if (Object.keys(patch).length && once(`edit:${stepId}`)) {
        changes.push({ op: "edit", task_id: step.task_id, step_id: stepId, patch, before });
      }
      continue;
    }
    const taskId = snap.taskByCode.get(code);
    const info = taskId ? snap.taskInfo.get(taskId) : undefined;
    if (!taskId || !info) continue;
    if (title && title !== info.title) [patch.title, before.title] = [title, info.title];

    const { day: dueDay, when: time } = splitWhen(e.due);
    const day = dueDay === "none" ? "none" : dueDay ? (dayIn(snap, dueDay)?.date ?? (DATE.test(dueDay) ? dueDay : "")) : "";
    if (day === "none") {
      if (info.due_at) [patch.due_at, before.due_at] = [null, info.due_at];
    } else if (DATE.test(day) || (HHMM.test(time) && info.due_at)) {
      const date = DATE.test(day) ? day : localDate(new Date(info.due_at!), tz);
      // Changing only the date keeps the time it was due.
      const keep = info.due_at
        ? new Date(info.due_at).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
        : "23:59";
      const due = zonedInstant(date, HHMM.test(time) ? time : keep, tz).toISOString();
      if (!info.due_at || Date.parse(due) !== Date.parse(info.due_at)) [patch.due_at, before.due_at] = [due, info.due_at];
    }
    if (e.estimate > 0) {
      const est = clamp(round5(e.estimate), 5, 600);
      if (est !== info.estimate_min) [patch.estimate_min, before.estimate_min] = [est, info.estimate_min];
    }
    const priority = e.priority.trim().toLowerCase() as (typeof PRIORITIES)[number];
    if (PRIORITIES.includes(priority) && priority !== info.priority) [patch.priority, before.priority] = [priority, info.priority];
    const listId = e.list.trim() ? snap.listByName.get(e.list.trim().toLowerCase()) : undefined;
    if (listId && listId !== info.list_id) [patch.list_id, before.list_id] = [listId, info.list_id];
    if (done) [patch.done, before.done] = [true, false];
    if (Object.keys(patch).length && once(`edit:${taskId}`)) {
      changes.push({ op: "edit", task_id: taskId, step_id: null, patch, before });
    }
  }

  for (const [, m] of [...times.moves].sort((a, b) => a[0] - b[0])) {
    if (!once(`move:${m.block.id}`)) continue;
    changes.push({
      op: "move",
      block_id: m.block.id,
      task_id: m.block.task_id,
      step_id: m.block.step_id,
      from: { start: m.block.start, end: m.block.end },
      to: m.to,
      reason: m.reason,
    });
  }

  for (const r of removes.slice(0, 6)) {
    const code = r.code.trim().toLowerCase();
    const said = r.what.trim().toLowerCase();
    const reason = "";
    const block = snap.blockByCode.get(code);
    const stepId = snap.stepByCode.get(code);
    const taskId = snap.taskByCode.get(code);
    const owner = block?.task_id ?? (stepId ? snap.stepInfo.get(stepId)?.task_id : taskId);
    const label = owner ? snap.titleOf.get(owner) : undefined;
    const base = { span: null, step: null, plan: null, blocks: 0, reason, ...(label ? { label } : {}) };

    if (said === "plan") {
      const item = owner ? snap.planItemOf.get(`${owner}:${stepId ?? ""}`) : undefined;
      if (owner && item && once(`plan:${item.id}`)) {
        changes.push({
          op: "remove",
          what: "plan",
          id: item.id,
          task_id: owner,
          step_id: stepId ?? null,
          ...base,
          plan: { date: today, position: item.position },
        });
      }
    } else if (block) {
      if (times.moves.size && [...times.moves.values()].some((m) => m.block.id === block.id)) continue;
      if (once(`block:${block.id}`)) {
        changes.push({
          op: "remove",
          what: "block",
          id: block.id,
          task_id: block.task_id,
          step_id: block.step_id,
          ...base,
          span: { start: block.start, end: block.end },
        });
      }
    } else if (stepId) {
      const step = snap.stepInfo.get(stepId)!;
      if (!mayDelete) {
        if (once(`skip:${stepId}`)) skipped.push(step.title);
        continue;
      }
      if (once(`step:${stepId}`)) {
        changes.push({
          op: "remove",
          what: "step",
          id: stepId,
          task_id: step.task_id,
          step_id: stepId,
          ...base,
          step: { title: step.title, estimate_min: step.estimate_min, order: step.order },
        });
      }
    } else if (taskId && snap.taskInfo.has(taskId)) {
      if (!mayDelete || taskDeletes >= MAX_TASK_DELETES) {
        if (once(`skip:${taskId}`)) skipped.push(snap.taskInfo.get(taskId)!.title);
        continue;
      }
      if (!once(`task:${taskId}`)) continue;
      taskDeletes++;
      changes.push({
        op: "remove",
        what: "task",
        id: taskId,
        task_id: taskId,
        step_id: null,
        ...base,
        blocks: snap.upcomingBlocks.get(taskId) ?? 0,
      });
    }
  }
  return { changes, skipped };
}
