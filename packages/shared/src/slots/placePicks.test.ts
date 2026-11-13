import { describe, expect, it } from "vitest";
import { placePicks, type PickRequest, type PlacePrefs, type PlanDay } from "./placePicks";

const TZ = "UTC";
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00.000Z`);
const iso = (date: string, hhmm: string) => new Date(at(date, hhmm)).toISOString();
const D1 = "2026-11-16";
const D2 = "2026-11-17";
const D3 = "2026-11-18";

/** 09:00-17:00 free on each day, nothing booked. */
const workday = (date: string, free?: [string, string][]): PlanDay => ({
  date,
  free: (free ?? [["09:00", "17:00"]]).map(([s, e]) => ({ start: at(date, s), end: at(date, e) })),
  bookedMin: 0,
});
const known = new Map([
  ["a", new Set(["a1", "a2"])],
  ["b", new Set<string>()],
  ["c", new Set<string>()],
]);
const prefs: PlacePrefs = { max_session_min: 120, break_min: 0 };
const pick = (task_id: string, over: Partial<PickRequest> = {}): PickRequest => ({
  task_id,
  step_id: null,
  date: null,
  when: "any",
  duration_min: 60,
  reason: " because ",
  ...over,
});
const run = (picks: PickRequest[], over: Partial<Parameters<typeof placePicks>[0]> = {}) =>
  placePicks({
    picks,
    days: [workday(D1), workday(D2), workday(D3)],
    known,
    dueOf: new Map(),
    prefs,
    now: at(D1, "08:00"),
    timezone: TZ,
    ...over,
  });
const spans = (r: ReturnType<typeof placePicks>) => r.placed.map((p) => [p.task_id, p.start, p.end]);

describe("placePicks", () => {
  it("places the earliest fit, rounded to quarter hours, and trims the reason", () => {
    const r = run([pick("a", { duration_min: 50 })]);
    expect(r.placed).toEqual([
      { task_id: "a", step_id: null, start: iso(D1, "09:00"), end: iso(D1, "10:00"), reason: "because" },
    ]);
    expect(r.unplaced).toEqual([]);
  });

  it("never overlaps, and keeps the break between placed blocks", () => {
    const r = run([pick("a"), pick("b")], { prefs: { ...prefs, break_min: 10 } });
    expect(spans(r)).toEqual([
      ["a", iso(D1, "09:00"), iso(D1, "10:00")],
      ["b", iso(D1, "10:15"), iso(D1, "11:15")],
    ]);
  });

  it("starts from now, not the start of today's free time", () => {
    const r = run([pick("a")], { now: at(D1, "13:07") });
    expect(spans(r)).toEqual([["a", iso(D1, "13:15"), iso(D1, "14:15")]]);
  });

  it("puts a window pick inside the window, and falls back to the day when it's full", () => {
    const r = run([
      pick("a", { when: "afternoon" }),
      pick("b", { when: "evening", date: D1 }), // no evening free time on D1
    ]);
    expect(spans(r)).toEqual([
      ["b", iso(D1, "09:00"), iso(D1, "10:00")],
      ["a", iso(D1, "12:00"), iso(D1, "13:00")],
    ]);
  });

  it("starts an HH:MM pick as close to that time as fits", () => {
    const day = workday(D1, [
      ["09:00", "14:30"],
      ["15:30", "17:00"],
    ]);
    const r = run([pick("a", { when: "15:00", date: D1 })], { days: [day] });
    expect(spans(r)).toEqual([["a", iso(D1, "15:30"), iso(D1, "16:30")]]);
  });

  it("puts longer work without a time in the focus window", () => {
    const r = run([pick("a", { duration_min: 90 }), pick("b", { duration_min: 30 })], {
      prefs: { ...prefs, focus: "afternoon" },
    });
    expect(spans(r)).toEqual([
      ["b", iso(D1, "09:00"), iso(D1, "09:30")],
      ["a", iso(D1, "12:00"), iso(D1, "13:30")],
    ]);
  });

  it("caps a block at the longest session", () => {
    const r = run([pick("a", { duration_min: 300 })], { prefs: { ...prefs, max_session_min: 90 } });
    expect(spans(r)).toEqual([["a", iso(D1, "09:00"), iso(D1, "10:30")]]);
  });

  it("ends work before an upcoming due date, and reports what can't fit", () => {
    const dueOf = new Map([["a", at(D1, "10:30")], ["b", at(D1, "09:20")]]);
    const r = run([pick("a", { duration_min: 120 }), pick("b")], { dueOf });
    // a: only 09:00-10:30 is before its due date, so the block is trimmed to fit.
    expect(spans(r)).toEqual([["a", iso(D1, "09:00"), iso(D1, "10:30")]]);
    expect(r.unplaced).toEqual([{ task_id: "b", step_id: null, reason: "no_time_before_due" }]);
  });

  it("lets overdue work go anywhere", () => {
    const r = run([pick("a", { date: D2 })], { dueOf: new Map([["a", at(D1, "07:00")]]) });
    expect(spans(r)).toEqual([["a", iso(D2, "09:00"), iso(D2, "10:00")]]);
  });

  it("keeps each day under the daily cap, counting blocks already booked", () => {
    const days = [{ ...workday(D1), bookedMin: 300 }, workday(D2)];
    const r = run([pick("a", { duration_min: 120 }), pick("b", { duration_min: 120 })], {
      days,
      prefs: { ...prefs, daily_cap_min: 420 },
    });
    // D1 has 120 min of cap left: a takes it, b moves to D2.
    expect(spans(r)).toEqual([
      ["a", iso(D1, "09:00"), iso(D1, "11:00")],
      ["b", iso(D2, "09:00"), iso(D2, "11:00")],
    ]);
  });

  it("spreads repeated picks of the same task over days", () => {
    const r = run([pick("a", { duration_min: 90 }), pick("a", { duration_min: 90 }), pick("a", { duration_min: 90 })]);
    expect(r.placed.map((p) => p.start.slice(0, 10))).toEqual([D1, D2, D3]);
  });

  it("fits several sessions of one task on a day that was asked for, with the break between", () => {
    const r = run([pick("a", { date: D2, duration_min: 90 }), pick("a", { date: D2, duration_min: 90 })], {
      prefs: { ...prefs, break_min: 10 },
    });
    expect(spans(r)).toEqual([
      ["a", iso(D2, "09:00"), iso(D2, "10:30")],
      ["a", iso(D2, "10:45"), iso(D2, "12:15")],
    ]);
  });

  it("only blames the due date when it falls inside the days tried", () => {
    const full = workday(D1, [["09:00", "09:30"]]);
    const dueOf = new Map([["a", at(D2, "12:00")]]);
    const r = run([pick("a", { date: D1 }), pick("a", { date: D1 }), pick("a", { date: D1 })], {
      days: [full, workday(D2)],
      dueOf,
    });
    // D1 holds one 30-minute block; the rest don't fit that day, and the due date (D2) isn't why.
    expect(r.placed).toHaveLength(1);
    expect(r.unplaced.map((u) => u.reason)).toEqual(["no_time", "no_time"]);
  });

  it("trims to the longest gap of 30+ minutes when the whole length fits nowhere", () => {
    const day = workday(D1, [
      ["09:00", "09:20"],
      ["13:00", "13:45"],
    ]);
    const r = run([pick("a", { duration_min: 120, date: D1 })], { days: [day] });
    expect(spans(r)).toEqual([["a", iso(D1, "13:00"), iso(D1, "13:45")]]);
  });

  it("reports a pick for a day that isn't in the plan as unplaced", () => {
    const r = run([pick("a", { date: "2026-12-01" })]);
    expect(r.placed).toEqual([]);
    expect(r.unplaced).toEqual([{ task_id: "a", step_id: null, reason: "no_time" }]);
  });

  it("drops picks for tasks that weren't offered, and steps that aren't the task's", () => {
    const r = run([pick("zzz"), pick("b", { step_id: "a1" }), pick("a", { step_id: "a2" })]);
    expect(r.placed.map((p) => [p.task_id, p.step_id])).toEqual([
      ["b", null],
      ["a", "a2"],
    ]);
  });

  it("stops at the maximum number of blocks", () => {
    const picks = Array.from({ length: 12 }, () => pick("a", { duration_min: 30 }));
    expect(run(picks, { max: 2 }).placed).toHaveLength(2);
  });
});
