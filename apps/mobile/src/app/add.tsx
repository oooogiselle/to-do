import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { parseQuickAdd, type Priority } from "@tt/shared";
import { setNotice, tempId, useCreateTask, useModel } from "@tt/client";
import { DueField, ListField } from "@/components/fields";
import { Button } from "@/components/ui";
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

/** Quick add: "cs61 lab report fri 11pm high #school" sets the due date, priority and list. */
export default function Add() {
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

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 28, gap: 14 },
  input: { fontSize: 18, borderBottomWidth: 1, paddingVertical: 10 },
});
