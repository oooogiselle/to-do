"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HOUR_PX, MAX_HOUR_PX, MIN_HOUR_PX } from "@tt/client";

const clampZoom = (px: number) => Math.min(Math.max(px, MIN_HOUR_PX), MAX_HOUR_PX);

/**
 * How tall an hour is, zoomed with pinch, ⌘/Ctrl+scroll or the keyboard. Zooming keeps the time
 * under the pointer (or the middle of the view) in place, and the level is remembered.
 */
export function useZoom(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  storageKey: string,
  /** Height of sticky content above the hours inside the scroll container. */
  headerPx: () => number = () => 0,
) {
  const [hourPx, setHourPx] = useState(() => {
    try {
      // Each pane has its own zoom; the old single setting seeds them.
      const saved = Number(
        localStorage.getItem(storageKey) ?? localStorage.getItem("timeline.zoom"),
      );
      if (saved) return clampZoom(saved);
    } catch {}
    return HOUR_PX;
  });
  // The latest requested zoom; it runs ahead of `hourPx` while a frame is pending.
  const target = useRef(hourPx);
  const frame = useRef(0);
  // The minute to keep `y` px down the view once the new zoom renders.
  const anchor = useRef<{ minute: number; y: number } | null>(null);

  const zoomTo = useCallback(
    (next: number, clientY?: number) => {
      const el = scrollRef.current;
      const px = clampZoom(next);
      if (!el || px === target.current) return;
      // Measure once per frame, while the DOM still matches the rendered zoom.
      if (!anchor.current) {
        const y =
          clientY === undefined ? el.clientHeight / 2 : clientY - el.getBoundingClientRect().top;
        const off = headerPx();
        anchor.current = { minute: ((el.scrollTop + y - off) / target.current) * 60, y: y - off };
      }
      target.current = px;
      // Coalesce bursts of wheel events into one render per frame.
      frame.current ||= requestAnimationFrame(() => {
        frame.current = 0;
        setHourPx(target.current);
      });
    },
    [scrollRef, headerPx],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (anchor.current && el)
      el.scrollTop = (anchor.current.minute / 60) * hourPx - anchor.current.y;
    anchor.current = null;
    try {
      localStorage.setItem(storageKey, String(hourPx));
    } catch {}
  }, [hourPx, scrollRef, storageKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Safari pinches with gesture events; everyone else sends ctrl+wheel.
    let gestureStart: number | null = null;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (gestureStart !== null) return;
      // Trackpads send small deltas; cap mouse wheel notches so each is one gentle step.
      const delta = Math.min(Math.max(e.deltaY, -20), 20);
      zoomTo(target.current * Math.exp(-delta * 0.01), e.clientY);
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = target.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientY: number };
      if (gestureStart !== null) zoomTo(gestureStart * g.scale, g.clientY);
    };
    const onGestureEnd = () => (gestureStart = null);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [scrollRef, zoomTo]);

  return {
    hourPx,
    canZoomIn: hourPx < MAX_HOUR_PX,
    canZoomOut: hourPx > MIN_HOUR_PX,
    zoomBy: (factor: number) => zoomTo(target.current * factor),
    reset: () => zoomTo(HOUR_PX),
  };
}

export type Zoom = ReturnType<typeof useZoom>;
