import { describe, expect, it } from "vitest";
import { verifyResources, type RawResource } from "./research";

const res = (url: string, extra: Partial<RawResource> = {}): RawResource => ({
  title: "A page",
  url,
  kind: "article",
  note: "Worth a look",
  minutes: null,
  ...extra,
});

const searchBlock = (...urls: string[]) => ({
  type: "web_search_tool_result",
  content: urls.map((url) => ({ type: "web_search_result", url, title: "t" })),
});

describe("verifyResources", () => {
  it("keeps links that came back in a search", () => {
    const out = verifyResources([res("https://example.com/guide")], [searchBlock("https://example.com/guide")]);
    expect(out.map((r) => r.url)).toEqual(["https://example.com/guide"]);
  });

  it("drops made-up links", () => {
    const out = verifyResources(
      [res("https://example.com/guide"), res("https://invented.dev/page")],
      [searchBlock("https://example.com/guide")],
    );
    expect(out.map((r) => r.url)).toEqual(["https://example.com/guide"]);
  });

  it("matches links that differ only by www, tracking params or a trailing slash", () => {
    const out = verifyResources(
      [res("https://www.example.com/guide/?utm_source=x")],
      [searchBlock("https://example.com/guide")],
    );
    expect(out).toHaveLength(1);
  });

  it("finds links inside nested blocks and strings", () => {
    const blocks = [{ type: "code_execution_result", stdout: "see https://docs.example.org/a, then" }];
    expect(verifyResources([res("https://docs.example.org/a")], blocks)).toHaveLength(1);
  });

  it("drops skipped links (the item's own) and duplicates", () => {
    const blocks = [searchBlock("https://own.com/x", "https://a.com/1")];
    const out = verifyResources(
      [res("https://own.com/x"), res("https://a.com/1"), res("https://a.com/1/")],
      blocks,
      { skip: ["https://own.com/x", null] },
    );
    expect(out.map((r) => r.url)).toEqual(["https://a.com/1"]);
  });

  it("accepts links verified in earlier turns", () => {
    const out = verifyResources([res("https://earlier.com/a")], [], { trusted: ["https://earlier.com/a"] });
    expect(out).toHaveLength(1);
  });

  it("tidies fields and caps the count", () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://a.com/${i}`);
    const out = verifyResources(
      urls.map((u) => res(u, { title: "  ", minutes: -3 })),
      [searchBlock(...urls)],
      { max: 3 },
    );
    expect(out).toHaveLength(3);
    expect(out[0]!.title).toBe("a.com/0");
    expect(out[0]!.minutes).toBeNull();
  });
});
