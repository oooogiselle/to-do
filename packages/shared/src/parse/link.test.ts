import { describe, expect, it } from "vitest";
import { findUrls, linkLabel, linkTitle, normalizeLink, splitLink, urlKey } from "./link";

describe("splitLink", () => {
  it("leaves text without a link alone", () => {
    expect(splitLink("  learn to juggle ")).toEqual({ title: "learn to juggle", link_url: null });
  });

  it("splits a link out of the text", () => {
    expect(splitLink("great talk on rust https://youtu.be/abc123")).toEqual({
      title: "great talk on rust",
      link_url: "https://youtu.be/abc123",
    });
  });

  it("titles a bare link after its site and path", () => {
    expect(splitLink("https://www.youtube.com/watch?v=xyz")).toEqual({
      title: "youtube.com/watch",
      link_url: "https://www.youtube.com/watch?v=xyz",
    });
  });

  it("drops sentence punctuation and an unbalanced paren after the link", () => {
    expect(splitLink("read this (https://en.wikipedia.org/wiki/Rust_(programming_language)).")).toEqual({
      title: "read this",
      link_url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
    expect(splitLink("course: https://ocw.mit.edu/6.006, later").link_url).toBe("https://ocw.mit.edu/6.006");
  });

  it("trims separators left around the link", () => {
    expect(splitLink("Watch later — https://vimeo.com/1").title).toBe("Watch later");
  });

  it("ignores non-http schemes", () => {
    expect(splitLink("ftp://example.com/file")).toEqual({ title: "ftp://example.com/file", link_url: null });
  });
});

describe("linkLabel / linkTitle", () => {
  it("shortens to the site", () => {
    expect(linkLabel("https://www.coursera.org/learn/ml")).toBe("coursera.org");
    expect(linkLabel("not a url")).toBe("not a url");
  });

  it("caps long titles", () => {
    const t = linkTitle(`https://example.com/${"a".repeat(100)}`);
    expect(t).toHaveLength(60);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("normalizeLink", () => {
  it("clears blanks, adds https to bare sites, rejects junk", () => {
    expect(normalizeLink("  ")).toBeNull();
    expect(normalizeLink("youtube.com/watch?v=1")).toBe("https://youtube.com/watch?v=1");
    expect(normalizeLink("http://a.org")).toBe("http://a.org");
    expect(normalizeLink("not a link")).toBeUndefined();
    expect(normalizeLink("javascript:alert(1)")).toBeUndefined();
  });
});

describe("urlKey", () => {
  it("matches the same page written differently", () => {
    expect(urlKey("https://www.Example.com/guide/?utm_source=x#top")).toBe(urlKey("http://example.com/guide"));
    expect(urlKey("https://youtube.com/watch?v=abc&si=123")).toBe("youtube.com/watch?v=abc");
  });

  it("keeps meaningful query params apart", () => {
    expect(urlKey("https://youtube.com/watch?v=a")).not.toBe(urlKey("https://youtube.com/watch?v=b"));
  });

  it("rejects non-links", () => {
    expect(urlKey("javascript:alert(1)")).toBeNull();
    expect(urlKey("nope")).toBeNull();
  });
});

describe("findUrls", () => {
  it("finds every link in text", () => {
    expect(findUrls("see https://a.com/x, and (https://b.org/y).")).toEqual(["https://a.com/x", "https://b.org/y"]);
    expect(findUrls("no links")).toEqual([]);
  });
});
