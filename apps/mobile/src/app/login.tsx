import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { config } from "@/lib/config";
import { api, takeSignOutReason } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/lib/theme";

// Must be listed in Supabase's auth redirect URLs (supabase/config.toml and the dashboard).
const REDIRECT = "timelinetodo://auth/callback";

export default function Login() {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(takeSignOutReason);

  /** Signing in is not enough: the server also checks the account against its allowlist. */
  const verify = async () => {
    try {
      await api.settings();
    } catch {
      setError(takeSignOutReason() ?? "Couldn't reach the server. Check your connection.");
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error("No sign-in URL");
      const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT);
      if (result.type !== "success") return;
      const code = new URL(result.url).searchParams.get("code");
      if (!code) throw new Error("Sign-in was cancelled.");
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
      await verify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const signInDemo = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: "demo@example.com",
      password: "demo-password-123",
    });
    if (error) setError("Demo sign-in failed. Run `pnpm demo` to seed the demo account.");
    else await verify();
    setBusy(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <Text style={[styles.title, { color: colors.ink }]}>Timeline To-Do</Text>
      <Pressable
        onPress={signInWithGoogle}
        disabled={busy}
        style={[styles.button, { backgroundColor: colors.ink, opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={[styles.buttonText, { color: colors.paper }]}>Sign in with Google</Text>
      </Pressable>
      {config.demo && (
        <Pressable onPress={signInDemo} disabled={busy} hitSlop={8}>
          <Text style={[styles.link, { color: colors.muted }]}>Use demo account</Text>
        </Pressable>
      )}
      {busy && <ActivityIndicator color={colors.muted} />}
      {error && <Text style={[styles.error, { color: colors.risk }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8 },
  button: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { fontSize: 16, fontWeight: "500" },
  link: { textDecorationLine: "underline", fontSize: 15 },
  error: { textAlign: "center", fontSize: 14 },
});
