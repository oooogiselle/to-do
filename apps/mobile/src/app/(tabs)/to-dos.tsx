import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { formatMinutes, type Task } from "@tt/shared";
import {
  fmtDue,
  fmtWhen,
  isTemp,
  NO_COLOR,
  PRIORITY_MARK,
  useCompletion,
  useInbox,
  useModel,
  type InboxSort,
} from "@tt/client";
import { NoticeBanner } from "@/components/banners";
import { IconButton } from "@/components/icon-button";
import { ScreenHeader } from "@/components/screen-header";
import { Check, Dot, Segmented } from "@/components/ui";
import { useRefresh } from "@/hooks/use-refresh";
import { useColors } from "@/lib/theme";

const SORTS = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
] as const;

/** Every open task, grouped by list. */
export default function Inbox() {
  const { settings, tasks, isLoading } = useModel();
  const colors = useColors();
  const { refreshing, refresh } = useRefresh();
  const [sort, setSort] = useState<InboxSort>("due");
  const [showDone, setShowDone] = useState(false);
  const { groups, nextBlock } = useInbox(sort, showDone);

  const sections = groups.map((g) => ({
    key: g.list?.id ?? "none",
    name: g.list?.name ?? "No list",
    color: g.list?.color ?? colors.lineStrong,
    data: g.tasks,
  }));

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="To-dos"
        right={<IconButton label="Add task" glyph="+" filled onPress={() => router.push("/add")} />}
        below={
          <View style={styles.controls}>
            <Segmented label="Sort by" value={sort} options={SORTS} onChange={setSort} />
            <View style={styles.showDone}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Show done</Text>
              <Switch value={showDone} onValueChange={setShowDone} />
            </View>
          </View>
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={[styles.section, { backgroundColor: colors.paper }]}>
            <Dot color={section.color} size={10} />
            <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 15 }}>
              {section.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>{section.data.length}</Text>
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length ? null : (
            <Text style={[styles.empty, { color: colors.muted }]}>No open tasks.</Text>
          )
        }
        ListFooterComponent={
          !isLoading && !tasks.length ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              No tasks yet. Tap + to add your first one.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <TaskRow task={item} tz={settings.timezone} nextAt={nextBlock.get(item.id)} />
        )}
      />
      <NoticeBanner />
    </View>
  );
}

function TaskRow({ task, tz, nextAt }: { task: Task; tz: string; nextAt?: number }) {
  const colors = useColors();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const overdue = !done && !!task.due_at && Date.parse(task.due_at) < Date.now();
  const temp = isTemp(task.id);
  const meta = [
    !done && nextAt !== undefined && fmtWhen(nextAt, tz),
    nextAt === undefined && !done && task.estimate_min && formatMinutes(task.estimate_min),
  ].filter(Boolean);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Check
        checked={done}
        onChange={(d) => setTaskDone(task.id, d)}
        disabled={temp}
        label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
      />
      <Pressable
        accessibilityRole="button"
        disabled={temp}
        onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
        style={styles.rowMain}
      >
        <View style={styles.titleRow}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              { color: done ? colors.muted : colors.ink },
              done && { textDecorationLine: "line-through" },
            ]}
          >
            {task.title}
          </Text>
          {task.color && task.color !== NO_COLOR && <Dot color={task.color} />}
          {task.priority !== "none" && (
            <Text style={{ color: colors.risk, fontSize: 13, fontWeight: "600" }}>
              {PRIORITY_MARK[task.priority]}
            </Text>
          )}
        </View>
        {(meta.length > 0 || task.due_at) && (
          <Text style={{ fontSize: 13, color: overdue ? colors.risk : colors.muted }}>
            {[...meta, task.due_at && `Due ${fmtDue(task.due_at, tz)}`].filter(Boolean).join(" · ")}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  showDone: { flexDirection: "row", alignItems: "center", gap: 8 },
  section: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  empty: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flexShrink: 1, fontSize: 16 },
});
