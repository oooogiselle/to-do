import { normalize } from "./text";


// Common course shorthand, so "PS3" matches "Problem Set 3" and "HW 2" matches "Homework 2".
const EXPAND: Record<string, string[]> = {
  ps: ["problem", "set"],
  pset: ["problem", "set"],
  psets: ["problem", "set"],
  hw: ["homework"],
  hwk: ["homework"],
  mt: ["midterm"],
  proj: ["project"],
  ch: ["chapter"],
  chap: ["chapter"],
  assn: ["assignment"],
  asst: ["assignment"],
  rdg: ["reading"],
};
const STOP = new Set(["the", "a", "an", "of", "and", "for", "on", "in", "to", "due"]);

export function titleTokens(title: string): Set<string> {
  const words = normalize(title)
    // Split "ps3" / "hw2" into letters and digits.
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    if (STOP.has(w)) continue;
    for (const t of EXPAND[w] ?? [w]) out.add(t.replace(/^0+(\d)/, "$1"));
  }
  return out;
}

const isNum = (t: string) => /^\d+$/.test(t);

export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  // Numbered items must agree on their numbers: "Problem Set 3" is not "Problem Set 4".
  const na = [...ta].filter(isNum).sort().join(",");
  const nb = [...tb].filter(isNum).sort().join(",");
  if (na && nb && na !== nb) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? inter / union : 0;
}

function sameTokens(a: string, b: string) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  return ta.size === tb.size && [...ta].every((t) => tb.has(t));
}

type Proposed = { title: string; due_at: string | null };
type Existing = { id: string; title: string; due_at: string | null };

export type ImportMatch =
  | { status: "new" }
  | { status: "same"; taskId: string }
  | {
      status: "changed";
      taskId: string;
      changes: { title?: [string, string]; due_at?: [string | null, string | null] };
    };

const sameDay = (a: string | null, b: string | null, dayOf: (iso: string) => string) =>
  !!a && !!b && dayOf(a) === dayOf(b);
const sameInstant = (a: string | null, b: string | null) =>
  a === b || (!!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 60_000);

/**
 * Matches proposed tasks against tasks already in the target list so a re-imported syllabus
 * offers updates instead of duplicates. Greedy one-to-one by best score. `dayOf` maps an
 * instant to its local calendar day.
 */
export function matchImport(
  proposed: Proposed[],
  existing: Existing[],
  dayOf: (iso: string) => string,
): { matches: ImportMatch[]; missing: Existing[] } {
  const pairs: { p: number; e: number; score: number }[] = [];
  proposed.forEach((p, pi) =>
    existing.forEach((e, ei) => {
      const sim = titleSimilarity(p.title, e.title);
      const day = sameDay(p.due_at, e.due_at, dayOf);
      if (sim >= 0.8 || (day && sim >= 0.5))
        pairs.push({ p: pi, e: ei, score: sim + (day ? 0.25 : 0) });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);

  const matches: ImportMatch[] = proposed.map(() => ({ status: "new" }));
  const usedP = new Set<number>();
  const usedE = new Set<number>();
  for (const { p, e } of pairs) {
    if (usedP.has(p) || usedE.has(e)) continue;
    usedP.add(p);
    usedE.add(e);
    const prop = proposed[p]!;
    const ex = existing[e]!;
    const changes: { title?: [string, string]; due_at?: [string | null, string | null] } = {};
    // Only a real rename counts: "PS 2" vs "Problem Set 2" is the same title in shorthand.
    if (!sameTokens(prop.title, ex.title)) changes.title = [ex.title, prop.title];
    if (!sameInstant(prop.due_at, ex.due_at)) changes.due_at = [ex.due_at, prop.due_at];
    matches[p] = Object.keys(changes).length
      ? { status: "changed", taskId: ex.id, changes }
      : { status: "same", taskId: ex.id };
  }
  return { matches, missing: existing.filter((_, i) => !usedE.has(i)) };
}
