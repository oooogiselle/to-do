import { describe, expect, it } from "vitest";
import { chunkText } from "./chunkText";
import { locateQuote } from "./text";
import { mergeExtracted } from "./mergeExtracted";
import { toDueAt } from "./toDueAt";
import { matchImport, titleSimilarity } from "./matchImport";
import { localDate } from "../time";

describe("chunkText", () => {
  it("returns short text as one chunk", () => {
    expect(chunkText("hello", 100)).toEqual([{ text: "hello", offset: 0 }]);
  });

  it("splits on paragraphs, keeps offsets, and overlaps one paragraph", () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} `.repeat(4).trim());
    const text = paras.join("\n\n");
    const chunks = chunkText(text, 250);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(250);
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    }
    // Every paragraph appears in some chunk, and consecutive chunks share a paragraph.
    for (const p of paras) expect(chunks.some((c) => c.text.includes(p))).toBe(true);
    const lastOfFirst = chunks[0]!.text.split("\n\n").at(-1)!;
    expect(chunks[1]!.text.startsWith(lastOfFirst)).toBe(true);
  });

  it("splits a single huge paragraph at sentence ends", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(text, 200);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(200);
      expect(c.text.trimEnd().endsWith(".")).toBe(true);
    }
    expect(chunks.map((c) => c.text).join("")).toBe(text);
  });
});

describe("locateQuote", () => {
  const source = "Hi team,\n\nPlease  EMAIL the prof\nre: extension by Friday. Thanks!";
  it("ignores case, punctuation and line breaks", () => {
    const r = locateQuote(source, "email the prof re extension");
    expect(r).not.toBeNull();
    expect(source.slice(r!.start, r!.end)).toBe("EMAIL the prof\nre: extension");
  });
  it("returns null when the quote isn't there", () => {
    expect(locateQuote(source, "buy poster board")).toBeNull();
  });
});

describe("mergeExtracted", () => {
  it("dedupes overlap copies, preferring a certain date then a longer quote", () => {
    const merged = mergeExtracted([
      { title: "Lab 3", due_date: "2026-10-16", date_certain: false, source_quote: "lab 3", n: 1 },
      { title: "Email prof", due_date: null, date_certain: true, source_quote: "email", n: 2 },
      { title: "lab  3!", due_date: "2026-10-16", date_certain: true, source_quote: "lab", n: 3 },
      {
        title: "Email prof",
        due_date: null,
        date_certain: true,
        source_quote: "email prof re ext",
        n: 4,
      },
    ]);
    expect(merged.map((m) => m.n)).toEqual([3, 4]);
  });
});

describe("toDueAt", () => {
  const opts = {
    timezone: "America/New_York",
    now: Date.parse("2026-10-12T14:00:00Z"),
    allowPast: false,
  };
  it("defaults to 11:59pm local when there's no time", () => {
    expect(toDueAt("2026-10-16", null, opts)).toEqual({
      due_at: "2026-10-17T03:59:00.000Z",
      has_time: false,
      suspicious: null,
    });
  });
  it("uses the time and handles the DST change", () => {
    expect(toDueAt("2026-11-02", "09:30", opts).due_at).toBe("2026-11-02T14:30:00.000Z");
  });
  it("flags past, far-future and unreadable dates", () => {
    expect(toDueAt("2026-10-01", null, opts).suspicious).toMatch(/past/);
    expect(toDueAt("2026-10-01", null, { ...opts, allowPast: true }).suspicious).toBeNull();
    expect(toDueAt("2028-01-01", null, opts).suspicious).toMatch(/year/);
    expect(toDueAt("Oct 16", null, opts)).toMatchObject({
      due_at: null,
      suspicious: expect.stringMatching(/read/),
    });
  });
});

describe("matchImport", () => {
  const tz = "America/New_York";
  const dayOf = (iso: string) => localDate(new Date(iso), tz);
  const existing = [
    { id: "ps3", title: "Problem Set 3", due_at: "2026-10-03T03:59:00.000Z" },
    { id: "ps4", title: "Problem Set 4", due_at: "2026-10-10T03:59:00.000Z" },
    { id: "mid", title: "Midterm 1", due_at: "2026-10-14T18:00:00.000Z" },
    { id: "read", title: "Read chapter 5", due_at: null },
  ];

  it("treats shorthand as the same title but keeps numbers distinct", () => {
    expect(titleSimilarity("PS3", "Problem Set 3")).toBe(1);
    expect(titleSimilarity("HW 2", "homework 2")).toBe(1);
    expect(titleSimilarity("Problem Set 3", "Problem Set 4")).toBe(0);
  });

  it("finds unchanged, re-dated and renamed tasks, and reports missing ones", () => {
    const { matches, missing } = matchImport(
      [
        { title: "PS 3", due_at: "2026-10-03T03:59:00.000Z" }, // same task, same date
        { title: "Problem Set 4", due_at: "2026-10-12T03:59:00.000Z" }, // moved
        { title: "Midterm 1 (in class)", due_at: "2026-10-14T18:00:00.000Z" }, // renamed, same day
        { title: "Problem Set 5", due_at: "2026-10-17T03:59:00.000Z" }, // new
      ],
      existing,
      dayOf,
    );
    // Shorthand for the same title isn't a rename.
    expect(matches[0]).toEqual({ status: "same", taskId: "ps3" });
    expect(matches[1]).toEqual({
      status: "changed",
      taskId: "ps4",
      changes: { due_at: ["2026-10-10T03:59:00.000Z", "2026-10-12T03:59:00.000Z"] },
    });
    expect(matches[2]).toMatchObject({
      status: "changed",
      taskId: "mid",
      changes: { title: ["Midterm 1", "Midterm 1 (in class)"] },
    });
    expect(matches[3]).toEqual({ status: "new" });
    expect(missing.map((m) => m.id)).toEqual(["read"]);
  });

  it("marks exact repeats as the same and never matches one task twice", () => {
    const { matches } = matchImport(
      [
        { title: "Problem Set 3", due_at: "2026-10-03T03:59:00.000Z" },
        { title: "Problem set 3", due_at: "2026-10-03T03:59:00.000Z" },
      ],
      existing,
      dayOf,
    );
    expect(matches).toEqual([{ status: "same", taskId: "ps3" }, { status: "new" }]);
  });
});
