"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useEvents, useModel, useSettings } from "@/lib/client/data";
import { fmtDay, fmtTime, minutesIntoDay } from "@/lib/client/time";
import { useOpenTask } from "@/components/app-shell";
import { assignLanes, daySegment, HOUR_PX } from "./geometry";
import { DueRail } from "./due-rail";

type View = "day" | "week";

/** Monday of the week containing `day`. */
function weekStart(day: string, tz: string) {
  const wd = localWeekday(zonedInstant(day, "12:00", tz), tz);
  return addDays(day, -((wd + 6) % 7));
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
    const stepTitle = b.step_id
      ? stepsByTask.get(b.task_id)?.find((s) => s.id === b.step_id)?.title
      : null;
    const list = task?.list_id ? listById.get(task.list_id) : undefined;
    return {
      title: eventTitle(null, task?.title ?? "Task", stepTitle),
      color: list?.color ?? "#64748b",
    };
  };

  const title =
    view === "day"
      ? fmtDay(current, tz, "long")
      : `${fmtDay(days[0]!, tz)} – ${fmtDay(days[6]!, tz)}`;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header
          title={title}
          view={view}
          onView={changeView}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setAnchor(null)}
        />
        <ConnectBanner />
        <Grid
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
        />
      </section>
      <DueRail from={from} to={to} now={now} events={events} />
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
  if (!data || data.google) return null;
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
  days: string[];
  today: string;
  now: number;
  tz: string;
  events: CalendarEvent[];
  blocks: TimeBlock[];
  freeSlots: { start: number; end: number }[];
  blockLabel: (b: TimeBlock) => { title: string; color: string };
  scrollToHour: number;
  loading: boolean;
}) {
  const { days, tz } = props;
  const openTask = useOpenTask();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: props.scrollToHour * HOUR_PX });
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
                  className={`mb-0.5 truncate rounded px-1.5 py-0.5 text-xs ${e.busy ? "bg-event text-event-ink" : "border border-line text-muted"}`}
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
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-muted"
                style={{ top: h * HOUR_PX }}
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
  day: string;
  isToday: boolean;
  now: number;
  tz: string;
  timed: CalendarEvent[];
  blocks: TimeBlock[];
  freeSlots: { start: number; end: number }[];
  blockLabel: (b: TimeBlock) => { title: string; color: string };
  onOpenTask: (id: string) => void;
}) {
  const { day, tz } = props;

  const items = useMemo(() => {
    const out = [];
    for (const e of props.timed) {
      const seg = daySegment(Date.parse(e.start), Date.parse(e.end), day, tz);
      if (seg)
        out.push({
          ...seg,
          kind: "event" as const,
          key: `e-${e.calendar_id}-${e.gcal_event_id}`,
          event: e,
        });
    }
    for (const b of props.blocks) {
      const seg = daySegment(Date.parse(b.start), Date.parse(b.end), day, tz);
      if (seg) out.push({ ...seg, kind: "block" as const, key: `b-${b.id}`, block: b });
    }
    return assignLanes(out);
  }, [props.timed, props.blocks, day, tz]);

  const free = props.freeSlots.flatMap((s) => {
    const seg = daySegment(s.start, s.end, day, tz);
    return seg ? [{ ...seg, minutes: Math.round((s.end - s.start) / 60_000) }] : [];
  });

  const nowMin = props.isToday ? minutesIntoDay(props.now, day, tz) : null;

  return (
    <div
      className="relative border-l border-line"
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${HOUR_PX}px)`,
      }}
    >
      {free.map((f) => {
        const height = ((f.endMin - f.startMin) / 60) * HOUR_PX;
        return (
          <div
            key={f.startMin}
            className="open-hatch absolute inset-x-0 border-y border-open-ink/10"
            style={{ top: (f.startMin / 60) * HOUR_PX, height }}
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
              className={`absolute overflow-hidden rounded px-1.5 py-0.5 text-xs leading-tight ${e.busy ? "bg-event text-event-ink" : "border border-dashed border-line-strong text-muted"}`}
              style={style}
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
        const b = it.block;
        const { title, color } = props.blockLabel(b);
        return (
          <button
            key={it.key}
            onClick={() => props.onOpenTask(b.task_id)}
            title={`${title}\n${fmtTime(b.start, tz)}–${fmtTime(b.end, tz)}`}
            className="absolute overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight text-ink"
            style={{
              ...style,
              borderColor: color,
              background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
            }}
          >
            <div className="truncate font-medium">{title}</div>
            {!compact && (
              <div className="truncate opacity-75">
                {fmtTime(b.start, tz)}–{fmtTime(b.end, tz)}
              </div>
            )}
          </button>
        );
      })}

      {nowMin !== null && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: (nowMin / 60) * HOUR_PX }}
        >
          <div className="h-[2px] bg-now" />
          <div className="absolute -top-[3px] -left-[4px] size-2 rounded-full bg-now" />
        </div>
      )}
    </div>
  );
}
