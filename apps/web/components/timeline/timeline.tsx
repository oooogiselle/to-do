"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  addDays,
  eventTitle,
  findFreeSlots,
  formatMinutes,
  localDate,
  localWeekday,
  zonedInstant,
  type CalendarEvent,
  type TimeBlock,
} from "@tt/shared";
import { api } from "@/lib/client/api";
import {
  DAY_MIN,
  daySegment,
  fmtDay,
  fmtTime,
  HOUR_PX,
  instantAt,
  isTemp,
  layoutDay,
  MAX_HOUR_PX,
  MIN_HOUR_PX,
  minutesIntoDay,
  snap,
  SNAP_MIN,
  taskColor,
  useCompletion,
  useDeleteBlock,
  useEvents,
  useModel,
  useMoveBlock,
  useSettings,
} from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import type { DragItem, DropPreview } from "./dnd";
import { useTimelineDnd } from "./use-timeline-dnd";
import { DueRail } from "./due-rail";

type View = "day" | "week";

/** Monday of the week containing `day`. */
function weekStart(day: string, tz: string) {
  const wd = localWeekday(zonedInstant(day, "12:00", tz), tz);
  return addDays(day, -((wd + 6) % 7));
}

const clampZoom = (px: number) => Math.min(Math.max(px, MIN_HOUR_PX), MAX_HOUR_PX);

/**
 * How tall an hour is, zoomed with pinch, ⌘/Ctrl+scroll or the keyboard. Zooming keeps the time
 * under the pointer (or the middle of the view) in place, and the level is remembered.
 */
function useZoom(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const [hourPx, setHourPx] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("timeline.zoom"));
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
        anchor.current = { minute: ((el.scrollTop + y) / target.current) * 60, y };
      }
      target.current = px;
      // Coalesce bursts of wheel events into one render per frame.
      frame.current ||= requestAnimationFrame(() => {
        frame.current = 0;
        setHourPx(target.current);
      });
    },
    [scrollRef],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (anchor.current && el)
      el.scrollTop = (anchor.current.minute / 60) * hourPx - anchor.current.y;
    anchor.current = null;
    try {
      localStorage.setItem("timeline.zoom", String(hourPx));
    } catch {}
  }, [hourPx, scrollRef]);

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
    zoomBy: (factor: number) => zoomTo(target.current * factor),
    reset: () => zoomTo(HOUR_PX),
  };
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Timeline() {
  // Everything here depends on the current time and client-fetched data; skip SSR to avoid
  // hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <TimelineView /> : null;
}

