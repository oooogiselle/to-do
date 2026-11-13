import { describe, expect, it } from "vitest";
import { trimmedEnd } from "./trim";

const block = { start: "2026-11-12T14:00:00.000Z", end: "2026-11-12T15:00:00.000Z" };
const at = (s: string) => new Date(s);

describe("trimmedEnd", () => {
  it("leaves a block that hasn't started", () => {
    expect(trimmedEnd(block, at("2026-11-12T13:59:59Z"))).toBeNull();
  });

  it("leaves a block that has ended", () => {
    expect(trimmedEnd(block, at("2026-11-12T15:00:00Z"))).toBeNull();
    expect(trimmedEnd(block, at("2026-11-12T16:00:00Z"))).toBeNull();
  });

  it("ends a running block at the check-off minute", () => {
    expect(trimmedEnd(block, at("2026-11-12T14:37:42Z"))).toBe("2026-11-12T14:37:00.000Z");
  });

  it("keeps at least 5 minutes", () => {
    expect(trimmedEnd(block, at("2026-11-12T14:00:00Z"))).toBe("2026-11-12T14:05:00.000Z");
    expect(trimmedEnd(block, at("2026-11-12T14:02:30Z"))).toBe("2026-11-12T14:05:00.000Z");
  });

  it("leaves a block that wouldn't get shorter", () => {
    const short = { start: "2026-11-12T14:00:00.000Z", end: "2026-11-12T14:05:00.000Z" };
    expect(trimmedEnd(short, at("2026-11-12T14:01:00Z"))).toBeNull();
    expect(trimmedEnd(block, at("2026-11-12T14:59:30Z"))).toBe("2026-11-12T14:59:00.000Z");
    const odd = { start: "2026-11-12T14:00:00.000Z", end: "2026-11-12T14:30:20.000Z" };
    expect(trimmedEnd(odd, at("2026-11-12T14:30:10Z"))).toBe("2026-11-12T14:30:00.000Z");
  });
});
