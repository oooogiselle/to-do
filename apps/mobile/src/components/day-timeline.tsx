import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  addDays,
  eventTitle,
  findFreeSlots,
  formatMinutes,
  zonedInstant,
  type CalendarEvent,
  type TimeBlock,
} from "@tt/shared";
import {
  daySegment,
  fmtTime,
  HOUR_PX,
  isTemp,
  layoutDay,
  minutesIntoDay,
  taskColor,
  useCompletion,
  useEvents,
  useModel,
} from "@tt/client";
import { Check } from "@/components/ui";
import { useRefresh } from "@/hooks/use-refresh";
import { tint, useColors, type Colors } from "@/lib/theme";

const GUTTER = 48;
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

/**
 * One day of the timeline: calendar events, scheduled task blocks, open working time and a
 * now line. Tapping a block opens its task.
 */
export function DayTimeline(props: {
  day: string;
  isToday: boolean;
  now: number;
  onOpenTask: (id: string) => void;
}) {
  const { day, now } = props;
  const { blocks, taskById, stepsByTask, listById, settings } = useModel();
  const { setTaskDone, setStepDone } = useCompletion();
  const colors = useColors();
  const { refreshing, refresh } = useRefresh();
  const [width, setWidth] = useState(0);
  const tz = settings.timezone;

  const from = zonedInstant(day, "00:00", tz).getTime();
  const to = zonedInstant(addDays(day, 1), "00:00", tz).getTime();
  const { data } = useEvents(from, to);
  const events = useMemo(() => data?.events ?? [], [data]);
  const allDay = events.filter((e) => e.all_day);

  const dayBlocks = useMemo(
    () => blocks.filter((b) => Date.parse(b.end) > from && Date.parse(b.start) < to),
    [blocks, from, to],
  );
  const items = useMemo(
    () =>
      layoutDay(
        day,
        tz,
        events.filter((e) => !e.all_day),
        dayBlocks,
      ),
    [day, tz, events, dayBlocks],
  );
  // Open working time from now on, like the web timeline's hatched gaps.
  const free = useMemo(
    () =>
      findFreeSlots([...events, ...dayBlocks], {
        workingHours: settings.working_hours,
        timezone: tz,
        from: Math.max(from, now),
        to,
      }).flatMap((s) => {
        const seg = daySegment(s.start, s.end, day, tz);
        return seg ? [{ ...seg, minutes: Math.round((s.end - s.start) / 60_000) }] : [];
      }),
    [events, dayBlocks, settings.working_hours, tz, from, to, now, day],
  );

  const nowMin = props.isToday ? minutesIntoDay(now, day, tz) : null;
  // Open on the hour before now, or on the start of the working day.
  const firstWorkHour = Number(
    Object.values(settings.working_hours).find(Boolean)?.start.split(":")[0] ?? 8,
  );
  const initialY = Math.max(0, ((nowMin ?? firstWorkHour * 60) / 60 - 1) * HOUR_PX);

  const label = (b: TimeBlock) => {
    const task = taskById.get(b.task_id);
    const step = b.step_id ? stepsByTask.get(b.task_id)?.find((s) => s.id === b.step_id) : null;
    return {
      title: eventTitle(null, task?.title ?? "Task", step?.title),
      color: taskColor(task, listById),
      done: step ? step.done : task?.status === "done",
      toggle: (done: boolean) =>
        step ? setStepDone(b.task_id, step.id, done) : setTaskDone(b.task_id, done),
    };
  };

  return (
    <View style={{ flex: 1 }}>
      {allDay.length > 0 && (
        <View style={[styles.allDay, { borderColor: colors.line }]}>
          {allDay.map((e) => (
            <View
              key={`${e.calendar_id}-${e.gcal_event_id}`}
              style={[styles.allDayChip, eventLook(e, colors)]}
            >
              <Text numberOfLines={1} style={[styles.small, { color: colors.eventInk }]}>
                {e.title || "(No title)"}
              </Text>
            </View>
          ))}
        </View>
      )}
      <ScrollView
        contentOffset={{ x: 0, y: initialY }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={{ height: 24 * HOUR_PX, flexDirection: "row" }}>
          <View style={{ width: GUTTER }}>
            {HOURS.map((h) => (
              <Text key={h} style={[styles.hour, { top: h * HOUR_PX - 7, color: colors.muted }]}>
                {fmtTime(zonedInstant(day, `${String(h).padStart(2, "0")}:00`, tz), tz)}
              </Text>
            ))}
          </View>
          <View
            style={[styles.column, { borderColor: colors.line }]}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          >
            {HOURS.map((h) => (
              <View
                key={h}
                style={[styles.gridLine, { top: h * HOUR_PX, backgroundColor: colors.line }]}
              />
            ))}
            {free.map((s) => (
              <View
                key={s.startMin}
                style={[
                  styles.free,
                  {
                    top: (s.startMin / 60) * HOUR_PX,
                    height: ((s.endMin - s.startMin) / 60) * HOUR_PX,
                    backgroundColor: tint(colors.openInk, 0.08),
                  },
                ]}
              >
                {s.endMin - s.startMin >= 30 && (
                  <Text style={[styles.small, { color: colors.openInk }]}>
                    {formatMinutes(s.minutes)} open
                  </Text>
                )}
              </View>
            ))}
            {width > 0 &&
              items.map((item) => {
                const laneW = (width - 4) / item.lanes;
                const box = {
                  top: item.top,
                  height: item.height - 2,
                  left: 2 + item.lane * laneW,
                  width: laneW - 2,
                };
                const short = item.height < 36;
                if (item.kind === "event") {
                  const e = item.event;
                  return (
                    <View key={item.key} style={[styles.item, box, eventLook(e, colors)]}>
                      <Text
                        numberOfLines={short ? 1 : 2}
                        style={[styles.title, { color: colors.eventInk }]}
                      >
                        {e.title || "(No title)"}
                        {short ? ` ${fmtTime(e.start, tz)}` : ""}
                      </Text>
                      {!short && (
                        <Text style={[styles.small, { color: colors.muted }]}>
                          {fmtTime(e.start, tz)}–{fmtTime(e.end, tz)}
                        </Text>
                      )}
                    </View>
                  );
                }
                const b = item.block;
                const l = label(b);
                const temp = isTemp(b.id);
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.title}, ${fmtTime(b.start, tz)} to ${fmtTime(b.end, tz)}`}
                    onPress={() => props.onOpenTask(b.task_id)}
                    style={[
                      styles.item,
                      styles.block,
                      box,
                      {
                        backgroundColor: tint(l.color, 0.18),
                        borderLeftColor: l.color,
                        opacity: temp ? 0.6 : 1,
                      },
                    ]}
                  >
                    <View style={styles.blockRow}>
                      {!short && (
                        <Check
                          checked={l.done}
                          onChange={l.toggle}
                          color={l.color}
                          disabled={temp}
                          label={l.done ? `Mark ${l.title} not done` : `Mark ${l.title} done`}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={short ? 1 : 2}
                          style={[
                            styles.title,
                            { color: l.done ? colors.muted : colors.ink },
                            l.done && styles.struck,
                          ]}
                        >
                          {l.title}
                        </Text>
                        {!short && (
                          <Text style={[styles.small, { color: colors.muted }]}>
                            {fmtTime(b.start, tz)}–{fmtTime(b.end, tz)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            {nowMin !== null && nowMin >= 0 && nowMin <= 24 * 60 && (
              <View
                pointerEvents="none"
                style={[styles.now, { top: (nowMin / 60) * HOUR_PX, backgroundColor: colors.now }]}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Calendar events are a soft tint of their calendar's color; free events a dashed outline. */
function eventLook(e: CalendarEvent, colors: Colors) {
  if (!e.busy)
    return {
      borderWidth: 1,
      borderStyle: "dashed" as const,
      borderColor: e.color ? tint(e.color, 0.6) : colors.lineStrong,
    };
  if (!e.color) return { backgroundColor: colors.event };
  return { backgroundColor: tint(e.color, 0.14), borderWidth: 1, borderColor: tint(e.color, 0.3) };
}

const styles = StyleSheet.create({
  allDay: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingLeft: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allDayChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, maxWidth: "100%" },
  hour: { position: "absolute", right: 6, fontSize: 11 },
  column: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  gridLine: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
  free: { position: "absolute", left: 0, right: 0, alignItems: "flex-end", padding: 4 },
  item: {
    position: "absolute",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: "hidden",
  },
  block: { borderLeftWidth: 3 },
  blockRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  title: { fontSize: 13, fontWeight: "500" },
  struck: { textDecorationLine: "line-through" },
  small: { fontSize: 11 },
  now: { position: "absolute", left: -4, right: 0, height: 2 },
});