function TimelineView() {
  const { settings, blocks, taskById, stepsByTask, listById, isLoading } = useModel();
  const tz = settings.timezone;
  const now = useNow();
  const today = localDate(new Date(now), tz);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoom = useZoom(scrollRef);
  const dnd = useTimelineDnd(tz, zoom.hourPx);

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const current = anchor ?? today;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("timeline.view");
      if (saved === "day" || saved === "week") return setView(saved);
    } catch {}
    if (window.matchMedia("(max-width: 640px)").matches) setView("day");
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("timeline.view", v);
    } catch {}
  };

  const days = useMemo(() => {
    if (view === "day") return [current];
    const start = weekStart(current, tz);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, current, tz]);

  const from = zonedInstant(days[0]!, "00:00", tz).getTime();
  const to = zonedInstant(addDays(days.at(-1)!, 1), "00:00", tz).getTime();
  const { data: eventsData } = useEvents(from, to);
  const events = useMemo(() => eventsData?.events ?? [], [eventsData]);

  const step = (dir: -1 | 1) => setAnchor(addDays(current, dir * (view === "week" ? 7 : 1)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey)
        return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "t") setAnchor(null);
      else if (e.key === "d") changeView("day");
      else if (e.key === "w") changeView("week");
      else if (e.key === "=" || e.key === "+") zoom.zoomBy(1.25);
      else if (e.key === "-") zoom.zoomBy(0.8);
      else if (e.key === "0") zoom.reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visibleBlocks = useMemo(
    () => blocks.filter((b) => Date.parse(b.end) > from && Date.parse(b.start) < to),
    [blocks, from, to],
  );

  // Open time from now on: gaps in working hours not taken by events or scheduled blocks.
  const freeSlots = useMemo(
    () =>
      findFreeSlots([...events, ...visibleBlocks], {
        workingHours: settings.working_hours,
        timezone: tz,
        from: Math.max(from, now),
        to,
      }),
    [events, visibleBlocks, settings.working_hours, tz, from, to, now],
  );

  const blockLabel = (b: TimeBlock) => {
    const task = taskById.get(b.task_id);
    const step = b.step_id ? stepsByTask.get(b.task_id)?.find((s) => s.id === b.step_id) : null;
    return {
      title: eventTitle(null, task?.title ?? "Task", step?.title),
      color: taskColor(task, listById),
      done: step ? step.done : task?.status === "done",
    };
  };

  const title =
    view === "day"
      ? fmtDay(current, tz, "long")
      : `${fmtDay(days[0]!, tz)} – ${fmtDay(days[6]!, tz)}`;

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={dnd.onDragStart}
      onDragMove={dnd.onDragMove}
      onDragEnd={dnd.onDragEnd}
      onDragCancel={dnd.onDragCancel}
      autoScroll={{ threshold: { x: 0, y: 0.15 } }}
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            title={title}
            view={view}
            onView={changeView}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={() => setAnchor(null)}
            hourPx={zoom.hourPx}
            onZoom={zoom.zoomBy}
            onZoomReset={zoom.reset}
          />
          <ConnectBanner />
          <Grid
            scrollRef={scrollRef}
            hourPx={zoom.hourPx}
            days={days}
            today={today}
            now={now}
            tz={tz}
            events={events}
            blocks={visibleBlocks}
            freeSlots={freeSlots}
            blockLabel={blockLabel}
            scrollToHour={earliestStart(settings.working_hours)}
            loading={isLoading}
            preview={dnd.preview}
            dragging={dnd.active}
          />
        </section>
        <DueRail now={now} />
      </div>
      <DragOverlay dropAnimation={null}>
        {dnd.active && dnd.active.kind !== "block" && <DragChip item={dnd.active} />}
      </DragOverlay>
      {dnd.error && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-risk/40 bg-surface px-4 py-2 shadow-lg"
        >
          <span className="text-risk">Couldn&apos;t schedule that: {dnd.error.message}</span>
          <button onClick={dnd.resetError} className="text-muted hover:text-ink">
            Dismiss
          </button>
        </div>
      )}
    </DndContext>
  );
}

function DragChip({ item }: { item: DragItem }) {
  return (
    <div
      className="w-56 cursor-grabbing rounded border-l-[3px] px-2 py-1.5 text-xs shadow-lg"
      style={{
        borderColor: item.color,
        background: `color-mix(in srgb, ${item.color} 22%, var(--surface))`,
      }}
    >
      <div className="truncate font-medium">{item.title}</div>
      <div className="text-muted">{formatMinutes(item.minutes)}</div>
    </div>
  );
}

function earliestStart(hours: Record<string, { start: string } | null>) {
  const starts = Object.values(hours).flatMap((h) => (h ? [parseInt(h.start, 10)] : []));
  return starts.length ? Math.max(0, Math.min(...starts) - 1) : 8;
}

