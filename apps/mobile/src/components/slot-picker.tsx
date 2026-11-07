import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  addDays,
  ApiError,
  formatMinutes,
  localDate,
  taskKind,
  zonedInstant,
  type Energy,
  type SuggestFocus,
} from "@tt/shared";
import { contactLabel, fmtTime, taskColor, useModel, useSlotPicks } from "@tt/client";
import { Dot } from "@/components/ui";
import { tint, useColors } from "@/lib/theme";

const ENERGIES: { id: Energy; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "ok", label: "OK" },
  { id: "high", label: "High" },
];
const FOCUSES: { id: SuggestFocus; label: string }[] = [
  { id: "any", label: "Anything" },
  { id: "assignments", label: "Assignments" },
  { id: "build", label: "Build" },
  { id: "learn", label: "Learn" },
  { id: "people", label: "People" },
];
const PLACEHOLDER: Record<SuggestFocus, string> = {
  any: "Not quite right? Tell me what you'd prefer",
  assignments: "Not quite right? Tell me what you'd prefer",
  build: "Anything specific you want to build?",
  learn: "Anything specific? e.g. learn Rust",
  people: "Anyone specific? Or: called Mom on Tuesday",
};

function errorText(err: unknown) {
  if (err instanceof ApiError && (err.status === 429 || err.status === 503)) return err.message;
  return "Couldn't get suggestions. Try again.";
}

/**
 * Bottom sheet on a tapped free gap: up to 3 AI picks to schedule, steered by focus, energy and
 * feedback. Pressing deadlines still come first. Under People it can propose new people to reach
 * out to and log past contact.
 */
