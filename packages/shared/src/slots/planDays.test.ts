import { describe, expect, it } from "vitest";
import type { WorkingHours } from "../schemas";
import { buildPlanDays, schedulingPrefs } from "./planDays";

const TZ = "UTC";
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00.000Z`);
const iso = (date: string, hhmm: string) => new Date(at(date, hhmm)).toISOString();
const MON = "2026-11-16";
const TUE = "2026-11-17";
const nineToFive = { start: "09:00", end: "17:00" };
const hours: WorkingHours = { "0": null, "1": nineToFive, "2": nineToFive, "3": nineToFive, "4": nineToFive, "5": nineToFive, "6": null };
const span = (date: string, s: string, e: string) => ({ start: at(date, s), end: at(date, e) });

const build = (over: Partial<Parameters<typeof buildPlanDays>[0]> = {}) =>
  buildPlanDays({
    events: [],
    blocks: [],
    workingHours: hours,
    timezone: TZ,
    now: at(MON, "08:00"),
    days: 2,
    breakMin: 0,
    ...over,
  });

describe("buildPlanDays", () => {
  it("covers today and the following days, inside working hours", () => {
    const days = build();
    expect(days.map((d) => d.date)).toEqual([MON, TUE]);
    expect(days[0]!.free).toEqual([span(MON, "09:00", "17:00")]);
    expect(days[1]!.free).toEqual([span(TUE, "09:00", "17:00")]);
  });

  it("starts today at now", () => {
    const [today] = build({ now: at(MON, "13:00") });
    expect(today!.free).toEqual([span(MON, "13:00", "17:00")]);
  });

  it("keeps a break around events and blocks, and ignores all-day and free events", () => {
    const [today] = build({
      breakMin: 15,
      events: [
        { start: iso(MON, "10:00"), end: iso(MON, "11:00") },
        { start: iso(MON, "00:00"), end: iso(TUE, "00:00"), all_day: true },
        { start: iso(MON, "15:00"), end: iso(MON, "16:00"), busy: false },
      ],
      blocks: [{ start: iso(MON, "13:00"), end: iso(MON, "14:00") }],
    });
    expect(today!.free).toEqual([
      span(MON, "09:00", "09:45"),
      span(MON, "11:15", "12:45"),
      span(MON, "14:15", "17:00"),
    ]);
  });

  it("counts booked minutes per day, splitting a block across midnight", () => {
    const days = build({ blocks: [{ start: iso(MON, "23:00"), end: iso(TUE, "01:00") }, { start: iso(TUE, "09:00"), end: iso(TUE, "09:30") }] });
    expect(days.map((d) => d.bookedMin)).toEqual([60, 90]);
  });
});

describe("schedulingPrefs", () => {
  it("fills in defaults and keeps what's set", () => {
    expect(schedulingPrefs({})).toEqual({ focus: undefined, max_session_min: 120, break_min: 10, daily_cap_min: undefined });
    expect(schedulingPrefs({ focus: "morning", max_session_min: 90, break_min: 0, daily_cap_min: 300 })).toEqual({
      focus: "morning",
      max_session_min: 90,
      break_min: 0,
      daily_cap_min: 300,
    });
  });

  it("falls back to defaults for bad input", () => {
    expect(schedulingPrefs(null).max_session_min).toBe(120);
    expect(schedulingPrefs({ max_session_min: 5 }).max_session_min).toBe(120);
  });
});
