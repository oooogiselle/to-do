import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  formatMinutes,
  linkLabel,
  localDate,
  normalizeLink,
  type Priority,
  type Step,
  type Task,
  type TimeBlock,
} from "@tt/shared";
import {
  fmtDay,
  fmtSlot,
  fmtTime,
  isTemp,
  NO_COLOR,
  PALETTE,
  tempId,
  useCompletion,
  useCreateStep,
  useDeleteBlock,
  useDeleteTask,
  useModel,
  useMoveBlock,
  useSlotSuggestions,
  useUpdateStep,
  useUpdateTask,
} from "@tt/client";
import { NoticeBanner } from "@/components/banners";
import { Chip, CommitInput, DueField, ListField } from "@/components/fields";
import { Button, Check, Segmented } from "@/components/ui";
import { useColors } from "@/lib/theme";

const PRIORITIES = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "med", label: "Medium" },
  { value: "high", label: "High" },
] as const satisfies readonly { value: Priority; label: string }[];

const IDEA_KINDS = [
  { value: "none", label: "—" },
  { value: "goal", label: "Goal" },
  { value: "learn", label: "Learn" },
] as const;
const HORIZONS = [
  { value: "none", label: "—" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "someday", label: "Someday" },
] as const;

export default function TaskSheet() {
  const { id, panel } = useLocalSearchParams<{ id: string; panel?: "schedule" }>();
  const { taskById, stepsByTask, blocks, lists, listById, settings } = useModel();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { setTaskDone } = useCompletion();
  const colors = useColors();
  const [scheduling, setScheduling] = useState(panel === "schedule");
  const task = taskById.get(id);

  if (!task) {
    return (
      <View style={styles.root}>
        <Text style={{ color: colors.muted }}>This task was deleted or hasn't loaded yet.</Text>
      </View>
    );
  }

  const steps = stepsByTask.get(task.id) ?? [];
  const taskBlocks = blocks.filter((b) => b.task_id === task.id);
  const saving = isTemp(task.id);
  const update = (patch: Partial<Task>) =>
    !saving && updateTask.mutate({ id: task.id, patch: patch as never });
  const stepTotal = steps.reduce((sum, s) => sum + (s.estimate_min ?? 0), 0);
  const listColor = (task.list_id && listById.get(task.list_id)?.color) || NO_COLOR;
  const done = task.status === "done";

  const confirmDelete = () =>
    Alert.alert(`Delete “${task.title}”?`, "Its blocks are removed from your calendar too.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteTask.mutate(task.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <View style={{ paddingTop: 4 }}>
            <Check
              checked={done}
              disabled={saving}
              onChange={(d) => setTaskDone(task.id, d)}
              label={done ? "Mark as not done" : "Mark as done"}
            />
          </View>
          <CommitInput
            accessibilityLabel="Title"
            value={task.title}
            multiline
            blurOnSubmit
            onCommit={(title) => title.trim() && update({ title: title.trim() })}
            style={[
              styles.title,
              done && { color: colors.muted, textDecorationLine: "line-through" },
            ]}
          />
        </View>

        <Field label="List">
          <ListField
            value={task.list_id && lists.some((l) => l.id === task.list_id) ? task.list_id : null}
            lists={lists}
            onChange={(list_id) => update({ list_id })}
          />
        </Field>

        {listById.get(task.list_id ?? "")?.kind === "someday" ? (
          <>
            <Field label="Type">
              <Segmented
                label="Type"
                value={task.idea_kind ?? "none"}
                options={IDEA_KINDS}
                onChange={(v) => update({ idea_kind: v === "none" ? null : v })}
              />
            </Field>
            <Field label="Timeframe">
              <Segmented
                label="Timeframe"
                value={task.horizon ?? "none"}
                options={HORIZONS}
                onChange={(v) => update({ horizon: v === "none" ? null : v })}
              />
            </Field>
            <Field label="Link">
              <View style={styles.inline}>
                <CommitInput
                  accessibilityLabel="Link"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  value={task.link_url ?? ""}
                  placeholder="Where you saw it"
                  onCommit={(v) => {
                    const link = normalizeLink(v);
                    if (link === undefined) Alert.alert("That doesn't look like a link.");
                    else if (link !== task.link_url) update({ link_url: link });
                  }}
                  style={[styles.box, { borderColor: colors.line, flex: 1 }]}
                />
                {task.link_url && <OpenLink url={task.link_url} />}
              </View>
            </Field>
          </>
        ) : (
          task.link_url && (
            <Field label="Link">
              <OpenLink url={task.link_url} />
            </Field>
          )
        )}

        <Field label="Color">
          <View style={styles.swatches}>
            <Swatch
              color={listColor}
              on={!task.color}
              onPress={() => update({ color: null })}
              label="Same as list"
            />
            {PALETTE.map((c) => (
              <Swatch
                key={c}
                color={c}
                on={task.color === c}
                onPress={() => update({ color: c })}
                label={c}
              />
            ))}
          </View>
        </Field>

        <Field label="Due">
          <DueField
            value={task.due_at}
            tz={settings.timezone}
            onChange={(due_at) => update({ due_at })}
          />
        </Field>

        <Field label="Priority">
          <Segmented
            label="Priority"
            value={task.priority}
            options={PRIORITIES}
            onChange={(priority) => update({ priority })}
          />
        </Field>

        <Field label="Estimate">
          <View style={styles.inline}>
            <CommitInput
              accessibilityLabel="Estimate in minutes"
              keyboardType="number-pad"
              returnKeyType="done"
              value={task.estimate_min?.toString() ?? ""}
              placeholder="—"
              onCommit={(v) => {
                const n = parseInt(v, 10);
                update({ estimate_min: Number.isFinite(n) && n > 0 ? n : null });
              }}
              style={[styles.box, { borderColor: colors.line, width: 70 }]}
            />
            <Text style={{ color: colors.muted }}>min</Text>
            {stepTotal > 0 && stepTotal !== task.estimate_min && (
              <Pressable onPress={() => update({ estimate_min: stepTotal })} hitSlop={6}>
                <Text
                  style={{ color: colors.muted, textDecorationLine: "underline", fontSize: 13 }}
                >
                  Use step total ({formatMinutes(stepTotal)})
                </Text>
              </Pressable>
            )}
          </View>
        </Field>

        <ScheduledBlocks blocks={taskBlocks} steps={steps} tz={settings.timezone} />

        {scheduling ? (
          <SchedulePanel task={task} onClose={() => setScheduling(false)} />
        ) : (
          <Button
            title="Schedule"
            onPress={() => setScheduling(true)}
            disabled={saving || task.status !== "open"}
          />
        )}

        <StepsEditor taskId={task.id} steps={steps} disabled={saving} />

        <Field label="Notes">
          <CommitInput
            accessibilityLabel="Notes"
            value={task.notes}
            multiline
            onCommit={(notes) => update({ notes })}
            style={[styles.box, styles.notes, { borderColor: colors.line }]}
          />
        </Field>
        {task.source_quote && (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            From your import: “{task.source_quote}”
          </Text>
        )}

        <Button title="Delete task" kind="danger" onPress={confirmDelete} />
      </ScrollView>
      <NoticeBanner />
    </View>
  );
}

