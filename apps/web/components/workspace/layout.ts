import type { List } from "@tt/shared";

/** Panes: the two calendars, the Due pane, one per list, and one for tasks without a list. */
export type PaneId = "week" | "today" | "due" | "list:none" | `list:${string}`;
export type ZoneId = "left" | "center" | "right";
export type PresetId = "plan-week" | "focus-day" | "lists-only";

export interface WorkspaceLayout {
  left: PaneId[];
  center: PaneId[];
  right: PaneId[];
  activeCenter: PaneId | null;
  leftWidth: number;
  rightWidth: number;
  /** Flex weight of each pane in a stacked side column (default 1). */
  weights: Record<string, number>;
}

export interface LayoutPreset {
  id: PresetId;
  name: string;
  description: string;
  layout: WorkspaceLayout;
}

export const ZONES: ZoneId[] = ["left", "center", "right"];
export const MIN_SIDE = 200;
export const MAX_SIDE = 520;
const clampWidth = (px: number) => Math.min(Math.max(Math.round(px), MIN_SIDE), MAX_SIDE);

export const listPane = (listId: string | null): PaneId =>
  listId ? `list:${listId}` : "list:none";

/** The list a list pane shows: an id, null for "No list", or undefined for non-list panes. */
export function listIdOf(pane: PaneId): string | null | undefined {
  if (pane === "list:none") return null;
  return pane.startsWith("list:") ? pane.slice(5) : undefined;
}

export const isCalendarPane = (p: PaneId): p is "week" | "today" => p === "week" || p === "today";

export function allPaneIds(lists: List[]): PaneId[] {
  return ["week", "today", "due", ...lists.map((l) => listPane(l.id)), "list:none"];
}

export function paneLabel(pane: PaneId, lists: List[]): string {
  if (pane === "week") return "Week";
  if (pane === "today") return "Day";
  if (pane === "due") return "Due soon";
  const id = listIdOf(pane);
  if (id === null) return "No list";
  return lists.find((l) => l.id === id)?.name ?? "List";
}

export function paneColor(pane: PaneId, lists: List[]): string {
  if (pane === "week") return "var(--tt-sky)";
  if (pane === "today") return "var(--ink)";
  if (pane === "due") return "var(--tt-coral)";
  const id = listIdOf(pane);
  return lists.find((l) => l.id === id)?.color ?? "var(--faint)";
}

export function visiblePanes(l: WorkspaceLayout): PaneId[] {
  return [...l.left, ...l.center, ...l.right];
}

function without(l: WorkspaceLayout, pane: PaneId): WorkspaceLayout {
  return {
    ...l,
    left: l.left.filter((p) => p !== pane),
    center: l.center.filter((p) => p !== pane),
    right: l.right.filter((p) => p !== pane),
  };
}

/** Moves (or opens) `pane` at the end of `zone`; in the center it becomes the active tab. */
export function movePane(l: WorkspaceLayout, pane: PaneId, zone: ZoneId): WorkspaceLayout {
  const next = without(l, pane);
  next[zone] = [...next[zone], pane];
  if (zone === "center") next.activeCenter = pane;
  else if (l.activeCenter === pane) next.activeCenter = next.center[0] ?? null;
  return next;
}

export function closePane(l: WorkspaceLayout, pane: PaneId): WorkspaceLayout {
  const next = without(l, pane);
  if (l.activeCenter === pane) next.activeCenter = next.center[0] ?? null;
  return next;
}

export function resizeSide(l: WorkspaceLayout, side: "left" | "right", delta: number) {
  return side === "left"
    ? { ...l, leftWidth: clampWidth(l.leftWidth + delta) }
    : { ...l, rightWidth: clampWidth(l.rightWidth + delta) };
}

/** Moves the split between stacked panes `index` and `index + 1`; each keeps at least 12%. */
export function resizeStack(
  l: WorkspaceLayout,
  zone: "left" | "right",
  index: number,
  deltaPx: number,
  totalPx: number,
): WorkspaceLayout {
  const panes = l[zone];
  const a = panes[index];
  const b = panes[index + 1];
  if (!a || !b || totalPx <= 0) return l;
  const sum = panes.reduce((s, p) => s + (l.weights[p] ?? 1), 0);
  const d = (deltaPx / totalPx) * sum;
  const min = sum * 0.12;
  let wa = (l.weights[a] ?? 1) + d;
  let wb = (l.weights[b] ?? 1) - d;
  if (wa < min) {
    wb -= min - wa;
    wa = min;
  }
  if (wb < min) {
    wa -= min - wb;
    wb = min;
  }
  return { ...l, weights: { ...l.weights, [a]: wa, [b]: wb } };
}

/**
 * Drops panes that no longer exist (a deleted list) or that appear twice, and fixes the
 * active tab and widths. Run on anything loaded from storage.
 */
export function sanitize(input: unknown, lists: List[]): WorkspaceLayout | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<Record<keyof WorkspaceLayout, unknown>>;
  const valid = new Set<string>(allPaneIds(lists));
  const seen = new Set<string>();
  const zone = (v: unknown): PaneId[] =>
    (Array.isArray(v) ? v : []).filter((p): p is PaneId => {
      if (typeof p !== "string" || !valid.has(p) || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  const left = zone(raw.left);
  const center = zone(raw.center);
  const right = zone(raw.right);
  const active = raw.activeCenter as PaneId | null;
  const weights: Record<string, number> = {};
  if (raw.weights && typeof raw.weights === "object")
    for (const [k, w] of Object.entries(raw.weights as Record<string, unknown>))
      if (seen.has(k) && typeof w === "number" && w > 0 && Number.isFinite(w)) weights[k] = w;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? clampWidth(v) : fallback;
  return {
    left,
    center,
    right,
    activeCenter: active && center.includes(active) ? active : (center[0] ?? null),
    leftWidth: num(raw.leftWidth, 260),
    rightWidth: num(raw.rightWidth, 280),
    weights,
  };
}

/** The saved layouts, filled with the user's own lists in their sort order. */
export function buildPresets(lists: List[]): LayoutPreset[] {
  const ids = lists.map((l) => listPane(l.id));
  const thirds = Math.ceil(ids.length / 3);
  return [
    {
      id: "plan-week",
      name: "Plan week",
      description: "Lists on the left, week in the middle, due soon on the right",
      layout: {
        left: ids.slice(0, 2),
        center: ["week", "today"],
        right: ["due"],
        activeCenter: "week",
        leftWidth: 260,
        rightWidth: 280,
        weights: {},
      },
    },
    {
      id: "focus-day",
      name: "Focus day",
      description: "One day front and center with what's due beside it",
      layout: {
        left: ["due"],
        center: ["today", "week"],
        right: ids.slice(0, 2),
        activeCenter: "today",
        leftWidth: 300,
        rightWidth: 280,
        weights: {},
      },
    },
    {
      id: "lists-only",
      name: "Lists only",
      description: "Every list open side by side",
      layout: {
        left: ids.slice(0, thirds),
        center: [...ids.slice(thirds, thirds * 2), "week"],
        right: ids.slice(thirds * 2),
        activeCenter: ids[thirds] ?? "week",
        leftWidth: 320,
        rightWidth: 320,
        weights: {},
      },
    },
  ];
}
