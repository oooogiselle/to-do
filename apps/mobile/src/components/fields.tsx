import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { TZDate } from "@date-fns/tz";
import { localDate, zonedInstant, type List } from "@tt/shared";
import { fmtDue } from "@tt/client";
import { Dot } from "@/components/ui";
import { useColors } from "@/lib/theme";

// A due date without a time means the end of that day (same as the web DuePicker).
const END_OF_DAY = "23:59";

/** Wall date and time of `dueAt` in tz; time is "" when it's the end-of-day default. */
function split(dueAt: string | null, tz: string): { date: string; time: string } {
  if (!dueAt) return { date: "", time: "" };
  const z = new TZDate(new Date(dueAt).getTime(), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(z.getHours())}:${p(z.getMinutes())}`;
  return { date: localDate(z, tz), time: time === END_OF_DAY ? "" : time };
}

const addDays = (day: string, n: number, tz: string) =>
  localDate(new Date(zonedInstant(day, "12:00", tz).getTime() + n * 86_400_000), tz);

/** Due date: shortcuts, a calendar, and an optional time, all in the account's timezone. */
export function DueField(props: {
  value: string | null;
  onChange: (v: string | null) => void;
  tz: string;
}) {
  const { tz } = props;
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const { date, time } = split(props.value, tz);
  const set = (d: string, t: string) =>
    props.onChange(d ? zonedInstant(d, t || END_OF_DAY, tz).toISOString() : null);

  const today = localDate(new Date(), tz);
  const weekday = new TZDate(Date.now(), tz).getDay();
  const shortcuts = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1, tz) },
    { label: "Next week", day: addDays(today, (8 - weekday) % 7 || 7, tz) },
  ];
  const pickerDate = zonedInstant(date || today, time || "12:00", tz);

  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} hitSlop={6}>
        <Text style={{ color: props.value ? colors.ink : colors.muted, fontSize: 15 }}>
          {props.value ? fmtDue(props.value, tz) : "No due date"} {open ? "▴" : "▾"}
        </Text>
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          <View style={styles.chips}>
            {shortcuts.map((s) => (
              <Chip
                key={s.label}
                label={s.label}
                on={date === s.day}
                onPress={() => set(s.day, time)}
              />
            ))}
            {props.value && <Chip label="Clear" onPress={() => set("", "")} />}
          </View>
          <DateTimePicker
            mode="date"
            display="inline"
            value={pickerDate}
            timeZoneName={tz}
            onChange={(_e, d) => d && set(localDate(d, tz), time)}
          />
          {date && (
            <View style={styles.timeRow}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>Time</Text>
              {time ? (
                <>
                  <DateTimePicker
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    value={pickerDate}
                    timeZoneName={tz}
                    onChange={(_e, d) => {
                      if (!d) return;
                      const z = new TZDate(d.getTime(), tz);
                      const p = (n: number) => String(n).padStart(2, "0");
                      set(date, `${p(z.getHours())}:${p(z.getMinutes())}`);
                    }}
                  />
                  <Chip label="End of day" onPress={() => set(date, "")} />
                </>
              ) : (
                <Chip label="Add a time" onPress={() => set(date, "17:00")} />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Lists as a row of chips; "No list" first. */
export function ListField(props: {
  value: string | null;
  lists: List[];
  onChange: (id: string | null) => void;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.chips, { flexWrap: "nowrap" }]}
    >
      <Chip label="No list" on={!props.value} onPress={() => props.onChange(null)} />
      {props.lists.map((l) => (
        <Chip
          key={l.id}
          label={l.name}
          on={props.value === l.id}
          onPress={() => props.onChange(l.id)}
          dot={l.color}
        />
      ))}
      {!props.lists.length && (
        <Text style={{ color: colors.muted, fontSize: 13, alignSelf: "center" }}>
          Lists are made on the web.
        </Text>
      )}
    </ScrollView>
  );
}

export function Chip(props: { label: string; on?: boolean; onPress: () => void; dot?: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.on }}
      onPress={props.onPress}
      style={[
        styles.chip,
        props.on
          ? { backgroundColor: colors.ink, borderColor: colors.ink }
          : { borderColor: colors.lineStrong },
      ]}
    >
      {props.dot && <Dot color={props.dot} />}
      <Text style={{ color: props.on ? colors.paper : colors.ink, fontSize: 14 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Text input that saves on blur or submit, and resyncs when the stored value changes. */
export function CommitInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  TextInputProps,
  "value" | "onChangeText"
>) {
  const colors = useColors();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...rest}
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      style={[{ color: colors.ink, fontSize: 15 }, rest.style]}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
