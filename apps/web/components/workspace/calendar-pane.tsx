"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { addDays, eventTitle, findFreeSlots, localDate, zonedInstant, type TimeBlock } from "@tt/shared";
import { fmtDay, HOUR_PX, taskColor, useEvents, useModel } from "@tt/client";
import { Grid } from "@/components/timeline/grid";
import { useZoom } from "@/components/timeline/zoom";
import { useCalendarKeys } from "./calendar-keys";
import { earliestStart, weekStart } from "./time";

const btn =
  "grid h-7 w-7 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-[#f0f1f7] disabled:opacity-40";

/** A week (Mon–Sun) or single-day calendar of events, time blocks and open time. */
export function CalendarPane({ pane, now }: { pane: "week" | "today"; now: number }) {
  const isWeek = pane === "week";
  const { settings, blocks, taskById, stepsByTask, listById, isLoading } = useModel();
  const tz = settings.timezone;
  const today = localDate(new Date(now), tz);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerPx = useCallback(() => headerRef.current?.offsetHeight ?? 0, []);
  const zoom = useZoom(scrollRef, `timeline.zoom.${pane}`, headerPx);
  const [anchor, setAnchor] = useState<string | null>(null);
  const current = anchor ?? today;

  const days = useMemo(() => {
    if (!isWeek) return [current];
    const start = weekStart(current, tz);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [isWeek, current, tz]);

  const from = zonedInstant(days[0]!, "00:00", tz).getTime();
  const to = zonedInstant(addDays(days.at(-1)!, 1), "00:00", tz).getTime();
  const { data: eventsData } = useEvents(from, to);
  const events = useMemo(() => eventsData?.events ?? [], [eventsData]);

  const step = (dir: -1 | 1) => setAnchor(addDays(current, dir * (isWeek ? 7 : 1)));
  const { onFocus } = useCalendarKeys(pane, {
    step,
    today: () => setAnchor(null),
    zoomBy: zoom.zoomBy,
    resetZoom: zoom.reset,
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
    const s = b.step_id ? stepsByTask.get(b.task_id)?.find((x) => x.id === b.step_id) : null;
    return {
      title: eventTitle(null, task?.title ?? "Task", s?.title),
      color: taskColor(task, listById),
      done: s ? s.done : task?.status === "done",
      listName: task?.list_id ? listById.get(task.list_id)?.name : undefined,
      dueAt: task?.due_at ?? null,
    };
  };

  const title = isWeek
    ? `${fmtDay(days[0]!, tz).split(", ")[1]} – ${fmtDay(days[6]!, tz).split(", ")[1]}`
    : fmtDay(current, tz, "long");

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onPointerEnter={onFocus}
      onFocusCapture={onFocus}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h2 className="mr-auto text-[14px] font-extrabold tracking-tight text-ink">{title}</h2>
        <button
          type="button"
          className={btn}
          onClick={() => step(-1)}
          aria-label={isWeek ? "Previous week" : "Previous day"}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(null)}
          className="h-7 rounded-lg border border-line bg-white px-2.5 text-[12px] font-bold text-ink hover:bg-[#f0f1f7]"
        >
          Today
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => step(1)}
          aria-label={isWeek ? "Next week" : "Next day"}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          className={btn}
          onClick={() => zoom.zoomBy(0.8)}
          disabled={!zoom.canZoomOut}
          aria-label="Zoom out"
          title="Zoom out (−, or pinch / ⌘-scroll on the grid)"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoom.reset}
          title="Reset zoom (0)"
          className="min-w-10 text-[11px] font-bold text-muted tabular-nums hover:text-ink"
        >
          {Math.round((zoom.hourPx / HOUR_PX) * 100)}%
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => zoom.zoomBy(1.25)}
          disabled={!zoom.canZoomIn}
          aria-label="Zoom in"
          title="Zoom in (+, or pinch / ⌘-scroll on the grid)"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 px-2.5">
        <Grid
          paneKey={pane}
          scrollRef={scrollRef}
          headerRef={headerRef}
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
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-[11px] font-semibold text-[#7d8099]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-sky" /> Task
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-[#d3ddee] bg-white shadow-[inset_2px_0_0_var(--tt-sky)]" />
          Google event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="open-slot h-2.5 w-2.5 rounded-[3px]" /> Open time
        </span>
        <span className="ml-auto hidden text-faint sm:inline">Drag tasks or blocks onto the grid</span>
      </div>
    </div>
  );
}
