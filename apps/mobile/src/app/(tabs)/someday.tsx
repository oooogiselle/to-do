import { useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { linkLabel, type IdeaKind } from "@tt/shared";
import {
  HORIZON_LABEL,
  IDEA_KIND_LABEL,
  isTemp,
  useCompletion,
  useSomeday,
  type SomedayItem,
} from "@tt/client";
import { NoticeBanner } from "@/components/banners";
import { IconButton } from "@/components/icon-button";
import { ScreenHeader } from "@/components/screen-header";
import { Check, Dot, Segmented } from "@/components/ui";
import { useRefresh } from "@/hooks/use-refresh";
import { tint, useColors } from "@/lib/theme";

const KINDS = [
  { value: "all", label: "All" },
  { value: "goal", label: "Goals" },
  { value: "learn", label: "Learn" },
] as const;

/** Long-term goals and things to learn later, grouped by rough timeframe. */
export default function Someday() {
  const colors = useColors();
  const { refreshing, refresh } = useRefresh();
  const [kind, setKind] = useState<IdeaKind | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const { sections } = useSomeday({ kind, showDone });

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Someday"
        right={
          <IconButton
            label="Add to Someday"
            glyph="+"
            filled
            onPress={() => router.push({ pathname: "/add", params: { someday: "1" } })}
          />
        }
        below={
          <View style={styles.controls}>
            <Segmented label="Show" value={kind} options={KINDS} onChange={setKind} />
            <View style={styles.showDone}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Show done</Text>
              <Switch value={showDone} onValueChange={setShowDone} />
            </View>
          </View>
        }
      />
      <SectionList
        sections={sections.map((s) => ({
          key: s.horizon ?? "none",
          title: s.horizon ? HORIZON_LABEL[s.horizon] : "Whenever",
          data: s.items,
        }))}
        keyExtractor={(i) => i.task.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={[styles.section, { backgroundColor: colors.paper }]}>
            <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 15 }}>
              {section.title}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>{section.data.length}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            {kind === "all"
              ? "Nothing parked yet. Tap + to save a goal, or a link to something you want to learn later."
              : "Nothing here with this filter."}
          </Text>
        }
        renderItem={({ item }) => <IdeaRow item={item} />}
      />
      <NoticeBanner />
    </View>
  );
}

function IdeaRow({ item }: { item: SomedayItem }) {
  const colors = useColors();
  const { setTaskDone } = useCompletion();
  const { task, list, progress } = item;
  const done = task.status === "done";
  const temp = isTemp(task.id);
  const color = task.color ?? list.color;

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
          <Dot color={color} />
        </View>
        {(task.idea_kind || task.link_url || progress.total > 0) && (
          <View style={styles.meta}>
            {task.idea_kind && (
              <Text
                style={[
                  styles.tag,
                  {
                    color: task.idea_kind === "goal" ? colors.warn : colors.now,
                    backgroundColor:
                      task.idea_kind === "goal" ? colors.warnBg : tint(colors.now, 0.12),
                  },
                ]}
              >
                {IDEA_KIND_LABEL[task.idea_kind]}
              </Text>
            )}
            {task.link_url && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open ${linkLabel(task.link_url)}`}
                hitSlop={8}
                onPress={() => void WebBrowser.openBrowserAsync(task.link_url!)}
              >
                <Text style={{ color: colors.now, fontSize: 13 }}>↗ {linkLabel(task.link_url)}</Text>
              </Pressable>
            )}
            {progress.total > 0 && (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {progress.done}/{progress.total} steps
              </Text>
            )}
          </View>
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
  empty: { paddingHorizontal: 16, paddingVertical: 24, fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flexShrink: 1, fontSize: 16 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  tag: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: "hidden",
  },
});
