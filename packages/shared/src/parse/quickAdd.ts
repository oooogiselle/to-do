import * as chrono from "chrono-node";
import { TZDate } from "@date-fns/tz";
import type { Priority, Repeat } from "../schemas";
import { zonedInstant } from "../time";

export type QuickAddResult = {
  title: string;
  due_at: string | null;
  priority: Priority;
  list_id: string | null;
  /** From "daily", "every day", "weekdays" or "every mon wed fri"; "none" otherwise. */
  repeat: Repeat;
  /** Days of the week (0 = Sunday) for a custom repeat. */
  repeat_days: number[];
};

type ListRef = { id: string; name: string };

const PRIORITY_WORDS: Record<string, Priority> = {
  high: "high", hi: "high", urgent: "high", "!!!": "high", "!!": "high", p1: "high",
  med: "med", medium: "med", "!": "med", p2: "med",
  low: "low", p3: "low",
};

const DEFAULT_DUE_TIME = "23:59";

const DAY_NAME = "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const EVERY_DAYS = new RegExp(`\\severy\\s+((?:(?:${DAY_NAME})\\b\\.?(?:\\s*(?:,|and|&)\\s*|\\s+)?)+)`, "i");
const DAY_NUMBER: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parses quick-add text like "cs61 lab report fri 11pm high".
 * - list: "#name" anywhere, or a leading word(s) matching a list name ("cs61" → "CS61")
 * - priority: a trailing word (high/med/low, !!!, p1–p3)
 * - repeat: "daily" / "every day", "weekdays" / "every weekday", or "every mon wed fri"
 * - due: first date phrase chrono finds; dates without a time are due 11:59pm
 * All dates are read in `timezone`, whatever the device's zone is.
 */
export function parseQuickAdd(
  input: string,
  opts: { lists: ListRef[]; now: Date; timezone: string },
): QuickAddResult {
  let text = ` ${input.trim()} `;
  let list_id: string | null = null;
  let priority: Priority = "none";

  // Explicit #list tag anywhere.
  const tag = text.match(/\s#(\S+)/);
  if (tag) {
    const found = opts.lists.find((l) => norm(l.name) === norm(tag[1]!));
    if (found) {
      list_id = found.id;
      text = text.replace(tag[0], " ");
    }
  }

  // Trailing priority word(s).
  for (;;) {
    const m = text.match(/\s(\S+)\s*$/);
    const p = m && PRIORITY_WORDS[m[1]!.toLowerCase()];
    if (!m || !p) break;
    if (priority === "none") priority = p;
    text = text.slice(0, m.index) + " ";
  }

  // Repeat phrase, taken out before the date parse so "every monday" isn't read as a due date.
  let repeat: Repeat = "none";
  let repeat_days: number[] = [];
  const days = text.match(EVERY_DAYS);
  if (days) {
    const picked = new Set(
      (days[1]!.match(new RegExp(DAY_NAME, "gi")) ?? []).map((d) => DAY_NUMBER[d.slice(0, 3).toLowerCase()]!),
    );
    repeat = "custom";
    repeat_days = [...picked].sort((a, b) => a - b);
    text = text.replace(days[0], " ");
  } else {
    const every = text.match(/\s(?:every\s*day|daily|every\s+weekday|weekdays?)(?=\s)/i);
    if (every) {
      repeat = /weekday/i.test(every[0]) ? "weekdays" : "daily";
      text = text.replace(every[0], " ");
    }
  }

  // Date phrase, parsed against a reference whose device-local fields equal `now` in timezone.
  const z = new TZDate(opts.now.getTime(), opts.timezone);
  const ref = new Date(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes());
  let due_at: string | null = null;
  const [hit] = chrono.parse(text, ref, { forwardDate: true });
  if (hit) {
    const s = hit.start;
    const date = `${s.get("year")}-${pad(s.get("month")!)}-${pad(s.get("day")!)}`;
    const time = s.isCertain("hour")
      ? `${pad(s.get("hour")!)}:${pad(s.get("minute") ?? 0)}`
      : DEFAULT_DUE_TIME;
    due_at = zonedInstant(date, time, opts.timezone).toISOString();
    text = text.slice(0, hit.index) + " " + text.slice(hit.index + hit.text.length);
  }

  // Leading list name (longest match first), only if no #tag matched.
  let words = text.trim().split(/\s+/).filter(Boolean);
  if (!list_id && words.length > 1) {
    const byLength = [...opts.lists].sort(
      (a, b) => b.name.split(/\s+/).length - a.name.split(/\s+/).length,
    );
    for (const l of byLength) {
      const n = l.name.trim().split(/\s+/).length;
      if (words.length > n && norm(words.slice(0, n).join("")) === norm(l.name)) {
        list_id = l.id;
        words = words.slice(n);
        break;
      }
    }
  }

  const title = words.join(" ").replace(/\s+([,.;])/g, "$1").trim() || input.trim();
  return { title, due_at, priority, list_id, repeat, repeat_days };
}
