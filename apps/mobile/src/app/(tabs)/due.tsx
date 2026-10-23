import { useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { formatMinutes } from "@tt/shared";
import {
  DUE_RANGES,
  dragMinutes,
  fmtDue,
  fmtWhen,
  taskColor,
  useDueRail,
  useModel,
  type DueRange,
  type RailItem,
} from "@tt/client";
import { NoticeBanner } from "@/components/banners";
import { IconButton } from "@/components/icon-button";
import { ScreenHeader } from "@/components/screen-header";
import { Dot, Segmented } from "@/components/ui";
import { useNow } from "@/hooks/use-now";
import { useRefresh } from "@/hooks/use-refresh";
import { useColors } from "@/lib/theme";

const RANGE_OPTIONS = DUE_RANGES.map((n) => ({ value: n, label: `${n} days` }));

/**
 * Open tasks due soon that still need time on the calendar, flagged when the open time before
 * the deadline can't cover them; then open tasks with no due date.
 */
export default function Due() {
  const { listById, settings } = useModel();
  const colors = useColors();
  const now = useNow();
  const { refreshing, refresh } = useRefresh();
  const [days, setDays] = useState<DueRange>(14);
  const { items, undated, stepPlannedAt } = useDueRail(now, days);
  const tz = settings.timezone;

  const sections = [
    { key: "due", title: null, data: items },
    ...(undated.length ? [{ key: "undated", title: "No due date", data: undated }] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Due"
        right={<IconButton label="Add task" glyph="+" filled onPress={() => router.push("/add")} />}
        below={
          <Segmented
            label="Show tasks due in the next"
            value={days}
            options={RANGE_OPTIONS}
            onChange={setDays}
          />
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.task.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={[styles.section, { color: colors.muted, backgroundColor: colors.paper }]}>
              {section.title} · {section.data.length}
            </Text>
          ) : null
        }
        renderSectionFooter={({ section }) =>
          section.key === "due" && section.data.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Nothing due in the next {days} days needs time.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <DueRow
            item={item}
            color={taskColor(item.task, listById)}
            tz={tz}
            now={now}
            defaultMin={settings.default_block_min}
            stepPlannedAt={stepPlannedAt}
          />
        )}
      />
      <NoticeBanner />
    </View>
  );
}

function DueRow(props: {
  item: RailItem;
  color: string;
  tz: string;
  now: number;
  defaultMin: number;
  stepPlannedAt: Map<string, number>;
}) {
  const colors = useColors();
  const { task, steps, neededMin, freeMin, atRisk, overdue, estimated, plannedAt } = props.item;
  const tone = { color: atRisk ? colors.risk : colors.muted };
  const open = (panel?: "schedule") =>
    router.push({ pathname: "/task/[id]", params: { id: task.id, ...(panel && { panel }) } });

  return (
    <View style={[styles.row, { borderColor: colors.line }]}>
      <Pressable accessibilityRole="button" onPress={() => open()} style={styles.rowMain}>
        <View style={styles.titleRow}>
          <Dot color={props.color} />
          <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
            {task.title}
          </Text>
        </View>
        {task.due_at ? (
          <>
            <Text style={[styles.meta, tone]}>
              {overdue ? "Overdue, was due " : "Due "}
              {fmtDue(task.due_at, props.tz, props.now)}
            </Text>
            <Text style={[styles.meta, tone]}>
              {overdue
                ? `${formatMinutes(neededMin)} of work left`
                : atRisk
                  ? `Needs ${formatMinutes(neededMin)}, only ${formatMinutes(freeMin)} open before then`
                  : `Needs ${formatMinutes(neededMin)}, ${formatMinutes(freeMin)} open before then`}
            </Text>
          </>
        ) : (
          <Text style={[styles.meta, { color: colors.muted }]}>
            Needs {formatMinutes(neededMin)}
          </Text>
        )}
        {plannedAt !== undefined && (
          <Text style={[styles.meta, { color: colors.muted }]}>
            Was planned {fmtWhen(plannedAt, props.tz, props.now)}, not done yet
          </Text>
        )}
        {!estimated && (
          <Text style={[styles.meta, { color: colors.muted }]}>
            No estimate yet, so it schedules as {formatMinutes(dragMinutes(neededMin))}.
          </Text>
        )}
        {steps.map((s) => (
          <View key={s.id} style={[styles.step, { borderColor: colors.line }]}>
            <Text numberOfLines={1} style={[styles.meta, { color: colors.ink, flex: 1 }]}>
              {s.title}
              {props.stepPlannedAt.has(s.id) &&
                ` · was planned ${fmtWhen(props.stepPlannedAt.get(s.id)!, props.tz, props.now)}`}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {formatMinutes(dragMinutes(s.estimate_min ?? props.defaultMin))}
            </Text>
          </View>
        ))}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Schedule ${task.title}`}
        onPress={() => open("schedule")}
        hitSlop={8}
        style={[styles.schedule, { borderColor: colors.lineStrong }]}
      >
        <Text style={{ color: colors.ink, fontSize: 13 }}>Schedule</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: "500",
  },
  empty: { paddingHorizontal: 16, paddingVertical: 20, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "500" },
  meta: { fontSize: 13, paddingLeft: 16 },
  step: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 16,
    marginTop: 4,
    paddingLeft: 8,
    borderLeftWidth: 1,
  },
  schedule: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
});
