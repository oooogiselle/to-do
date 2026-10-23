import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/lib/theme";

export function ScreenHeader(props: {
  title: string;
  right?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <View style={styles.row}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.ink }]}
          numberOfLines={1}
        >
          {props.title}
        </Text>
        {props.right && <View style={styles.right}>{props.right}</View>}
      </View>
      {props.below}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: "600" },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
});
