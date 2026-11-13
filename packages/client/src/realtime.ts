"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { blockMovesPending, keys } from "./data";

/**
 * Refetches when rows change elsewhere (another tab, the other device, or a gcal sync).
 * Pass a stable client: the subscription is recreated whenever it changes.
 */
export function useRealtimeInvalidation(supabase: SupabaseClient) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => {
      if (pending.has("sync") && !blockMovesPending(qc))
        qc.invalidateQueries({ queryKey: keys.sync });
      if (pending.has("events")) qc.invalidateQueries({ queryKey: ["events"] });
      if (pending.has("assistant")) qc.invalidateQueries({ queryKey: ["assistant"] });
      pending.clear();
    };
    const queue = (what: "sync" | "events" | "assistant") => {
      pending.add(what);
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };
    const channel = supabase.channel("app-changes");
    for (const table of ["lists", "tasks", "steps", "time_blocks", "day_plan_items"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queue("sync"));
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () =>
      queue("events"),
    );
    for (const table of ["assistant_messages", "assistant_chats"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queue("assistant"));
    }

    // Realtime must carry the user's JWT or RLS filters out every change. The session is
    // restored from storage asynchronously, so authorize before subscribing.
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
  }, [qc, supabase]);
}
