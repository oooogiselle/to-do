import { describe, expect, it } from "vitest";
import { groupByUser, planCronWork, runWithBudget, type CronSyncState } from "./cronPlan";

const MIN = 60_000;
const H = 60 * MIN;
const NOW = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const state = (calendar_id: string, p: Partial<CronSyncState> = {}): CronSyncState => ({
  user_id: "u1",
  calendar_id,
  last_synced_at: null,
  channel_id: null,
  channel_expires_at: null,
  ...p,
});
const cal = (calendar_id: string, user_id = "u1") => ({ user_id, calendar_id });

describe("planCronWork", () => {
  it("polls a calendar without a channel after 15 minutes", () => {
    const states = [
      state("fresh", { last_synced_at: iso(NOW - 10 * MIN) }),
      state("stale", { last_synced_at: iso(NOW - 20 * MIN) }),
    ];
    const work = planCronWork([cal("fresh"), cal("stale")], states, NOW, false);
    expect(work.map((w) => w.calendar_id)).toEqual(["stale"]);
    expect(work[0]).toMatchObject({ sync: true, watch: false });
  });

  it("polls a calendar with a live channel only every 6 hours", () => {
    const channel = { channel_id: "c", channel_expires_at: iso(NOW + 5 * 24 * H) };
    const states = [
      state("pushed", { ...channel, last_synced_at: iso(NOW - 2 * H) }),
      state("quiet", { ...channel, last_synced_at: iso(NOW - 7 * H) }),
    ];
    const work = planCronWork([cal("pushed"), cal("quiet")], states, NOW, true);
    expect(work.map((w) => w.calendar_id)).toEqual(["quiet"]);
    expect(work[0]).toMatchObject({ sync: true, watch: false });
  });

  it("treats an expired channel as no channel", () => {
    const states = [
      state("expired", {
        channel_id: "c",
        channel_expires_at: iso(NOW - MIN),
        last_synced_at: iso(NOW - 20 * MIN),
      }),
    ];
    expect(planCronWork([cal("expired")], states, NOW, true)[0]).toMatchObject({
      sync: true,
      watch: true,
    });
  });

  it("renews missing or expiring channels only when push is enabled", () => {
    const states = [
      state("expiring", {
        channel_id: "c",
        channel_expires_at: iso(NOW + 24 * H),
        last_synced_at: iso(NOW - MIN),
      }),
      state("missing", { last_synced_at: iso(NOW - MIN) }),
    ];
    const cals = [cal("expiring"), cal("missing")];
    expect(planCronWork(cals, states, NOW, true).map((w) => [w.calendar_id, w.sync, w.watch])).toEqual([
      ["expiring", false, true],
      ["missing", false, true],
    ]);
    expect(planCronWork(cals, states, NOW, false)).toEqual([]);
  });

  it("puts never-synced calendars first, then the oldest sync", () => {
    const states = [
      state("old", { last_synced_at: iso(NOW - 3 * H) }),
      state("older", { last_synced_at: iso(NOW - 5 * H) }),
    ];
    const work = planCronWork([cal("old"), cal("new"), cal("older")], states, NOW, false);
    expect(work.map((w) => w.calendar_id)).toEqual(["new", "older", "old"]);
  });

  it("matches state by user as well as calendar id", () => {
    const states = [state("primary", { user_id: "u1", last_synced_at: iso(NOW - MIN) })];
    const work = planCronWork([cal("primary", "u1"), cal("primary", "u2")], states, NOW, false);
    expect(work.map((w) => w.user_id)).toEqual(["u2"]);
  });
});

describe("groupByUser", () => {
  it("keeps the order of each user's first item", () => {
    const work = planCronWork(
      [cal("a", "u2"), cal("b", "u1"), cal("c", "u2")],
      [
        state("a", { user_id: "u2", last_synced_at: iso(NOW - 5 * H) }),
        state("b", { user_id: "u1", last_synced_at: iso(NOW - 4 * H) }),
        state("c", { user_id: "u2", last_synced_at: iso(NOW - 3 * H) }),
      ],
      NOW,
      false,
    );
    expect(groupByUser(work).map((g) => [g.user_id, g.items.map((i) => i.calendar_id)])).toEqual([
      ["u2", ["a", "c"]],
      ["u1", ["b"]],
    ]);
  });
});

describe("runWithBudget", () => {
  it("runs at most `concurrency` units at once", async () => {
    let running = 0;
    let peak = 0;
    const res = await runWithBudget(
      [1, 2, 3, 4, 5, 6, 7],
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      },
      { concurrency: 3, deadline: Infinity },
    );
    expect(peak).toBe(3);
    expect(res).toEqual({ started: 7, skipped: 0 });
  });

  it("stops starting units after the deadline and lets running ones finish", async () => {
    let clock = 0;
    const finished: number[] = [];
    const res = await runWithBudget(
      [1, 2, 3, 4, 5],
      async (n) => {
        clock += 10; // each unit takes 10 "ms"
        finished.push(n);
      },
      { concurrency: 1, deadline: 25, now: () => clock },
    );
    expect(finished).toEqual([1, 2, 3]);
    expect(res).toEqual({ started: 3, skipped: 2 });
  });

  it("keeps going when a unit throws", async () => {
    const done: number[] = [];
    const res = await runWithBudget(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error("boom");
        done.push(n);
      },
      { concurrency: 1, deadline: Infinity },
    );
    expect(done).toEqual([1, 3]);
    expect(res).toEqual({ started: 3, skipped: 0 });
  });
});
