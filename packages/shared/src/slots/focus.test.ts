import { describe, expect, it } from "vitest";
import type { RawPick } from "./normalizePicks";
import { ensurePressingFirst, isPressing, keepFocus, matchesFocus, pastDate, taskKind } from "./focus";

const H = 3_600_000;
const T0 = Date.parse("2026-11-05T15:00:00Z");
const gap = { start: T0, end: T0 + 90 * 60_000 };
const pick = (task_id: string): RawPick => ({
  task_id,
  step_id: null,
  offset_min: 30,
  duration_min: 30,
  reason: "why",
});
const reason = () => "Due soon";

describe("taskKind", () => {
  it("sorts someday items by idea_kind, plain ideas count as build", () => {
    expect(taskKind({ idea_kind: "learn", repeat: "none" }, "someday")).toBe("learn");
    expect(taskKind({ idea_kind: "people", repeat: "none" }, "someday")).toBe("people");
    expect(taskKind({ idea_kind: "goal", repeat: "none" }, "someday")).toBe("build");
    expect(taskKind({ idea_kind: null, repeat: "none" }, "someday")).toBe("build");
  });

  it("treats repeating tasks as personal and the rest as assignments", () => {
    expect(taskKind({ idea_kind: null, repeat: "daily" }, "normal")).toBe("personal");
    expect(taskKind({ idea_kind: null, repeat: "none" }, "normal")).toBe("assignment");
    expect(taskKind({ idea_kind: null, repeat: "none" }, undefined)).toBe("assignment");
  });
});

describe("matchesFocus", () => {
  it("lets people cover personal routines too", () => {
    expect(matchesFocus("personal", "people")).toBe(true);
    expect(matchesFocus("personal", "assignments")).toBe(false);
    expect(matchesFocus("build", undefined)).toBe(true);
    expect(matchesFocus("learn", "build")).toBe(false);
  });
});

describe("isPressing", () => {
  const NOW = T0 - 24 * H; // the gap is tomorrow
  const t = (o: Partial<Parameters<typeof isPressing>[0]>) => ({
    kind: "assignment" as const,
    due_at: new Date(T0 + 24 * H).toISOString(),
    remainingMin: 60,
    ...o,
  });
  const due = (ms: number) => new Date(ms).toISOString();

  it("is true for assignments due within 48h after the gap with work left", () => {
    expect(isPressing(t({}), T0, NOW)).toBe(true);
    expect(isPressing(t({ due_at: due(T0 + 49 * H) }), T0, NOW)).toBe(false);
    expect(isPressing(t({ remainingMin: 0 }), T0, NOW)).toBe(false);
    expect(isPressing(t({ due_at: null }), T0, NOW)).toBe(false);
    expect(isPressing(t({ kind: "build" }), T0, NOW)).toBe(false);
  });

  it("skips deadlines that pass between now and the gap", () => {
    expect(isPressing(t({ due_at: due(NOW + 5 * H) }), T0, NOW)).toBe(false);
  });

  it("keeps recently overdue work pressing, but not stale overdue work", () => {
    expect(isPressing(t({ due_at: due(NOW - 2 * 24 * H) }), T0, NOW)).toBe(true);
    expect(isPressing(t({ due_at: due(NOW - 4 * 24 * H) }), T0, NOW)).toBe(false);
  });
});

describe("keepFocus", () => {
  it("allows only the first pick outside the focus", () => {
    const inFocus = (id: string) => id.startsWith("f");
    const out = keepFocus([pick("urgent"), pick("f1"), pick("urgent2"), pick("f2")], inFocus);
    expect(out.map((p) => p.task_id)).toEqual(["urgent", "f1", "f2"]);
  });
});

describe("ensurePressingFirst", () => {
  const soon = { task_id: "a", due_at: new Date(T0 + 5 * H).toISOString(), remainingMin: 120 };
  const later = { task_id: "b", due_at: new Date(T0 + 30 * H).toISOString(), remainingMin: 20 };

  it("moves the most urgent task to the front when the AI picked it", () => {
    const out = ensurePressingFirst([pick("x"), pick("a")], [later, soon], gap, { reason });
    expect(out.map((p) => p.task_id)).toEqual(["a", "x"]);
    expect(out[0]?.reason).toBe("why");
  });

  it("adds a block at the start of the gap when the AI left it out", () => {
    const out = ensurePressingFirst([pick("x")], [soon], gap, { reason });
    expect(out.map((p) => p.task_id)).toEqual(["a", "x"]);
    expect(out[0]).toMatchObject({ offset_min: 0, duration_min: 60, reason: "Due soon" });
  });

  it("sizes the added block to the work left", () => {
    const out = ensurePressingFirst([], [later], gap, { reason });
    expect(out[0]?.duration_min).toBe(15);
  });

  it("doesn't force a task the user already turned down", () => {
    const out = ensurePressingFirst([pick("x")], [soon], gap, { reason, exclude: new Set(["a"]) });
    expect(out.map((p) => p.task_id)).toEqual(["x"]);
  });

  it("leaves picks alone when nothing is pressing", () => {
    expect(ensurePressingFirst([pick("x")], [], gap, { reason })).toEqual([pick("x")]);
  });
});

describe("pastDate", () => {
  const tz = "America/New_York";
  it("accepts real dates up to today", () => {
    expect(pastDate("2026-11-03", T0, tz)).toBe("2026-11-03");
    expect(pastDate("2026-11-05", T0, tz)).toBe("2026-11-05");
  });
  it("rejects future, impossible, malformed and very old dates", () => {
    expect(pastDate("2026-11-06", T0, tz)).toBeNull();
    expect(pastDate("2026-02-30", T0, tz)).toBeNull();
    expect(pastDate("Tuesday", T0, tz)).toBeNull();
    expect(pastDate("2024-01-01", T0, tz)).toBeNull();
  });
});
