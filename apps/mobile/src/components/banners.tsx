import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type Notice, setNotice, useCompletionActions, useNotice, useSettings } from "@tt/client";
import { config } from "@/lib/config";
import { useColors } from "@/lib/theme";

const AUTO_DISMISS_MS = 12_000;
const dismiss = () => setNotice(null);

/** Connecting Google Calendar happens on the web; say so when it's missing or expired. */
export function ConnectBanner() {
  const { data } = useSettings();
  const colors = useColors();
  if (!data || (data.google && !data.google.needs_reconnect)) return null;
  const expired = !!data.google?.needs_reconnect;
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(`${config.apiUrl}/settings`)}
      style={[
        styles.connect,
        expired
          ? { backgroundColor: colors.warnBg, borderColor: colors.warn }
          : { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <Text style={{ color: expired ? colors.warn : colors.muted, fontSize: 13 }}>
        {expired
          ? "Google Calendar access expired, so events aren't updating. "
          : "Your calendar isn't connected yet. "}
        <Text
          style={{ textDecorationLine: "underline", color: expired ? colors.warn : colors.ink }}
        >
          {expired ? "Reconnect on the web" : "Connect it on the web"}
        </Text>
      </Text>
    </Pressable>
  );
}

/** The single toast: a completed task's blocks to remove, or a task just added. */
export function NoticeBanner() {
  const notice = useNotice();
  const colors = useColors();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  // `deleted` and `blockRemoved` come from the undo hooks (delete-undo.ts), which only web uses.
  // Mobile deletes immediately, so it never sets them. Add UI here if it adopts those hooks.
  if (notice.kind !== "added" && notice.kind !== "completion") return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}
    >
      {notice.kind === "added" ? <Added notice={notice} /> : <Completion notice={notice} />}
    </View>
  );
}

function Added({ notice }: { notice: Extract<Notice, { kind: "added" }> }) {
  const colors = useColors();
  const open = (panel?: "schedule") => {
    router.push({ pathname: "/task/[id]", params: { id: notice.taskId, ...(panel && { panel }) } });
    dismiss();
  };
  return (
    <>
      <Text style={[styles.message, { color: colors.ink }]}>
        Added “{notice.label}”{notice.listName && ` to ${notice.listName}`}.
      </Text>
      <View style={styles.actions}>
        <Action label="Open" onPress={() => open()} />
        <Action label="Schedule" onPress={() => open("schedule")} primary />
      </View>
    </>
  );
}

function Completion({ notice }: { notice: Extract<Notice, { kind: "completion" }> }) {
  const colors = useColors();
  const { accept, undo } = useCompletionActions(notice);
  const blocks = notice.count === 1 ? "its upcoming block" : `its ${notice.count} upcoming blocks`;
  const removal = notice.count > 0 && `Remove ${blocks} from your calendar?`;
  const message =
    notice.auto === "done"
      ? `All steps done, so “${notice.label}” is done too.`
      : notice.auto === "reopened"
        ? `“${notice.label}” is open again, since a step isn’t done.`
        : `Done with “${notice.label}”.`;
  return (
    <>
      <Text style={[styles.message, { color: colors.ink }]}>
        {message} {removal}
      </Text>
      <View style={styles.actions}>
        {notice.auto && <Action label="Undo" onPress={undo} />}
        {removal ? (
          <>
            <Action label="Keep" onPress={dismiss} />
            <Action label="Remove" onPress={accept} primary />
          </>
        ) : (
          <Action label="Dismiss" onPress={dismiss} />
        )}
      </View>
    </>
  );
}

function Action(props: { label: string; onPress: () => void; primary?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      hitSlop={6}
      style={[styles.action, props.primary && { backgroundColor: colors.ink }]}
    >
      <Text style={{ color: props.primary ? colors.paper : colors.muted, fontSize: 14 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  connect: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toast: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { fontSize: 14 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  action: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
});