function OpenLink({ url }: { url: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${linkLabel(url)}`}
      hitSlop={8}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
    >
      <Text style={{ color: colors.now, fontSize: 15 }}>↗ {linkLabel(url)}</Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

function Swatch(props: { color: string; on: boolean; onPress: () => void; label: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.on }}
      onPress={props.onPress}
      hitSlop={4}
      style={[
        styles.swatch,
        { backgroundColor: props.color, borderColor: props.on ? colors.ink : "transparent" },
      ]}
    />
  );
}

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/**
 * The task's blocks. Upcoming ones show their length; tapping it offers other lengths, which
 * save right away. Any block can be removed (deletes the gcal event, the task stays).
 */
function ScheduledBlocks(props: { blocks: TimeBlock[]; steps: Step[]; tz: string }) {
  const remove = useDeleteBlock();
  const move = useMoveBlock();
  const colors = useColors();
  const [editing, setEditing] = useState<string | null>(null);
  if (!props.blocks.length) return null;
  const now = Date.now();
  const sorted = [...props.blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return (
    <Field label="On your calendar">
      <View style={[styles.card, { borderColor: colors.line }]}>
        {sorted.map((b, i) => {
          const past = Date.parse(b.end) <= now;
          const step = b.step_id ? props.steps.find((s) => s.id === b.step_id) : null;
          const start = Date.parse(b.start);
          const current = Math.round((Date.parse(b.end) - start) / 60_000);
          // A block that's already started can't be cut short into the past.
          const lengths = (
            DURATIONS.includes(current) ? DURATIONS : [...DURATIONS, current].sort((x, y) => x - y)
          ).filter((m) => m === current || start + m * 60_000 > now);
          return (
            <View
              key={b.id}
              style={
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }
              }
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: past ? colors.muted : colors.ink, fontSize: 15 }}>
                    {fmtDay(localDate(new Date(b.start), props.tz), props.tz)},{" "}
                    {fmtTime(b.start, props.tz)}–{fmtTime(b.end, props.tz)}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {step?.title ?? "Whole task"}
                  </Text>
                </View>
                {!past && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Length ${formatMinutes(current)}, tap to change`}
                    disabled={isTemp(b.id)}
                    onPress={() => setEditing(editing === b.id ? null : b.id)}
                    hitSlop={6}
                    style={[styles.lengthButton, { borderColor: colors.lineStrong }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 13 }}>
                      {formatMinutes(current)} {editing === b.id ? "▴" : "▾"}
                    </Text>
                  </Pressable>
                )}
                <Pressable disabled={isTemp(b.id)} onPress={() => remove.mutate(b.id)} hitSlop={8}>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {past ? "Didn't do it" : "Remove"}
                  </Text>
                </Pressable>
              </View>
              {editing === b.id && !past && (
                <View style={[styles.swatches, styles.lengths]}>
                  {lengths.map((m) => (
                    <Chip
                      key={m}
                      label={formatMinutes(m)}
                      on={m === current}
                      onPress={() => {
                        if (m !== current)
                          move.mutate({
                            id: b.id,
                            start: b.start,
                            end: new Date(start + m * 60_000).toISOString(),
                          });
                        setEditing(null);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
      {remove.isError && <Text style={{ color: colors.risk }}>{remove.error.message}</Text>}
      {move.isError && <Text style={{ color: colors.risk }}>{move.error.message}</Text>}
    </Field>
  );
}

/** Top-3 open slots before the due date; choosing one puts it on the calendar. */
function SchedulePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { settings } = useModel();
  const colors = useColors();
  const { now, due, neededMin, suggestions, isLoading, stepTitle, choose } =
    useSlotSuggestions(task);
  const range = (start: number, end: number) => fmtSlot(start, end, settings.timezone, now);

  return (
    <View style={[styles.card, styles.panel, { borderColor: colors.lineStrong }]}>
      <View style={styles.inline}>
        <Text style={{ flex: 1, color: colors.ink, fontWeight: "600", fontSize: 15 }}>
          {neededMin ? `Find ${formatMinutes(neededMin)} before it's due` : "Fully scheduled"}
        </Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.muted }}>Cancel</Text>
        </Pressable>
      </View>
      {neededMin === 0 ? (
        <Text style={{ color: colors.muted }}>
          Every remaining step already has time on your calendar.
        </Text>
      ) : isLoading ? (
        <Text style={{ color: colors.muted }}>Looking for open time…</Text>
      ) : due !== null && due <= now ? (
        <Text style={{ color: colors.muted }}>
          This is past due. Change the due date to find time.
        </Text>
      ) : suggestions.length === 0 ? (
        <Text style={{ color: colors.muted }}>
          No open time before it's due. Widen your working hours in Settings on the web.
        </Text>
      ) : (
        suggestions.map((s, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            onPress={() => {
              choose(s);
              onClose();
            }}
            style={({ pressed }) => [
              styles.suggestion,
              { borderColor: pressed ? colors.now : colors.line },
            ]}
          >
            {s.kind === "split" ? (
              <>
                <Text style={{ color: colors.ink, fontWeight: "500" }}>
                  Split across {s.blocks.length} sessions, one step each
                </Text>
                {s.blocks.map((b) => (
                  <Text key={b.start} style={{ color: colors.muted, fontSize: 13 }}>
                    {range(b.start, b.end)}: {stepTitle(b.step_id)}
                  </Text>
                ))}
              </>
            ) : (
              <>
                <Text style={{ color: colors.ink, fontWeight: "500" }}>
                  {range(s.blocks[0]!.start, s.blocks[0]!.end)}
                </Text>
                {s.kind === "partial" && (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    Covers {formatMinutes(s.coversMin)} of {formatMinutes(neededMin)}
                  </Text>
                )}
              </>
            )}
          </Pressable>
        ))
      )}
    </View>
  );
}

function StepsEditor(props: { taskId: string; steps: Step[]; disabled: boolean }) {
  const { taskId, steps } = props;
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const { setStepDone, deleteStep } = useCompletion();
  const colors = useColors();
  const [title, setTitle] = useState("");

  const add = () => {
    if (!title.trim() || props.disabled) return;
    const order = (steps.at(-1)?.order ?? -1) + 1;
    createStep.mutate({ tempId: tempId(), body: { task_id: taskId, title: title.trim(), order } });
    setTitle("");
  };

  return (
    <Field label="Steps">
      <View style={[styles.card, { borderColor: colors.line }]}>
        {steps.map((s) => {
          const temp = isTemp(s.id);
          return (
            <View
              key={s.id}
              style={[
                styles.cardRow,
                { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
              ]}
            >
              <Check
                checked={s.done}
                disabled={temp}
                onChange={(d) => setStepDone(taskId, s.id, d)}
                label={`Done: ${s.title}`}
              />
              <CommitInput
                accessibilityLabel="Step title"
                value={s.title}
                editable={!temp}
                onCommit={(v) =>
                  v.trim() && updateStep.mutate({ id: s.id, patch: { title: v.trim() } })
                }
                style={[
                  { flex: 1 },
                  s.done && { color: colors.muted, textDecorationLine: "line-through" },
                ]}
              />
              <CommitInput
                accessibilityLabel="Step estimate in minutes"
                keyboardType="number-pad"
                returnKeyType="done"
                value={s.estimate_min?.toString() ?? ""}
                placeholder="min"
                editable={!temp}
                onCommit={(v) => {
                  const n = parseInt(v, 10);
                  updateStep.mutate({
                    id: s.id,
                    patch: { estimate_min: Number.isFinite(n) && n > 0 ? n : null },
                  });
                }}
                style={{ width: 44, textAlign: "right", color: colors.muted }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete step ${s.title}`}
                disabled={temp}
                onPress={() => deleteStep(taskId, s.id)}
                hitSlop={8}
              >
                <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
          );
        })}
        <TextInput
          accessibilityLabel="New step"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Add a step"
          placeholderTextColor={colors.muted}
          style={[styles.cardRow, { color: colors.ink, fontSize: 15 }]}
        />
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 24, gap: 18, paddingBottom: 60 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: "600" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lengthButton: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  lengths: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 3 },
  box: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  notes: { minHeight: 80, textAlignVertical: "top" },
  card: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  panel: { padding: 12, gap: 10 },
  suggestion: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 2 },
});
