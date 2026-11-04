import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";

const lists = [
  { id: "cs61", name: "CS61" },
  { id: "personal", name: "Personal" },
  { id: "rec", name: "Recruiting" },
  { id: "ml", name: "Machine Learning" },
];
// Monday 2026-10-12 10:00 in New York.
const opts = { lists, now: new Date("2026-10-12T14:00:00Z"), timezone: "America/New_York" };

describe("parseQuickAdd", () => {
  it("parses the spec example", () => {
    expect(parseQuickAdd("cs61 lab report fri 11pm high", opts)).toEqual({
      title: "lab report",
      list_id: "cs61",
      priority: "high",
      due_at: "2026-10-17T03:00:00.000Z", // Fri 16th 11pm EDT
      repeat: "none",
      repeat_days: [],
    });
  });

  it("defaults a date without a time to 11:59pm local", () => {
    const r = parseQuickAdd("call mom tomorrow", opts);
    expect(r.title).toBe("call mom");
    expect(r.due_at).toBe("2026-10-14T03:59:00.000Z");
    expect(r.list_id).toBeNull();
  });

  it("uses the settings timezone, not the device's", () => {
    const r = parseQuickAdd("essay oct 20 5pm", { ...opts, timezone: "America/Los_Angeles" });
    expect(r.due_at).toBe("2026-10-21T00:00:00.000Z");
  });

  it("supports #list tags and multi-word list names", () => {
    expect(parseQuickAdd("follow up with Jane #recruiting", opts).list_id).toBe("rec");
    const r = parseQuickAdd("machine learning pset 3 !!", opts);
    expect(r).toMatchObject({ list_id: "ml", title: "pset 3", priority: "high" });
  });

  it("leaves a title that is only a list name alone", () => {
    expect(parseQuickAdd("personal", opts)).toMatchObject({ title: "personal", list_id: null });
  });

  it("does not treat priority words mid-title as priority", () => {
    const r = parseQuickAdd("high school transcript request", opts);
    expect(r).toMatchObject({ title: "high school transcript request", priority: "none" });
  });

  it("returns no due date when there is none", () => {
    expect(parseQuickAdd("buy stamps", opts)).toEqual({
      title: "buy stamps",
      due_at: null,
      priority: "none",
      list_id: null,
      repeat: "none",
      repeat_days: [],
    });
  });
});

describe("parseQuickAdd repeats", () => {
  it("reads daily and every day", () => {
    expect(parseQuickAdd("take vitamins daily", opts)).toMatchObject({
      title: "take vitamins",
      repeat: "daily",
      due_at: null,
    });
    expect(parseQuickAdd("journal every day", opts)).toMatchObject({
      title: "journal",
      repeat: "daily",
    });
  });

  it("reads weekdays", () => {
    expect(parseQuickAdd("standup notes every weekday", opts)).toMatchObject({
      title: "standup notes",
      repeat: "weekdays",
    });
    expect(parseQuickAdd("inbox zero weekdays", opts)).toMatchObject({ repeat: "weekdays" });
  });

  it("reads named days, and doesn't mistake them for a due date", () => {
    const r = parseQuickAdd("gym every mon, wed and fri", opts);
    expect(r).toMatchObject({ title: "gym", repeat: "custom", repeat_days: [1, 3, 5], due_at: null });
    expect(parseQuickAdd("laundry every sunday", opts)).toMatchObject({
      title: "laundry",
      repeat: "custom",
      repeat_days: [0],
    });
  });

  it("still reads a list, priority and the title around a repeat", () => {
    expect(parseQuickAdd("personal stretch every day high", opts)).toMatchObject({
      title: "stretch",
      list_id: "personal",
      priority: "high",
      repeat: "daily",
    });
  });

  it("doesn't treat words that merely start like a day as one", () => {
    const r = parseQuickAdd("check monitor every monitor", opts);
    expect(r.repeat).toBe("none");
  });

  it("leaves a plain 'every' phrase that isn't a schedule alone", () => {
    expect(parseQuickAdd("call every client", opts)).toMatchObject({
      title: "call every client",
      repeat: "none",
    });
  });
});