function Header(props: {
  title: string;
  view: View;
  onView: (v: View) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  hourPx: number;
  onZoom: (factor: number) => void;
  onZoomReset: () => void;
}) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await api.refreshCalendars();
      await qc.invalidateQueries({ queryKey: ["events"] });
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "Couldn't refresh");
    } finally {
      setRefreshing(false);
    }
  };
  const btn = "rounded-md border border-line px-2.5 py-1 hover:border-line-strong";
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <div className="flex items-center gap-1">
        <button onClick={props.onPrev} aria-label="Previous" className={btn}>
          ‹
        </button>
        <button onClick={props.onToday} className={btn}>
          Today
        </button>
        <button onClick={props.onNext} aria-label="Next" className={btn}>
          ›
        </button>
      </div>
      <h1 className="text-[15px] font-semibold tracking-tight">{props.title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {refreshError && <span className="text-xs text-risk">{refreshError}</span>}
        <button
          onClick={refresh}
          disabled={refreshing}
          className={`${btn} text-muted hover:text-ink`}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <div className="flex items-center rounded-md border border-line p-0.5">
          <button
            onClick={() => props.onZoom(0.8)}
            disabled={props.hourPx <= MIN_HOUR_PX}
            aria-label="Zoom out"
            title="Zoom out (−, or pinch / ⌘-scroll on the grid)"
            className="rounded px-2 py-0.5 text-muted hover:text-ink disabled:opacity-40"
          >
            −
          </button>
          <button
            onClick={props.onZoomReset}
            title="Reset zoom (0)"
            className="min-w-12 rounded px-1 py-0.5 text-xs text-muted tabular-nums hover:text-ink"
          >
            {Math.round((props.hourPx / HOUR_PX) * 100)}%
          </button>
          <button
            onClick={() => props.onZoom(1.25)}
            disabled={props.hourPx >= MAX_HOUR_PX}
            aria-label="Zoom in"
            title="Zoom in (+, or pinch / ⌘-scroll on the grid)"
            className="rounded px-2 py-0.5 text-muted hover:text-ink disabled:opacity-40"
          >
            +
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="View"
          className="flex rounded-md border border-line p-0.5"
        >
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={props.view === v}
              onClick={() => props.onView(v)}
              className={`rounded px-2.5 py-0.5 capitalize ${props.view === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function ConnectBanner() {
  const { data } = useSettings();
  if (!data) return null;
  if (data.google?.needs_reconnect) {
    return (
      <p className="border-b border-warn/40 bg-warn-bg px-4 py-2 text-warn">
        Google Calendar access expired, so events aren&apos;t updating.{" "}
        <a href="/api/google/connect" className="font-medium underline">
          Reconnect
        </a>
      </p>
    );
  }
  if (data.google) return null;
  return (
    <p className="border-b border-line bg-surface px-4 py-2 text-muted">
      Your calendar isn&apos;t connected yet.{" "}
      <a href="/settings" className="text-ink underline">
        Connect Google Calendar
      </a>{" "}
      to see events and open time.
    </p>
  );
}

function Grid(props: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hourPx: number;
  days: string[];
  today: string;
  now: number;
  tz: string;
  events: CalendarEvent[];
  blocks: TimeBlock[];
  freeSlots: { start: number; end: number }[];
  blockLabel: (b: TimeBlock) => BlockLabel;
  scrollToHour: number;
  loading: boolean;
  preview: DropPreview | null;
  dragging: DragItem | null;
}) {
  const { days, tz, hourPx, scrollRef } = props;
  const openTask = useOpenTask();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: props.scrollToHour * hourPx });
    // Only on first render: keep the user's scroll position afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDay = props.events.filter((e) => e.all_day);
  const timed = props.events.filter((e) => !e.all_day);
  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers and all-day events */}
      <div
        className="grid overflow-y-hidden border-b border-line [scrollbar-gutter:stable]"
        style={{ gridTemplateColumns: cols }}
      >
        <div />
        {days.map((day) => {
          const isToday = day === props.today;
          const dayAllDay = allDay.filter((e) =>
            daySegment(Date.parse(e.start), Date.parse(e.end), day, tz),
          );
          return (
            <div key={day} className="min-w-0 border-l border-line px-1.5 pt-1.5 pb-1">
              <div className={`mb-1 text-xs ${isToday ? "font-semibold text-now" : "text-muted"}`}>
                {fmtDay(day, tz)}
              </div>
              {dayAllDay.map((e) => (
                <div
                  key={e.gcal_event_id}
                  title={e.title}
                  className={`mb-0.5 truncate rounded px-1.5 py-0.5 text-xs ${eventLook(e).className}`}
                  style={eventLook(e).style}
                >
                  {e.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * hourPx }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-muted"
                style={{ top: h * hourPx }}
              >
                {fmtTime(zonedInstant(days[0]!, `${String(h).padStart(2, "0")}:00`, tz), tz)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              isToday={day === props.today}
              {...props}
              timed={timed}
              onOpenTask={openTask}
            />
          ))}
        </div>
        {props.loading && (
          <div className="absolute inset-0 grid place-items-center bg-paper/50 text-muted">
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}

function DayColumn(props: {
  hourPx: number;
  day: string;
  isToday: boolean;
  now: number;
  tz: string;
  timed: CalendarEvent[];
  blocks: TimeBlock[];
  freeSlots: { start: number; end: number }[];
  blockLabel: (b: TimeBlock) => BlockLabel;
  onOpenTask: (id: string) => void;
  preview: DropPreview | null;
  dragging: DragItem | null;
}) {
  const { day, tz, hourPx } = props;
  const { setNodeRef, isOver } = useDroppable({ id: day });

  const items = useMemo(
    () => layoutDay(day, tz, props.timed, props.blocks, hourPx),
    [props.timed, props.blocks, day, tz, hourPx],
  );

  const free = props.freeSlots.flatMap((s) => {
    const seg = daySegment(s.start, s.end, day, tz);
    return seg ? [{ ...seg, minutes: Math.round((s.end - s.start) / 60_000) }] : [];
  });

  const nowMin = props.isToday ? minutesIntoDay(props.now, day, tz) : null;

  return (
    <div
      ref={setNodeRef}
      data-day={day}
      className={`relative border-l border-line ${isOver ? "bg-now/[0.03]" : ""}`}
      style={{
        backgroundImage: gridLines(hourPx),
      }}
    >
      {free.map((f) => {
        const height = ((f.endMin - f.startMin) / 60) * hourPx;
        return (
          <div
            key={f.startMin}
            className="open-hatch absolute inset-x-0 border-y border-open-ink/10"
            style={{ top: (f.startMin / 60) * hourPx, height }}
          >
            {height >= 22 && (
              <span className="absolute top-1 right-1.5 text-[11px] font-medium text-open-ink">
                {formatMinutes(f.minutes)} open
              </span>
            )}
          </div>
        );
      })}

      {items.map((it) => {
        const style = {
          top: it.top + 1,
          height: it.height - 2,
          left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
          width: `calc(${100 / it.lanes}% - 4px)`,
        };
        const compact = it.height < 36;
        if (it.kind === "event") {
          const e = it.event;
          return (
            <div
              key={it.key}
              title={`${e.title}\n${fmtTime(e.start, tz)}–${fmtTime(e.end, tz)}`}
              className={`absolute overflow-hidden rounded px-1.5 py-0.5 text-xs leading-tight ${eventLook(e).className}`}
              style={{ ...style, ...eventLook(e).style }}
            >
              <div className="truncate font-medium">{e.title}</div>
              {!compact && (
                <div className="truncate opacity-75">
                  {fmtTime(e.start, tz)}–{fmtTime(e.end, tz)}
                </div>
              )}
            </div>
          );
        }
        return (
          <BlockItem
            key={it.key}
            block={it.block}
            day={day}
            segStartMin={it.startMin}
            hourPx={hourPx}
            style={style}
            compact={compact}
            tz={tz}
            now={props.now}
            label={props.blockLabel(it.block)}
            onOpen={props.onOpenTask}
            hidden={props.dragging?.kind === "block" && props.dragging.blockId === it.block.id}
          />
        );
      })}

      {props.preview?.day === day && props.dragging && (
        <div
          className={`pointer-events-none absolute inset-x-1 z-20 rounded border-2 border-dashed px-1.5 py-0.5 text-xs font-medium ${props.preview.past ? "border-risk text-risk" : "border-now text-now"}`}
          style={{
            top: (props.preview.startMin / 60) * hourPx,
            height: (props.preview.minutes / 60) * hourPx,
            background: "color-mix(in srgb, var(--surface) 70%, transparent)",
          }}
        >
          {props.preview.past
            ? "That time has passed"
            : `${fmtTime(instantAt(day, props.preview.startMin, tz), tz)}–${fmtTime(instantAt(day, props.preview.startMin + props.preview.minutes, tz), tz)}`}
        </div>
      )}

      {nowMin !== null && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: (nowMin / 60) * hourPx }}
        >
          <div className="h-[2px] bg-now" />
          <div className="absolute -top-[3px] -left-[4px] size-2 rounded-full bg-now" />
        </div>
      )}
    </div>
  );
}

/** Hour lines, plus fainter half-hour lines once zoomed in far enough to want them. */
function gridLines(hourPx: number) {
  const hours = `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${hourPx}px)`;
  if (hourPx < 96) return hours;
  const half = hourPx / 2;
  const faint = "color-mix(in srgb, var(--line) 50%, transparent)";
  return `${hours}, repeating-linear-gradient(to bottom, transparent 0 ${half}px, ${faint} ${half}px ${half + 1}px, transparent ${half + 1}px ${hourPx}px)`;
}

/**
 * How a calendar event shows: a soft tint of its calendar's color, fainter than task blocks and
 * without their left bar, so tasks stand out. Free events are a dashed outline.
 */
function eventLook(e: CalendarEvent): { className: string; style?: React.CSSProperties } {
  if (!e.busy)
    return {
      className: "border border-dashed text-muted",
      style: {
        borderColor: e.color
          ? `color-mix(in srgb, ${e.color} 45%, var(--line-strong))`
          : "var(--line-strong)",
      },
    };
  if (!e.color) return { className: "bg-event text-event-ink" };
  return {
    className: "border text-ink/80",
    style: {
      background: `color-mix(in srgb, ${e.color} 10%, var(--surface))`,
      borderColor: `color-mix(in srgb, ${e.color} 30%, var(--surface))`,
    },
  };
}

/** How a time block shows: its title, its list's color, and whether its step or task is done. */
type BlockLabel = { title: string; color: string; done: boolean };

function BlockItem(props: {
  block: TimeBlock;
  day: string;
  /** Where this block's segment starts in `day`, in minutes from midnight. */
  segStartMin: number;
  hourPx: number;
  style: React.CSSProperties;
  compact: boolean;
  tz: string;
  now: number;
  label: BlockLabel;
  onOpen: (taskId: string) => void;
  hidden: boolean;
}) {
  const { block: b, day, tz, label } = props;
  const minutes = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60_000);
  // Past blocks are a record of work done; only upcoming ones can be moved.
  const movable = !isTemp(b.id) && Date.parse(b.end) > props.now;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `block-${b.id}`,
    disabled: !movable,
    data: {
      kind: "block",
      blockId: b.id,
      title: label.title,
      minutes,
      color: label.color,
    } satisfies DragItem,
  });
  const removeBlock = useDeleteBlock();
  const moveBlock = useMoveBlock();
  const { setTaskDone, setStepDone } = useCompletion();
  const toggleDone = () =>
    b.step_id
      ? setStepDone(b.task_id, b.step_id, !label.done)
      : setTaskDone(b.task_id, !label.done);
  // Once a block has started, ask whether its work got done; upcoming ones show it on hover.
  const started = Date.parse(b.start) <= props.now;

  // Dragging the bottom edge changes the end time; it's only on the day the block ends.
  const endsHere = localDate(new Date(Date.parse(b.end) - 1), tz) === day;
  const [resizeEnd, setResizeEnd] = useState<number | null>(null);
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const column = e.currentTarget.closest<HTMLElement>("[data-day]");
    if (!column) return;
    const startMs = Date.parse(b.start);
    const endAt = (clientY: number) => {
      const y = clientY - column.getBoundingClientRect().top;
      const min = Math.min(snap((y / props.hourPx) * 60), DAY_MIN);
      const end = instantAt(day, min, tz);
      // At least one snap step long, and never ending in the past.
      const floor = Math.max(startMs + SNAP_MIN * 60_000, Date.now());
      return end < floor ? Math.ceil(floor / 60_000) * 60_000 : end;
    };
    let end = Date.parse(b.end);
    const move = (ev: PointerEvent) => setResizeEnd((end = endAt(ev.clientY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setResizeEnd(null);
      if (end !== Date.parse(b.end))
        moveBlock.mutate({ id: b.id, start: b.start, end: new Date(end).toISOString() });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const shownEnd = resizeEnd ?? b.end;
  const style =
    resizeEnd === null
      ? props.style
      : {
          ...props.style,
          height: Math.max(
            ((minutesIntoDay(resizeEnd, day, tz) - props.segStartMin) / 60) * props.hourPx - 2,
            12,
          ),
          zIndex: 20,
        };
  const past = !movable && !isTemp(b.id);

  return (
    <div
      className={`group absolute ${props.hidden ? "opacity-30" : label.done ? "opacity-60" : ""}`}
      style={style}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => !isDragging && props.onOpen(b.task_id)}
        title={`${label.title}\n${fmtTime(b.start, tz)}–${fmtTime(b.end, tz)}${movable ? "\nDrag to reschedule, drag the bottom edge to change length" : ""}`}
        className={`absolute inset-0 overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight text-ink ${movable ? "cursor-grab touch-none" : ""} ${isTemp(b.id) ? "animate-pulse" : "pr-5 pl-5"}`}
        style={{
          borderColor: label.color,
          background: `color-mix(in srgb, ${label.color} 22%, var(--surface))`,
        }}
      >
        <div className={`truncate font-medium ${label.done ? "line-through" : ""}`}>
          {label.title}
        </div>
        {(!props.compact || resizeEnd !== null) && (
          <div className="truncate opacity-75">
            {fmtTime(b.start, tz)}–{fmtTime(shownEnd, tz)}
          </div>
        )}
      </button>
      {!isTemp(b.id) && !isDragging && resizeEnd === null && (
        <button
          role="checkbox"
          aria-checked={label.done}
          onClick={toggleDone}
          aria-label={label.done ? `Mark ${label.title} not done` : `Mark ${label.title} done`}
          title={label.done ? "Done. Click to undo" : started ? "Done with this?" : "Mark done"}
          className={`absolute top-0.5 left-1 flex size-4 items-center justify-center rounded-full border text-[10px] leading-none ${label.done || started ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"} ${label.done ? "text-paper" : "bg-surface hover:bg-paper"}`}
          style={{
            borderColor: label.color,
            ...(label.done && { background: label.color }),
          }}
        >
          {label.done && "✓"}
        </button>
      )}
      {!isTemp(b.id) && !isDragging && resizeEnd === null && (
        <button
          onClick={() => removeBlock.mutate(b.id)}
          aria-label={`Remove ${label.title} from your calendar`}
          title={
            past
              ? "Didn't get to it? Remove from calendar (the task stays in your to-dos)"
              : "Remove from calendar (the task stays)"
          }
          className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded text-sm leading-none text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface hover:text-risk"
        >
          ×
        </button>
      )}
      {movable && endsHere && !isDragging && (
        <div
          onPointerDown={startResize}
          aria-hidden
          className={`absolute inset-x-0 flex cursor-ns-resize ${props.compact ? "-bottom-0.5 h-1.5" : "bottom-0 h-2.5"} touch-none items-end justify-center pb-0.5`}
        >
          <div className="h-1 w-6 rounded-full bg-ink/30 opacity-0 group-hover:opacity-100" />
        </div>
      )}
    </div>
  );
}
