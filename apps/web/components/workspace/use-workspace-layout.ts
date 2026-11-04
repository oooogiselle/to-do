"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { List } from "@tt/shared";
import {
  buildPresets,
  closePane,
  movePane,
  resizeSide,
  resizeStack,
  sanitize,
  SCREEN_PRESETS,
  type PaneId,
  type PresetId,
  type Screen,
  type WorkspaceLayout,
  type ZoneId,
} from "./layout";

// Each screen remembers its own arrangement; Calendar keeps the original keys.
const KEYS: Record<Screen, { layout: string; preset: string }> = {
  calendar: { layout: "workspace.layout.v1", preset: "workspace.preset" },
  day: { layout: "workspace.day.layout.v1", preset: "workspace.day.preset" },
};

function load(screen: Screen): { layout: unknown; preset: PresetId | null } {
  try {
    const raw = localStorage.getItem(KEYS[screen].layout);
    const preset = localStorage.getItem(KEYS[screen].preset) as PresetId | null;
    return { layout: raw ? JSON.parse(raw) : null, preset: raw ? preset || null : null };
  } catch {
    return { layout: null, preset: null };
  }
}

/**
 * The workspace's pane arrangement, remembered in this browser. Waits for `lists` to load
 * (`ready`), since panes for lists that no longer exist are dropped.
 */
export function useWorkspaceLayout(lists: List[], ready: boolean, screen: Screen) {
  const presets = useMemo(
    () => buildPresets(lists).filter((p) => SCREEN_PRESETS[screen].includes(p.id)),
    [lists, screen],
  );
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null);
  const [presetId, setPresetId] = useState<PresetId | null>(null);
  const loaded = useRef(false);

  // First load: what was saved, else a preset that suits the screen.
  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    const saved = load(screen);
    const restored = sanitize(saved.layout, lists, screen);
    if (restored) {
      setLayout(restored);
      setPresetId(saved.preset);
      return;
    }
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    const wanted: PresetId =
      screen === "day" ? "plan-day" : narrow ? "focus-day" : "plan-week";
    const preset = presets.find((p) => p.id === wanted)!;
    // On a phone My day is the plan and its schedule; lists stay a tap away in the pane menu.
    const phoneDay = screen === "day" && narrow;
    setLayout(phoneDay ? { ...preset.layout, left: [] } : preset.layout);
    setPresetId(phoneDay ? null : preset.id);
  }, [ready, lists, presets, screen]);

  // Lists change (one deleted): drop its pane.
  useEffect(() => {
    if (!ready) return;
    setLayout((l) => (l ? sanitize(l, lists, screen) : l));
  }, [ready, lists, screen]);

  useEffect(() => {
    if (!layout) return;
    try {
      localStorage.setItem(KEYS[screen].layout, JSON.stringify(layout));
      if (presetId) localStorage.setItem(KEYS[screen].preset, presetId);
      else localStorage.removeItem(KEYS[screen].preset);
    } catch {}
  }, [layout, presetId, screen]);

  // Any hand-made change leaves the preset ("Custom").
  const change = useCallback((fn: (l: WorkspaceLayout) => WorkspaceLayout) => {
    setLayout((l) => (l ? fn(l) : l));
    setPresetId(null);
  }, []);

  return {
    layout,
    presets,
    presetId,
    applyPreset: useCallback(
      (id: PresetId) => {
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        setLayout(preset.layout);
        setPresetId(id);
      },
      [presets],
    ),
    movePane: useCallback(
      (pane: PaneId, zone: ZoneId) => change((l) => movePane(l, pane, zone)),
      [change],
    ),
    closePane: useCallback((pane: PaneId) => change((l) => closePane(l, pane)), [change]),
    setActiveCenter: useCallback(
      (pane: PaneId) => setLayout((l) => (l ? { ...l, activeCenter: pane } : l)),
      [],
    ),
    resizeSide: useCallback(
      (side: "left" | "right", delta: number) => change((l) => resizeSide(l, side, delta)),
      [change],
    ),
    resizeStack: useCallback(
      (zone: "left" | "right", index: number, delta: number, total: number) =>
        change((l) => resizeStack(l, zone, index, delta, total)),
      [change],
    ),
  };
}

export type WorkspaceApi = ReturnType<typeof useWorkspaceLayout>;
