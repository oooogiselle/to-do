import { describe, expect, it } from "vitest";
import type { Settings, SyncResponse, Task } from "../schemas";
import { mergeSync } from "./merge";

// Only the fields mergeSync looks at matter; the rest are filled loosely.
const task = (id: string, title: string, deleted = false) =>
  ({ id, title, updated_at: "2026-11-20T10:00:00+00:00", deleted_at: deleted ? "2026-11-20T10:00:00+00:00" : null }) as Task;

const settings = (timezone: string) => ({ timezone }) as Settings;

const snap = (over: Partial<SyncResponse> = {}): SyncResponse => ({
  cursor: "2026-11-20T10:00:00+00:00",
  lists: [],
  tasks: [],
  steps: [],
  time_blocks: [],
  day_plan_items: [],
  settings: null,
  ...over,
});

describe("mergeSync", () => {
  it("replaces changed rows with the server's copy and adds new ones, keeping order", () => {
    const prev = snap({ tasks: [task("a", "A"), task("b", "B")] });
    const delta = snap({ tasks: [task("b", "B2"), task("c", "C")] });
    expect(mergeSync(prev, delta).tasks.map((t) => [t.id, t.title])).toEqual([
      ["a", "A"],
      ["b", "B2"],
      ["c", "C"],
    ]);
  });

  it("drops rows the delta reports deleted, and never adds deleted ones", () => {
    const prev = snap({ tasks: [task("a", "A"), task("b", "B")] });
    const delta = snap({ tasks: [task("a", "A", true), task("z", "Z", true)] });
    expect(mergeSync(prev, delta).tasks.map((t) => t.id)).toEqual(["b"]);
  });

  it("keeps optimistic temp rows the server hasn't seen", () => {
    const prev = snap({ tasks: [task("temp-1", "New")] });
    const delta = snap({ tasks: [task("a", "A")] });
    expect(mergeSync(prev, delta).tasks.map((t) => t.id)).toEqual(["temp-1", "a"]);
  });

  it("keeps settings when the delta has none and takes them when it does", () => {
    const prev = snap({ settings: settings("America/New_York") });
    expect(mergeSync(prev, snap()).settings?.timezone).toBe("America/New_York");
    expect(mergeSync(prev, snap({ settings: settings("Asia/Tokyo") })).settings?.timezone).toBe(
      "Asia/Tokyo",
    );
  });

  it("never moves the cursor backwards", () => {
    const prev = snap({ cursor: "2026-11-20T10:00:05.5+00:00" });
    expect(mergeSync(prev, snap({ cursor: "2026-11-20T10:00:01+00:00" })).cursor).toBe(prev.cursor);
    expect(mergeSync(prev, snap({ cursor: "2026-11-20T10:00:06+00:00" })).cursor).toBe(
      "2026-11-20T10:00:06+00:00",
    );
  });

  it("gives the same result when a delta is applied twice (overlapping fetches)", () => {
    const prev = snap({ tasks: [task("a", "A")] });
    const delta = snap({ tasks: [task("a", "A2"), task("b", "B"), task("c", "C", true)] });
    const once = mergeSync(prev, delta);
    expect(mergeSync(once, delta)).toEqual(once);
  });

  it("keeps extra client-only fields on the snapshot", () => {
    const prev = { ...snap(), full_at: "2026-11-20T09:00:00Z" };
    expect(mergeSync(prev, snap()).full_at).toBe("2026-11-20T09:00:00Z");
  });

  it("leaves untouched collections as the same array", () => {
    const prev = snap({ tasks: [task("a", "A")] });
    expect(mergeSync(prev, snap()).tasks).toBe(prev.tasks);
  });
});
