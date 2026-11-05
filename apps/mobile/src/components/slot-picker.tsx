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
import { ApiError, formatMinutes, type Energy } from "@tt/shared";
import { fmtTime, taskColor, useModel, useSlotPicks } from "@tt/client";
import { Dot } from "@/components/ui";
import { tint, useColors } from "@/lib/theme";

const ENERGIES: { id: Energy; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "ok", label: "OK" },
  { id: "high", label: "High" },
];

function errorText(err: unknown) {
  if (err instanceof ApiError && (err.status === 429 || err.status === 503)) return err.message;
  return "Couldn't get suggestions. Try again.";
}

/** Bottom sheet on a tapped free gap: up to 3 AI picks to schedule, with energy and feedback. */
export function SlotPicker(props: { start: number; end: number; tz: string; onClose: () => void }) {
  const { start, end, tz, onClose } = props;
  const colors = useColors();
  const { taskById, listById, stepsByTask } = useModel();
  const { suggest, picks, note, isPending, error, accept } = useSlotPicks();
  const [energy, setEnergy] = useState<Energy | undefined>();
  const [feedback, setFeedback] = useState("");
  const shown = useRef(new Set<string>());

  const ask = (opts: { energy?: Energy; feedback?: string; fresh?: boolean } = {}) =>
    suggest(
      {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        energy: opts.energy,
        feedback: opts.feedback?.trim() || undefined,
        exclude_task_ids: opts.fresh ? [...shown.current] : undefined,
      },
      { onSuccess: (r) => r.picks.forEach((p) => shown.current.add(p.task_id)) },
    );

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
                    ask({ energy: next, feedback });
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? colors.now : colors.line,
                      backgroundColor: on ? tint(colors.now, 0.12) : colors.paper,
                    },
                  ]}
                >
                  <Text style={{ color: on ? colors.now : colors.ink, fontWeight: "700", fontSize: 13 }}>
                    {e.label}
                  </Text>
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
              picks?.map((p) => {
                const task = taskById.get(p.task_id);
                const step = p.step_id
                  ? stepsByTask.get(p.task_id)?.find((s) => s.id === p.step_id)
                  : null;
                return (
                  <View key={p.task_id} style={[styles.card, { borderColor: colors.line }]}>
                    <Dot color={taskColor(task, listById)} size={10} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>
                        {task?.title ?? "Task"}
                      </Text>
                      {step && (
                        <Text style={{ color: colors.eventInk, fontSize: 12 }} numberOfLines={1}>
                          {step.title}
                        </Text>
                      )}
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{p.reason}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
                        {fmtTime(p.start, tz)}–{fmtTime(p.end, tz)}
                      </Text>
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
            {!isPending && !error && picks?.length === 0 && (
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
              placeholder="Not quite right? Tell me what you'd prefer"
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              onSubmitEditing={() => ask({ energy, feedback, fresh: true })}
              style={[
                styles.input,
                { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={() => ask({ energy, feedback, fresh: true })}
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
