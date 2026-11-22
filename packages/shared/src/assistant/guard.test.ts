import { describe, expect, it } from "vitest";
import { collectUrlKeys } from "../research";
import { claimsAction, guardText, hasDeleteIntent } from "./guard";

const names: Record<string, string> = { t3: "Essay 2", "t3.s1": "Outline", b2: "Essay 2 at 3pm" };
const opts = (allowedUrls: string[] = []) => ({ nameOf: (c: string) => names[c] ?? null, allowedUrlKeys: collectUrlKeys(allowedUrls) });

describe("guardText: codes", () => {
  it("replaces a bare code with its name", () => {
    const r = guardText("Start with t3 this morning.", opts());
    expect(r.text).toBe("Start with Essay 2 this morning.");
    expect(r.fired).toEqual(["code"]);
  });

  it("drops a bracketed code after the name", () => {
    expect(guardText("Do **Essay 2** (t3) first, then Outline [t3.s1].", opts()).text).toBe(
      "Do **Essay 2** first, then Outline.",
    );
  });

  it("names step and block codes", () => {
    expect(guardText("Move b2 and start t3.s1.", opts()).text).toBe("Move Essay 2 at 3pm and start Outline.");
  });

  it("leaves things that only look like codes", () => {
    const r = guardText("Take vitamin b12 and read t99.", opts());
    expect(r.text).toBe("Take vitamin b12 and read t99.");
    expect(r.fired).toEqual([]);
  });
});

describe("guardText: links", () => {
  it("removes a link that wasn't verified", () => {
    const r = guardText("Read https://made-up.example/guide for more.", opts());
    expect(r.text).toBe("Read for more.");
    expect(r.fired).toEqual(["url"]);
  });

  it("keeps a verified link, ignoring tracking params and www", () => {
    const r = guardText("See https://react.dev/learn?utm_source=x.", opts(["https://www.react.dev/learn"]));
    expect(r.text).toBe("See https://react.dev/learn?utm_source=x.");
    expect(r.fired).toEqual([]);
  });

  it("removes a bare www link", () => {
    expect(guardText("Try www.fake-site.com/page today.", opts()).text).toBe("Try today.");
  });

  it("turns a markdown link into its label", () => {
    const r = guardText("Check [the docs](https://made-up.example/x).", opts());
    expect(r.text).toBe("Check the docs.");
    expect(r.fired).toContain("markdown");
  });
});

describe("guardText: markdown", () => {
  it("strips headings and turns tables into bullets", () => {
    const r = guardText("## Plan\n| Task | Time |\n|---|---|\n| Essay | 2h |", opts());
    expect(r.text).toBe("Plan\n- Task · Time\n- Essay · 2h");
    expect(r.fired).toEqual(["markdown"]);
  });

  it("keeps bold and bullets", () => {
    const text = "**Essay** first.\n- Outline\n- Draft";
    expect(guardText(text, opts())).toEqual({ text, fired: [] });
  });
});

describe("claimsAction", () => {
  it.each(["I've added it to Thursday.", "I have scheduled your essay.", "I just moved it.", "I’ve booked 2pm."])(
    "catches %s",
    (t) => expect(claimsAction(t)).toBe(true),
  );
  it.each(["I'd add it to Thursday.", "Here's a plan you can add.", "I'd move it to 3pm."])("allows %s", (t) =>
    expect(claimsAction(t)).toBe(false),
  );
});

describe("hasDeleteIntent", () => {
  it.each(["delete the essay", "I don't need to do laundry", "get rid of gym", "I'm not doing the reading"])(
    "sees %s",
    (t) => expect(hasDeleteIntent(t)).toBe(true),
  );
  it.each(["plan my week", "move my 3pm", "clear Thursday afternoon", "what's due"])("not in %s", (t) =>
    expect(hasDeleteIntent(t)).toBe(false),
  );
});
