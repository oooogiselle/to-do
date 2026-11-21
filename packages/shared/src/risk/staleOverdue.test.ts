import { describe, expect, it } from "vitest";
import { isStaleOverdue } from "./staleOverdue";

const DAY = 86_400_000;
const now = Date.parse("2026-11-21T12:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const task = (over: Partial<Parameters<typeof isStaleOverdue>[0]> = {}) => ({
  status: "open" as const,
  due_at: ago(4),
  overdue_kept_due: null,
  repeat: "none" as const,
  repeat_days: [],
  ...over,
});

describe("isStaleOverdue", () => {
  it("asks about to-dos more than 3 days late", () => {
    expect(isStaleOverdue(task(), now)).toBe(true);
  });
  it("leaves recently overdue work alone", () => {
    expect(isStaleOverdue(task({ due_at: ago(2) }), now)).toBe(false);
    expect(isStaleOverdue(task({ due_at: ago(3) }), now)).toBe(false);
  });
  it("stops asking once kept at that due date, in any format", () => {
    const due = "2026-11-16T23:59:00+00:00";
    expect(
      isStaleOverdue(task({ due_at: due, overdue_kept_due: "2026-11-16T23:59:00.000Z" }), now),
    ).toBe(false);
  });
  it("asks again when a new due date lapses", () => {
    expect(isStaleOverdue(task({ due_at: ago(4), overdue_kept_due: ago(10) }), now)).toBe(true);
  });
  it("skips done, repeating and undated to-dos", () => {
    expect(isStaleOverdue(task({ status: "done" }), now)).toBe(false);
    expect(isStaleOverdue(task({ repeat: "daily" }), now)).toBe(false);
    expect(isStaleOverdue(task({ due_at: null }), now)).toBe(false);
  });
});
