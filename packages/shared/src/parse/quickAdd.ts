import * as chrono from "chrono-node";
import { TZDate } from "@date-fns/tz";
import type { Priority } from "../schemas";
import { zonedInstant } from "../time";

export type QuickAddResult = {
  title: string;
  due_at: string | null;
  priority: Priority;
  list_id: string | null;
};

type ListRef = { id: string; name: string };

const PRIORITY_WORDS: Record<string, Priority> = {
  high: "high", hi: "high", urgent: "high", "!!!": "high", "!!": "high", p1: "high",
  med: "med", medium: "med", "!": "med", p2: "med",
  low: "low", p3: "low",
};

const DEFAULT_DUE_TIME = "23:59";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parses quick-add text like "cs61 lab report fri 11pm high".
 * - list: "#name" anywhere, or a leading word(s) matching a list name ("cs61" → "CS61")
 * - priority: a trailing word (high/med/low, !!!, p1–p3)
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
  return { title, due_at, priority, list_id };
}