export function SlotPicker(props: { start: number; end: number; tz: string; onClose: () => void }) {
  const { start, end, tz, onClose } = props;
  const colors = useColors();
  const { taskById, listById, stepsByTask } = useModel();
  const { suggest, picks, ideas, logs, note, isPending, error, accept, acceptIdea, logContact } =
    useSlotPicks();
  const [energy, setEnergy] = useState<Energy | undefined>();
  const [focus, setFocus] = useState<SuggestFocus>("any");
  const [feedback, setFeedback] = useState("");
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const shown = useRef(new Set<string>());
  const today = localDate(new Date(), tz);

  type Ask = { energy?: Energy; focus?: SuggestFocus; feedback?: string; fresh?: boolean };
  const ask = (opts: Ask = {}) => {
    setLogged(new Set());
    suggest(
      {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        energy: opts.energy,
        focus: opts.focus && opts.focus !== "any" ? opts.focus : undefined,
        feedback: opts.feedback?.trim() || undefined,
        exclude_task_ids: opts.fresh ? [...shown.current] : undefined,
      },
      { onSuccess: (r) => r.picks.forEach((p) => shown.current.add(p.task_id)) },
    );
  };
  const kindOf = (taskId: string) => {
    const task = taskById.get(taskId);
    return task ? taskKind(task, listById.get(task.list_id ?? "")?.kind) : null;
  };
  const chipStyle = (on: boolean) => [
    styles.chip,
    {
      borderColor: on ? colors.now : colors.line,
      backgroundColor: on ? tint(colors.now, 0.12) : colors.paper,
    },
  ];
  const chipText = (on: boolean) => ({
    color: on ? colors.now : colors.ink,
    fontWeight: "700" as const,
    fontSize: 13,
  });

  useEffect(() => {
    ask();
    // Once, when the gap is tapped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mins = Math.round((end - start) / 60_000);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close suggestions" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.ink }]}>What to do here?</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            {fmtTime(start, tz)}–{fmtTime(end, tz)} · {formatMinutes(mins)} open
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            accessibilityLabel="What do you feel like doing?"
          >
            <Text style={[styles.label, { color: colors.muted }]}>FOCUS</Text>
            {FOCUSES.map((f) => {
              const on = focus === f.id;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  disabled={isPending}
                  onPress={() => {
                    if (on) return;
                    setFocus(f.id);
                    shown.current.clear();
                    ask({ energy, focus: f.id, feedback });
                  }}
                  style={chipStyle(on)}
                >
                  <Text style={chipText(on)}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.muted }]}>ENERGY</Text>
            {ENERGIES.map((e) => {
              const on = energy === e.id;
              return (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  disabled={isPending}
                  onPress={() => {
                    const next = on ? undefined : e.id;
                    setEnergy(next);
                    shown.current.clear();
                    ask({ energy: next, focus, feedback });
                  }}
                  style={chipStyle(on)}
                >
                  <Text style={chipText(on)}>{e.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={styles.picks} keyboardShouldPersistTaps="handled">
            {isPending && <ActivityIndicator style={{ marginVertical: 24 }} color={colors.muted} />}
            {!isPending && error && (
              <Text style={[styles.msg, { color: colors.risk }]}>{errorText(error)}</Text>
            )}
            {!isPending &&
              logs.map((l) => {
                const task = taskById.get(l.task_id);
                if (!task) return null;
                const key = `${l.task_id}:${l.date}`;
                const done = logged.has(key);
                return (
                  <View key={key} style={[styles.card, { backgroundColor: colors.open, borderColor: colors.open }]}>
                    <Text style={{ flex: 1, color: colors.openInk, fontSize: 13 }}>
                      {done ? "Logged" : "Log"} <Text style={{ fontWeight: "700" }}>{task.title}</Text> on{" "}
                      {contactLabel(l.date, today)}
                      {done ? "." : "?"}
                    </Text>
                    {!done && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          logContact(l);
                          setLogged((s) => new Set(s).add(key));
                        }}
                        style={[styles.schedule, { backgroundColor: colors.ink }]}
                      >
                        <Text style={{ color: colors.surface, fontWeight: "800", fontSize: 13 }}>Log it</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            {!isPending &&
              picks?.map((p) => {
                const task = taskById.get(p.task_id);
                const step = p.step_id
                  ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id)
                  : null;
                const kind = kindOf(p.task_id);
                const urgent = focus !== "any" && focus !== "assignments" && kind === "assignment";
                const person = kind === "people" || (focus === "people" && kind === "personal");
                return (
                  <View key={p.task_id} style={[styles.card, { borderColor: colors.line }]}>
                    <Dot color={taskColor(task, listById)} size={10} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text
                          style={[styles.cardTitle, { color: colors.ink, flexShrink: 1 }]}
                          numberOfLines={1}
                        >
                          {task?.title ?? "Task"}
                        </Text>
                        {urgent && (
                          <Text style={[styles.tag, { color: colors.risk, backgroundColor: tint(colors.risk, 0.12) }]}>
                            Due soon
                          </Text>
                        )}
                      </View>
                      {step && (
                        <Text style={{ color: colors.eventInk, fontSize: 12 }} numberOfLines={1}>
                          {step.title}
                        </Text>
                      )}
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{p.reason}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
                        {fmtTime(p.start, tz)}–{fmtTime(p.end, tz)}
                      </Text>
                      {person && task && (
                        <AlreadyDid
                          today={today}
                          tz={tz}
                          onLog={(date) => {
                            logContact({ task_id: task.id, date });
                            // They've done it, so offer something else.
                            ask({ energy, focus, feedback, fresh: true });
                          }}
                        />
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Schedule ${task?.title ?? "task"}`}
                      onPress={() => {
                        accept(p);
                        onClose();
                      }}
                      style={[styles.schedule, { backgroundColor: colors.ink }]}
                    >
                      <Text style={{ color: colors.surface, fontWeight: "800", fontSize: 13 }}>
                        Schedule
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            {!isPending &&
              ideas.map((idea, i) => (
                <View
                  key={`idea-${i}`}
                  style={[styles.card, { borderColor: colors.lineStrong, borderStyle: "dashed" }]}
                >
                  <Dot color={colors.openInk} size={10} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.cardTitle, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                        {idea.title}
                      </Text>
                      <Text style={[styles.tag, { color: colors.openInk, backgroundColor: colors.open }]}>New</Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{idea.reason}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
                      {fmtTime(idea.start, tz)}–{fmtTime(idea.end, tz)} · saved to Someday
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Schedule ${idea.title}`}
                    onPress={() => {
                      void acceptIdea(idea);
                      onClose();
                    }}
                    style={[styles.schedule, { backgroundColor: colors.ink }]}
                  >
                    <Text style={{ color: colors.surface, fontWeight: "800", fontSize: 13 }}>Schedule</Text>
                  </Pressable>
                </View>
              ))}
            {!isPending && !error && picks?.length === 0 && !ideas.length && (
              <Text style={[styles.msg, { color: colors.muted }]}>
                {note ?? "Nothing fits this gap well."}
              </Text>
            )}
            {!isPending && !error && !!picks?.length && !!note && (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{note}</Text>
            )}
          </ScrollView>

          <View style={styles.row}>
            <TextInput
              value={feedback}
              onChangeText={setFeedback}
              maxLength={300}
              placeholder={PLACEHOLDER[focus]}
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              onSubmitEditing={() => ask({ energy, focus, feedback, fresh: true })}
              style={[
                styles.input,
                { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={() => ask({ energy, focus, feedback, fresh: true })}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.paper }]}
            >
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 13 }}>
                {feedback.trim() ? "Regenerate" : "Shuffle"}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.notNow}>
            <Text style={{ color: colors.muted, fontWeight: "600" }}>Not now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "Already did this": log today, yesterday or an earlier day you connected with them. */
function AlreadyDid(props: { today: string; tz: string; onLog: (date: string) => void }) {
  const { today, tz, onLog } = props;
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const link = { color: colors.now, fontSize: 12, fontWeight: "700" as const };
  if (!open) {
    return (
      <Pressable accessibilityRole="button" hitSlop={6} onPress={() => setOpen(true)} style={{ marginTop: 4 }}>
        <Text style={link}>Already did this…</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.titleRow, { marginTop: 4, flexWrap: "wrap" }]}>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={() => onLog(today)}>
        <Text style={link}>Today</Text>
      </Pressable>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={() => onLog(addDays(today, -1))}>
        <Text style={link}>Yesterday</Text>
      </Pressable>
      <DateTimePicker
        mode="date"
        display="compact"
        value={zonedInstant(addDays(today, -2), "12:00", tz)}
        maximumDate={zonedInstant(today, "12:00", tz)}
        timeZoneName={tz}
        accessibilityLabel="An earlier day"
        onChange={(e, d) => e.type === "set" && d && onLog(localDate(d, tz))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: "800" },
  sub: { fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center",
  },
  picks: { maxHeight: 320 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { fontSize: 11, fontWeight: "800", borderRadius: 6, paddingHorizontal: 5, overflow: "hidden" },
  schedule: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  msg: { fontSize: 14, paddingVertical: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  notNow: { alignItems: "center", paddingVertical: 6 },
});
