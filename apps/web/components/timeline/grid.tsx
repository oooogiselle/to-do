"use client";

import { useEffect, useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  formatMinutes,
  localDate,
  localWeekday,
  swatch,
  zonedInstant,
  type CalendarEvent,
  type TimeBlock,
} from "@tt/shared";
import {
  DAY_MIN,
  daySegment,
  fmtTime,
  instantAt,
  isTemp,
  layoutDay,
  minutesIntoDay,
  snap,
  SNAP_MIN,
  useCompletion,
  useRemoveBlockWithUndo,
  useMoveBlock,
} from "@tt/client";
import { X } from "lucide-react";
import { useOpenTask } from "@/components/app-shell";
import { TaskCheck } from "@/components/ui/task-check";
import { SlotPicker } from "@/components/timeline/slot-picker";
import { dayColumnId, type DayDropData, type DragItem } from "@/components/workspace/dnd";
import { useDragState } from "@/components/workspace/workspace-dnd";

const GUTTER = 48;

/** How a time block shows: its title, its color, and whether its step or task is done. */
export type BlockLabel = {
  title: string;
  color: string;
  done: boolean;
  listName?: string;
  dueAt: string | null;
};

export type GridProps = {
  /** Which pane this grid is in; keeps drop targets and drag sources unique across panes. */
  paneKey: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
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
};

function weekdayShort(day: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(
    zonedInstant(day, "12:00", tz),
  );
}

