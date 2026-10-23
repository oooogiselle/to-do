import { useColorScheme } from "react-native";

// The web app's palette (apps/web/app/globals.css).
const light = {
  paper: "#f5f7fa",
  surface: "#ffffff",
  ink: "#18212d",
  muted: "#667085",
  line: "#e2e7ee",
  lineStrong: "#cfd6e0",
  event: "#dfe4eb",
  eventInk: "#334155",
  open: "#dcefe4",
  openInk: "#2f6b4a",
  now: "#4058d6",
  risk: "#c8382f",
  warn: "#b26a00",
  warnBg: "#fff4dc",
};
const dark: typeof light = {
  paper: "#12161c",
  surface: "#181d25",
  ink: "#e6eaf0",
  muted: "#8b95a5",
  line: "#262d38",
  lineStrong: "#343d4b",
  event: "#2a323e",
  eventInk: "#cbd3de",
  open: "#1c3428",
  openInk: "#8fd0aa",
  now: "#8195ff",
  risk: "#ff7a70",
  warn: "#f0b44c",
  warnBg: "#3a2c12",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** `hex` at `alpha` opacity, for tints of list and calendar colors. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
