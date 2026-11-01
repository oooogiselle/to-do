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
  type PaneId,
  type PresetId,
  type WorkspaceLayout,
  type ZoneId,
} from "./layout";

const LAYOUT_KEY = "workspace.layout.v1";
const PRESET_KEY = "workspace.preset";

function load(): { layout: unknown; preset: PresetId | null } {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    const preset = localStorage.getItem(PRESET_KEY) as PresetId | null;
    return { layout: raw ? JSON.parse(raw) : null, preset: raw ? preset || null : null };
  } catch {
    return { layout: null, preset: null };
  }
}

/**
 * The workspace's pane arrangement, remembered in this browser. Waits for `lists` to load
 * (`ready`), since panes for lists that no longer exist are dropped.
 */
export function useWorkspaceLayout(lists: List[], ready: boolean) {
  const presets = useMemo(() => buildPresets(lists), [lists]);
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null);
  const [presetId, setPresetId] = useState<PresetId | null>(null);
  const loaded = useRef(false);

  // First load: what was saved, else a preset that suits the screen.
  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    const saved = load();
    const restored = sanitize(saved.layout, lists);
    if (restored) {
      setLayout(restored);
      setPresetId(saved.preset);
      return;
    }
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    const preset = presets.find((p) => p.id === (narrow ? "focus-day" : "plan-week"))!;
    setLayout(preset.layout);
    setPresetId(preset.id);
  }, [ready, lists, presets]);

  // Lists change (one deleted): drop its pane.
  useEffect(() => {
    if (!ready) return;
    setLayout((l) => (l ? sanitize(l, lists) : l));
  }, [ready, lists]);

  useEffect(() => {
    if (!layout) return;
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
      if (presetId) localStorage.setItem(PRESET_KEY, presetId);
      else localStorage.removeItem(PRESET_KEY);
    } catch {}
  }, [layout, presetId]);

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