/** Day columns of timed events, blocks and open time, under a sticky row of day headers. */
export function Grid(props: GridProps) {
  const { days, tz, hourPx, scrollRef, headerRef } = props;
  const openTask = useOpenTask();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: props.scrollToHour * hourPx });
    // Only on first render: keep the user's scroll position afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDay = props.events.filter((e) => e.all_day);
  const timed = props.events.filter((e) => !e.all_day);
  const cols = `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div
      ref={scrollRef}
      data-grid-scroll
      className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface"
    >
      <div className={days.length > 1 ? "min-w-[680px]" : ""}>
        <div
          ref={headerRef}
          data-grid-header
          className="sticky top-0 z-30 grid border-b border-line bg-surface"
          style={{ gridTemplateColumns: cols }}
        >
          <div />
          {days.map((day) => {
            const isToday = day === props.today;
            const dayAllDay = allDay.filter((e) =>
              daySegment(Date.parse(e.start), Date.parse(e.end), day, tz),
            );
            return (
              <div key={day} className="min-w-0 border-l border-line px-1.5 py-2">
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold tracking-wider uppercase ${isToday ? "text-coral" : "text-muted"}`}
                  >
                    {weekdayShort(day, tz)}
                  </span>
                  <span
                    className={`grid h-6 min-w-6 place-items-center rounded-md px-1 text-[13px] font-extrabold ${isToday ? "bg-ink text-white" : "text-ink"}`}
                  >
                    {Number(day.slice(8))}
                  </span>
                </div>
                {dayAllDay.map((e) => {
                  const c = swatch(e.color);
                  return (
                    <div
                      key={e.gcal_event_id}
                      title={e.title}
                      className={`mt-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${e.busy ? "" : "border border-dashed"}`}
                      style={
                        e.busy
                          ? { background: c.tint, color: c.ink }
                          : { borderColor: c.solid, color: "var(--muted)" }
                      }
                    >
                      {e.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * hourPx }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold text-faint tabular-nums"
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
      </div>
      {props.loading && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-white/50 font-semibold text-muted">
          Loading…
        </div>
      )}
    </div>
  );
}

function DayColumn(
  props: GridProps & {
    day: string;
    isToday: boolean;
    timed: CalendarEvent[];
    onOpenTask: (id: string) => void;
  },
) {
  const { day, tz, hourPx, paneKey } = props;
  const col = dayColumnId(paneKey, day);
  const { setNodeRef } = useDroppable({ id: col, data: { kind: "day", day } satisfies DayDropData });
  const { active, preview } = useDragState();
  const scheduling = !!active && active.kind !== "pane";
  const [picker, setPicker] = useState<{
    anchor: DOMRect;
    start: number;
    end: number;
  } | null>(null);

  const items = useMemo(
    () => layoutDay(day, tz, props.timed, props.blocks, hourPx),
    [props.timed, props.blocks, day, tz, hourPx],
  );

  const free = props.freeSlots.flatMap((s) => {
    const seg = daySegment(s.start, s.end, day, tz);
    return seg ? [{ ...seg, minutes: Math.round((s.end - s.start) / 60_000) }] : [];
  });

  const nowMin = props.isToday ? minutesIntoDay(props.now, day, tz) : null;
  const isPast = day < props.today;
  const weekday = localWeekday(zonedInstant(day, "12:00", tz), tz);
  const tint =
    scheduling && !isPast
      ? "#fbfafe"
      : weekday === 0 || weekday === 6
        ? "#f7f8fb"
        : props.isToday
          ? "#fcf9f7"
          : undefined;
  const ghost = preview?.col === col && scheduling ? preview : null;
  const toY = (min: number) => (min / 60) * hourPx;

  return (
    <div
      ref={setNodeRef}
      data-col={col}
      data-day={day}
      data-hour-px={hourPx}
      className="relative border-l border-line transition-colors"
      style={{ backgroundColor: tint, backgroundImage: gridLines(hourPx) }}
    >
      {free.map((f) => {
        const height = toY(f.endMin - f.startMin);
        return (
          <div
            key={f.startMin}
            data-active={scheduling}
            role="button"
            tabIndex={0}
            aria-label={`Open time, ${formatMinutes(f.minutes)}. Suggest what to do`}
            onClick={(e) => {
              if (scheduling) return;
              setPicker({
                anchor: e.currentTarget.getBoundingClientRect(),
                start: instantAt(day, f.startMin, tz),
                end: instantAt(day, f.endMin, tz),
              });
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.currentTarget.click();
            }}
            className="open-slot absolute inset-x-1 cursor-pointer rounded-lg transition-colors hover:brightness-95"
            style={{ top: toY(f.startMin) + 1, height: height - 2 }}
          >
            {height >= 26 && (
              <span className="absolute top-1 left-2 text-[10px] font-bold tracking-wide text-open-ink uppercase">
                Open · {formatMinutes(f.minutes)}
              </span>
            )}
          </div>
        );
      })}

      {items.map((it) => {
        const style = {
          top: it.top + 1,
          height: it.height - 2,
          left: `calc(${(it.lane / it.lanes) * 100}% + 4px)`,
          width: `calc(${100 / it.lanes}% - 8px)`,
        };
        if (it.kind === "event") return <EventItem key={it.key} event={it.event} tz={tz} style={style} height={it.height} />;
        return (
          <BlockItem
            key={it.key}
            paneKey={paneKey}
            block={it.block}
            day={day}
            segStartMin={it.startMin}
            hourPx={hourPx}
            style={style}
            height={it.height}
            tz={tz}
            now={props.now}
            label={props.blockLabel(it.block)}
            onOpen={props.onOpenTask}
            dimmed={active?.kind === "block" && active.blockId === it.block.id}
          />
        );
      })}

      {ghost && (
        <div
          className={`pointer-events-none absolute inset-x-1 z-[25] flex flex-col items-center justify-center rounded-lg border-2 border-dashed text-center ${
            ghost.past
              ? "border-risk bg-risk-bg/80"
              : "animate-slot-glow border-grape bg-[rgba(135,117,201,0.16)]"
          }`}
          style={{ top: toY(ghost.startMin) + 1, height: toY(ghost.minutes) - 2 }}
        >
          <span className={`text-[11px] font-extrabold ${ghost.past ? "text-risk" : "text-grape-ink"}`}>
            {ghost.past
              ? "That time has passed"
              : `${fmtTime(instantAt(day, ghost.startMin, tz), tz)}–${fmtTime(instantAt(day, ghost.startMin + ghost.minutes, tz), tz)}`}
          </span>
          {!ghost.past && toY(ghost.minutes) > 36 && (
            <span className="text-[10px] font-bold text-grape">
              {active?.kind === "block" ? "drop to move" : "drop to schedule"}
            </span>
          )}
        </div>
      )}

      {nowMin !== null && (
        <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: toY(nowMin) }}>
          <div className="relative h-[2px] bg-now">
            <span className="absolute -top-[4px] -left-1 h-2.5 w-2.5 rounded-full bg-now ring-2 ring-white" />
          </div>
        </div>
      )}

      {picker && (
        <SlotPicker
          anchor={picker.anchor}
          start={picker.start}
          end={picker.end}
          tz={tz}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/** Hour lines, plus fainter half-hour lines once zoomed in far enough to want them. */
function gridLines(hourPx: number) {
  const hours = `repeating-linear-gradient(to bottom, #eef0f5 0 1px, transparent 1px ${hourPx}px)`;
  if (hourPx < 96) return hours;
  const half = hourPx / 2;
  return `${hours}, repeating-linear-gradient(to bottom, transparent 0 ${half}px, #f4f5f9 ${half}px ${half + 1}px, transparent ${half + 1}px ${hourPx}px)`;
}

/**
 * A Google Calendar event: a white card with a bar in its calendar's color, quieter than task
 * blocks so tasks stand out. Free (not busy) events are a dashed outline.
 */
function EventItem({
  event: e,
  tz,
  style,
  height,
}: {
  event: CalendarEvent;
  tz: string;
  style: React.CSSProperties;
  height: number;
}) {
  const c = swatch(e.color);
  const compact = height < 40;
  const time = `${fmtTime(e.start, tz)}–${fmtTime(e.end, tz)}`;
  return (
    <div
      title={`${e.title}\n${time} (Google Calendar${e.busy ? "" : ", free"})`}
      className={`absolute z-[5] overflow-hidden rounded-lg border pr-2 pl-2.5 ${e.busy ? "bg-surface" : "border-dashed bg-white/60"}`}
      style={{ ...style, borderColor: e.busy ? c.tint : c.solid }}
    >
      <span
        className="absolute inset-y-1 left-1 w-[3px] rounded-full"
        style={{ background: c.solid, opacity: e.busy ? 1 : 0.5 }}
      />
      <div className={`flex min-w-0 ${compact ? "h-full items-center gap-1.5" : "flex-col pt-1"}`}>
        <p
          className={`min-w-0 truncate leading-tight font-semibold ${height < 24 ? "text-[11px]" : "text-[12px]"}`}
          style={{ color: e.busy ? c.ink : "var(--muted)" }}
        >
          {e.title}
        </p>
        <p className="shrink-0 truncate text-[11px] leading-tight text-muted">
          {compact ? fmtTime(e.start, tz) : time}
        </p>
      </div>
    </div>
  );
}

function BlockItem(props: {
  paneKey: string;
  block: TimeBlock;
  day: string;
  /** Where this block's segment starts in `day`, in minutes from midnight. */
  segStartMin: number;
  hourPx: number;
  style: React.CSSProperties;
  height: number;
  tz: string;
  now: number;
  label: BlockLabel;
  onOpen: (taskId: string) => void;
  dimmed: boolean;
}) {
  const { block: b, day, tz, label } = props;
  const minutes = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60_000);
  // Past blocks are a record of work done; only upcoming ones can be moved.
  const movable = !isTemp(b.id) && Date.parse(b.end) > props.now;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `block-${b.id}-${props.paneKey}`,
    disabled: !movable,
    data: {
      kind: "block",
      blockId: b.id,
      title: label.title,
      minutes,
      color: label.color,
      listName: label.listName,
      dueAt: label.dueAt,
      sourceHourPx: props.hourPx,
    } satisfies DragItem,
  });
  const removeBlock = useRemoveBlockWithUndo();
  const moveBlock = useMoveBlock();
  const { setTaskDone, setStepDone } = useCompletion();
  const toggleDone = () =>
    b.step_id
      ? setStepDone(b.task_id, b.step_id, !label.done)
      : setTaskDone(b.task_id, !label.done);

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
  const height =
    resizeEnd === null
      ? props.height
      : Math.max(((minutesIntoDay(resizeEnd, day, tz) - props.segStartMin) / 60) * props.hourPx, 14);
  const style =
    resizeEnd === null ? props.style : { ...props.style, height: height - 2, zIndex: 20 };
  const compact = height < 44;
  const past = !movable && !isTemp(b.id);
  const c = swatch(label.color);
  const fg = label.done ? c.ink : c.onSolid;
  const controls = !isTemp(b.id) && !isDragging && resizeEnd === null;

  // Backspace / Delete removes the block under the pointer or the focused one (the task stays),
  // unless you're typing or a dialog (the task sheet, quick add) is open.
  const [armed, setArmed] = useState(false);
  const canRemove = armed && controls;
  useEffect(() => {
    if (!canRemove) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[aria-modal='true']")) return;
      e.preventDefault();
      removeBlock(b, label.title);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRemove, removeBlock, b, label.title]);

  return (
    <div
      className={`group absolute z-10 transition-opacity ${props.dimmed ? "opacity-30" : ""}`}
      style={style}
      onMouseEnter={() => setArmed(true)}
      onMouseLeave={() => setArmed(false)}
      onFocus={() => setArmed(true)}
      onBlur={() => setArmed(false)}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => !isDragging && props.onOpen(b.task_id)}
        title={`${label.title}\n${fmtTime(b.start, tz)}–${fmtTime(b.end, tz)}${movable ? "\nDrag to reschedule, drag the bottom edge to change length" : ""}`}
        className={`absolute inset-0 flex overflow-hidden rounded-lg pr-5 pl-[26px] text-left shadow-[0_3px_8px_rgb(24_24_27/0.12)] ${
          compact ? "items-center" : "flex-col pt-1.5"
        } ${movable ? "cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing" : ""} ${isTemp(b.id) ? "animate-pulse" : ""}`}
        style={{ background: label.done ? c.tint : c.solid, color: fg }}
      >
        <span
          className={`block truncate text-[12px] leading-tight font-bold ${label.done ? "line-through opacity-70" : ""}`}
        >
          {label.title}
        </span>
        {(!compact || resizeEnd !== null) && (
          <span className="mt-0.5 block truncate text-[11px] leading-tight font-medium opacity-80">
            {fmtTime(b.start, tz)}–{fmtTime(shownEnd, tz)}
          </span>
        )}
      </button>
      {controls && (
        <span
          className={`absolute left-1.5 ${compact ? "top-1/2 -translate-y-1/2" : "top-1.5"}`}
        >
          <TaskCheck
            done={label.done}
            color={label.done ? c.solid : c.onSolid}
            checkColor={label.done ? "#fff" : c.solid}
            onToggle={toggleDone}
            label={label.title}
            size={15}
          />
        </span>
      )}
      {controls && (
        <button
          onClick={() => removeBlock(b, label.title)}
          aria-label={`Remove ${label.title} from your calendar`}
          title={
            past
              ? "Didn't get to it? Remove from calendar (or press Backspace; the task stays in your to-dos)"
              : "Remove from calendar (or press Backspace; the task stays)"
          }
          className={`absolute right-0.5 grid size-4 place-items-center rounded opacity-0 group-hover:opacity-100 no-hover:opacity-100 hover:bg-black/10 focus:opacity-100 ${compact ? "top-1/2 -translate-y-1/2" : "top-1"}`}
          style={{ color: fg }}
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      )}
      {movable && endsHere && !isDragging && (
        <div
          onPointerDown={startResize}
          aria-hidden
          className={`absolute inset-x-0 flex cursor-ns-resize ${compact ? "-bottom-0.5 h-1.5" : "bottom-0 h-2.5"} touch-none items-end justify-center pb-0.5`}
        >
          <div className="h-1 w-6 rounded-full opacity-0 group-hover:opacity-60" style={{ background: fg }} />
        </div>
      )}
    </div>
  );
}
