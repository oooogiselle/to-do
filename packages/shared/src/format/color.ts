/** The six list hues plus a neutral, in picker order. */
export const HUES = {
  coral: "#D9775E",
  sun: "#E3BA55",
  mint: "#5AA585",
  sky: "#5C88C7",
  grape: "#8775C9",
  pink: "#C97A9F",
  slate: "#8A8FA6",
} as const;

export interface Swatch {
  /** Fill for blocks, headers and dots. */
  solid: string;
  /** Pale background for chips and cards. */
  tint: string;
  /** Readable text on the tint. */
  ink: string;
  /** Readable text on the solid. */
  onSolid: string;
}

/** Hand-tuned shades for the palette; anything else is computed. */
const SLATE: Swatch = { solid: HUES.slate, tint: "#EEF0F6", ink: "#4D5370", onSolid: "#FFFFFF" };

const TUNED: Record<string, Swatch> = {
  [HUES.coral]: { solid: HUES.coral, tint: "#F9ECE7", ink: "#8A3F2C", onSolid: "#FFFFFF" },
  [HUES.sun]: { solid: HUES.sun, tint: "#FAF3DF", ink: "#7A5E1E", onSolid: "#4A3A12" },
  [HUES.mint]: { solid: HUES.mint, tint: "#E6F2EC", ink: "#2F6B52", onSolid: "#FFFFFF" },
  [HUES.sky]: { solid: HUES.sky, tint: "#E7EEF8", ink: "#2E4F80", onSolid: "#FFFFFF" },
  [HUES.grape]: { solid: HUES.grape, tint: "#EEEBF7", ink: "#4A3D85", onSolid: "#FFFFFF" },
  [HUES.pink]: { solid: HUES.pink, tint: "#F7EAF0", ink: "#7E3A5A", onSolid: "#FFFFFF" },
  [HUES.slate]: SLATE,
};

/** Colors from the first palette, mapped to the hue that replaced them. */
export const LEGACY_HUES: Record<string, string> = {
  "#2563EB": HUES.sky,
  "#0D9488": HUES.mint,
  "#7C3AED": HUES.grape,
  "#DB2777": HUES.pink,
  "#EA580C": HUES.coral,
  "#CA8A04": HUES.sun,
  "#64748B": HUES.slate,
};

const INK: Rgb = [0x15, 0x17, 0x2b];
const WHITE: Rgb = [0xff, 0xff, 0xff];

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb | null {
  const raw = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!raw) return null;
  const h = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [at(0), at(2), at(4)];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** `amount` (0–1) of `a` mixed into `b`. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const m = (x: number, y: number) => x * amount + y * (1 - amount);
  return [m(a[0], b[0]), m(a[1], b[1]), m(a[2], b[2])];
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Normalizes a stored color: uppercase hex, with old-palette colors mapped to the new hues. */
export function canonicalColor(hex: string): string {
  const up = hex.trim().toUpperCase();
  const withHash = up.startsWith("#") ? up : `#${up}`;
  return LEGACY_HUES[withHash] ?? withHash;
}

/** Solid, tint, ink and on-solid text for any hex color. */
export function swatch(hex: string | null | undefined): Swatch {
  const key = canonicalColor(hex || HUES.slate);
  const tuned = TUNED[key];
  if (tuned) return tuned;
  const rgb = parseHex(key);
  if (!rgb) return SLATE;
  return {
    solid: toHex(rgb),
    tint: toHex(mix(rgb, WHITE, 0.14)),
    ink: toHex(mix(rgb, INK, 0.55)),
    onSolid: luminance(rgb) > 0.45 ? toHex(mix(rgb, INK, 0.3)) : "#FFFFFF",
  };
}
