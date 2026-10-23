import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useColors } from "@/lib/theme";

/** A round done/not-done toggle, like the web timeline's block checkbox. */
export function Check(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
  disabled?: boolean;
  label: string;
}) {
  const colors = useColors();
  const color = props.color ?? colors.now;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.checked, disabled: props.disabled }}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={() => props.onChange(!props.checked)}
      hitSlop={10}
      style={[
        styles.check,
        { borderColor: color, backgroundColor: props.checked ? color : "transparent" },
        props.disabled && { opacity: 0.4 },
      ]}
    >
      {props.checked && <Text style={styles.tick}>✓</Text>}
    </Pressable>
  );
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string | number>(props: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  style?: ViewStyle;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={[styles.segmented, { borderColor: colors.line }, props.style]}
    >
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => props.onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.ink }]}
          >
            <Text style={{ color: on ? colors.paper : colors.muted, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
  );
}

export function Button(props: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "plain" | "danger";
  disabled?: boolean;
}) {
  const colors = useColors();
  const kind = props.kind ?? "plain";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.button,
        kind === "primary"
          ? { backgroundColor: colors.ink }
          : { borderColor: colors.lineStrong, borderWidth: StyleSheet.hairlineWidth * 2 },
        (pressed || props.disabled) && { opacity: 0.5 },
      ]}
    >
      <Text
        style={{
          color: kind === "primary" ? colors.paper : kind === "danger" ? colors.risk : colors.ink,
          fontSize: 15,
          fontWeight: "500",
        }}
      >
        {props.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 15 },
  segmented: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 8,
    padding: 2,
    alignSelf: "flex-start",
  },
  segment: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  button: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
});
