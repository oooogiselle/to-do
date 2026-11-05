import { useMemo, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { linkLabel, parseQuickAdd, splitLink, type IdeaKind, type Priority } from "@tt/shared";
import { setNotice, tempId, useAddSomeday, useCreateTask, useModel } from "@tt/client";
import { DueField, ListField } from "@/components/fields";
import { Button, Segmented } from "@/components/ui";
import { useColors } from "@/lib/theme";

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "",
  low: "Low",
  med: "Medium",
  high: "High",
};

/** A picker's choice and the typed value it replaced: whichever was set last wins. */
type Picked = { value: string | null; over: string | null };
const resolve = (picked: Picked | null, typed: string | null) =>
  picked && picked.over === typed ? picked.value : typed;

const KINDS = [
  { value: "none", label: "Idea" },
  { value: "goal", label: "Goal" },
  { value: "learn", label: "Learn" },
] as const;

/**
 * Quick add: "cs61 lab report fri 11pm high #school" sets the due date, priority and list.
 * With Someday on (or opened from the Someday tab), it saves a goal or a link to learn later.
 */
export default function Add() {
  const params = useLocalSearchParams<{ someday?: string }>();
  const [someday, setSomeday] = useState(params.someday === "1");
  const { lists, listById, settings } = useModel();
  const createTask = useCreateTask();
  const colors = useColors();
  const [text, setText] = useState("");
  const [pickedDue, setPickedDue] = useState<Picked | null>(null);
  const [pickedList, setPickedList] = useState<Picked | null>(null);

  const parsed = useMemo(
    () =>
      text.trim()
        ? parseQuickAdd(text, { lists, now: new Date(), timezone: settings.timezone })
        : null,
    [text, lists, settings.timezone],
  );
  const typedDue = parsed?.due_at ?? null;
  const dueAt = resolve(pickedDue, typedDue);
  const typedList = parsed?.list_id ?? null;
  const listId = resolve(pickedList, typedList);

  if (someday) return <AddSomeday text={text} setText={setText} onNormal={() => setSomeday(false)} />;

  const add = () => {
    if (!parsed) return;
    const listName = (listId && listById.get(listId)?.name) || undefined;
    createTask.mutate(
      { tempId: tempId(), body: { ...parsed, due_at: dueAt, list_id: listId } },
      {
        onSuccess: (task) =>
          setNotice({ kind: "added", taskId: task.id, label: task.title, listName }),
      },
    );
    router.back();
  };

  return (
    <View style={styles.root}>
      <SomedaySwitch value={false} onChange={setSomeday} />
      <TextInput
        autoFocus
        value={text}
        onChangeText={setText}
        onSubmitEditing={add}
        returnKeyType="done"
        placeholder="cs61 lab report fri 11pm high"
        placeholderTextColor={colors.muted}
        accessibilityLabel="New task"
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      {parsed ? (
        <Text style={{ color: colors.ink, fontSize: 15 }}>
          <Text style={{ fontWeight: "600" }}>{parsed.title}</Text>
          {parsed.priority !== "none" && (
            <Text style={{ color: colors.muted }}>
              {" "}
              · {PRIORITY_LABEL[parsed.priority]} priority
            </Text>
          )}
        </Text>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Type a task. Add a list, a due date and a priority to set them.
        </Text>
      )}
      <ListField
        value={listId && listById.has(listId) ? listId : null}
        lists={lists}
        onChange={(v) => setPickedList({ value: v, over: typedList })}
      />
      <DueField
        value={dueAt}
        tz={settings.timezone}
        onChange={(v) => setPickedDue({ value: v, over: typedDue })}
      />
      <Button title="Add task" kind="primary" onPress={add} disabled={!parsed} />
    </View>
  );
}

/** Someday mode: a goal, or a pasted link to learn later. No list or due date. */
function AddSomeday(props: { text: string; setText: (t: string) => void; onNormal: () => void }) {
  const colors = useColors();
  const addSomeday = useAddSomeday();
  const [kind, setKind] = useState<IdeaKind | null>(null);
  const [failed, setFailed] = useState(false);
  const parsed = useMemo(() => splitLink(props.text), [props.text]);
  // A link defaults to Learn unless a type was picked.
  const effectiveKind = kind ?? (parsed.link_url ? "learn" : null);

  const add = () => {
    if (!parsed.title) return;
    addSomeday(
      { title: parsed.title, link_url: parsed.link_url, idea_kind: effectiveKind },
      {
        onAdded: (task) =>
          setNotice({ kind: "added", taskId: task.id, label: task.title, listName: "Someday" }),
      },
    ).then(
      () => router.back(),
      () => setFailed(true),
    );
  };

  return (
    <View style={styles.root}>
      <SomedaySwitch value onChange={(on) => !on && props.onNormal()} />
      <TextInput
        autoFocus
        value={props.text}
        onChangeText={props.setText}
        onSubmitEditing={add}
        returnKeyType="done"
        autoCapitalize="sentences"
        placeholder="A goal, or paste a link to learn later"
        placeholderTextColor={colors.muted}
        accessibilityLabel="New someday item"
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      {parsed.title ? (
        <Text style={{ color: colors.ink, fontSize: 15 }}>
          <Text style={{ fontWeight: "600" }}>{parsed.title}</Text>
          {parsed.link_url && (
            <Text style={{ color: colors.muted }}> · link from {linkLabel(parsed.link_url)}</Text>
          )}
        </Text>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Something you saw and want to get to, or a goal for this year.
        </Text>
      )}
      <Segmented
        label="Type"
        value={effectiveKind ?? "none"}
        options={KINDS}
        onChange={(v) => setKind(v === "none" ? null : v)}
      />
      {failed && (
        <Text style={{ color: colors.risk, fontSize: 14 }}>
          Couldn&apos;t create the Someday list. Try again.
        </Text>
      )}
      <Button title="Save to Someday" kind="primary" onPress={add} disabled={!parsed.title} />
    </View>
  );
}

function SomedaySwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <View style={styles.switchRow}>
      <Text style={{ color: colors.ink, fontSize: 15 }}>
        Someday <Text style={{ color: colors.muted }}>· goals and things to learn</Text>
      </Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel="Save to Someday" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 28, gap: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: { fontSize: 18, borderBottomWidth: 1, paddingVertical: 10 },
});
