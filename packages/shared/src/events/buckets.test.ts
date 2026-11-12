import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../schemas";
import { EVENT_BUCKET_MS, eventBucketOf, eventBuckets, mergeEvents } from "./buckets";

const iso = (s: string) => Date.parse(s);
const ev = (id: string, start: string, end: string): CalendarEvent => ({
  calendar_id: "cal",
  gcal_event_id: id,
  title: id,
  start: new Date(iso(start)).toISOString(),
  end: new Date(iso(end)).toISOString(),
  all_day: false,
  busy: true,
  color: null,
});

describe("eventBuckets", () => {
  it("aligns buckets to Monday 00:00 UTC", () => {
    const b = eventBucketOf(iso("2026-11-07T15:00:00Z")); // a Saturday
    expect(new Date(b).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(new Date(b).getUTCDay()).toBe(1);
  });

  it("puts an instant exactly on a boundary in the bucket it starts", () => {
    expect(eventBucketOf(iso("2026-11-09T00:00:00Z"))).toBe(iso("2026-11-09T00:00:00Z"));
    expect(eventBuckets(iso("2026-11-02T00:00:00Z"), iso("2026-11-09T00:00:00Z"))).toEqual([
      iso("2026-11-02T00:00:00Z"),
    ]);
  });

  it("covers a local week that crosses a bucket edge with two buckets", () => {
    // Sunday to Sunday in Los Angeles (UTC-8).
    const from = iso("2026-11-08T08:00:00Z");
    const to = from + EVENT_BUCKET_MS;
    expect(eventBuckets(from, to)).toEqual([iso("2026-11-02T00:00:00Z"), iso("2026-11-09T00:00:00Z")]);
  });

  it("returns nothing for an empty range", () => {
    const t = iso("2026-11-07T00:00:00Z");
    expect(eventBuckets(t, t)).toEqual([]);
  });
});

describe("mergeEvents", () => {
  it("keeps an event that crosses a bucket edge once", () => {
    const crossing = ev("late", "2026-11-08T23:00:00Z", "2026-11-09T01:00:00Z");
    const a = [ev("a", "2026-11-08T10:00:00Z", "2026-11-08T11:00:00Z"), crossing];
    const b = [crossing, ev("b", "2026-11-09T09:00:00Z", "2026-11-09T10:00:00Z")];
    const out = mergeEvents([a, b], iso("2026-11-08T00:00:00Z"), iso("2026-11-10T00:00:00Z"));
    expect(out.map((e) => e.gcal_event_id)).toEqual(["a", "late", "b"]);
  });

  it("drops events outside the range and sorts by start", () => {
    const out = mergeEvents(
      [[ev("in2", "2026-11-08T12:00:00Z", "2026-11-08T13:00:00Z"), ev("out", "2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z")],
       [ev("in1", "2026-11-08T07:00:00Z", "2026-11-08T08:30:00Z")]],
      iso("2026-11-08T08:00:00Z"),
      iso("2026-11-09T00:00:00Z"),
    );
    expect(out.map((e) => e.gcal_event_id)).toEqual(["in1", "in2"]);
  });

  it("treats the same id on different calendars as different events", () => {
    const x = ev("same", "2026-11-08T10:00:00Z", "2026-11-08T11:00:00Z");
    const out = mergeEvents([[x, { ...x, calendar_id: "other" }]], 0, Infinity);
    expect(out).toHaveLength(2);
  });
});
