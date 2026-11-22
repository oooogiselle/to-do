import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  afterRestore,
  ApiProvider,
  clearPersistedCache,
  persistOptions,
  useRealtimeInvalidation,
} from "@tt/client";
import { api } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

// React Query refetches stale data when the app comes back to the foreground.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));

function LiveUpdates() {
  useRealtimeInvalidation(supabase);
  return null;
}

function RootStack() {
  const { session, loading } = useSession();
  const colors = useColors();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  // Nothing cached belongs to the next account, in memory or on disk.
  useEffect(() => {
    if (!session) {
      queryClient.clear();
      clearPersistedCache();
    }
  }, [session, queryClient]);
  // Signed in, the planner is saved on the device and restored at launch.
  const userId = session?.user.id;
  const persist = useMemo(() => (userId ? persistOptions(userId) : null), [userId]);

  if (loading) return null;
  const signedIn = !!session;
  const content = (
    <ApiProvider api={api}>
      {signedIn && <LiveUpdates />}
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="task/[id]"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: colors.surface },
            }}
          />
          <Stack.Screen
            name="add"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: colors.surface },
            }}
          />
        </Stack.Protected>
      </Stack>
    </ApiProvider>
  );
  return persist ? (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persist}
      onSuccess={() => afterRestore(queryClient)}
    >
      {content}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootStack />
    </SessionProvider>
  );
}
