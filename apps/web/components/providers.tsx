"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { keys } from "@/lib/client/data";

/** Refetches when rows change elsewhere (another tab, the phone, or a gcal sync). */
function RealtimeInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => {
      if (pending.has("sync")) qc.invalidateQueries({ queryKey: keys.sync });
      if (pending.has("events")) qc.invalidateQueries({ queryKey: ["events"] });
      pending.clear();
    };
    const queue = (what: "sync" | "events") => {
      pending.add(what);
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };
    const channel = supabase.channel("app-changes");
    for (const table of ["lists", "tasks", "steps", "time_blocks"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queue("sync"));
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () =>
      queue("events"),
    );

    // Realtime must carry the user's JWT or RLS filters out every change. The session is
    // restored from cookies asynchronously, so authorize before subscribing.
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      channel.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") console.warn("Live updates unavailable:", err?.message);
      });
    });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      auth.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [qc]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RealtimeInvalidation />
      {children}
    </QueryClientProvider>
  );
}
