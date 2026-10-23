import { Pressable, StyleSheet, Text } from "react-native";
import { useColors } from "@/lib/theme";

export function IconButton(props: {
  label: string;
  glyph: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        props.filled
          ? { backgroundColor: colors.ink }
          : { borderColor: colors.line, borderWidth: 1 },
        pressed && { opacity: 0.5 },
      ]}
    >
      <Text style={{ color: props.filled ? colors.paper : colors.ink, fontSize: 17 }}>
        {props.glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
});
