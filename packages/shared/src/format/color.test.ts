import { describe, expect, it } from "vitest";
import { HUES, canonicalColor, swatch } from "./color";

describe("swatch", () => {
  it("uses the tuned shades for palette colors, case-insensitively", () => {
    expect(swatch(HUES.coral).tint).toBe("#F9EAE6");
    expect(swatch(HUES.sun.toLowerCase()).onSolid).toBe("#58442B");
  });

  it("maps old palette colors to their new hue", () => {
    expect(canonicalColor("#2563eb")).toBe(HUES.sky);
    expect(swatch("#ea580c").solid).toBe(HUES.coral);
  });

  it("maps the pre-Loom palette to the Loom hues", () => {
    expect(canonicalColor("#5c88c7")).toBe(HUES.sky);
    expect(swatch("#D9775E").solid).toBe(HUES.coral);
    expect(swatch("#8A8FA6")).toEqual(swatch(HUES.slate));
  });

  it("computes shades for any other color", () => {
    const s = swatch("#000000");
    expect(s.solid).toBe("#000000");
    expect(s.tint).toBe("#DBDBDB");
    expect(s.onSolid).toBe("#FFFFFF");
    expect(swatch("#ffff00").onSolid).not.toBe("#FFFFFF");
  });

  it("falls back to slate for missing or invalid colors", () => {
    expect(swatch(null).solid).toBe(HUES.slate);
    expect(swatch("not a color").solid).toBe(HUES.slate);
  });
});
