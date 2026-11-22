"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  ApiProvider,
  persistOptions,
  takePendingDeletes,
  useRealtimeInvalidation,
} from "@tt/client";
import { api } from "@/lib/client/api";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function RealtimeInvalidation() {
  const [supabase] = useState(createBrowserSupabase);
  useRealtimeInvalidation(supabase);
  return null;
}

/** The bulk-delete route takes at most this many ids per request (TaskBulkDelete). */
const BULK_DELETE_MAX = 200;

/**
 * Sends deletes still waiting out their Undo window when the page goes away. A keepalive
 * request finishes after the tab closes; a normal one would be cancelled.
 */
function FlushDeletesOnExit() {
  useEffect(() => {
    const flush = () => {
      const ids = takePendingDeletes();
      for (let i = 0; i < ids.length; i += BULK_DELETE_MAX) {
        void fetch("/api/v1/tasks/bulk-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + BULK_DELETE_MAX) }),
          keepalive: true,
        });
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
  return null;
}

/**
 * React Query for the app. With a user id, the planner is saved to localStorage and restored
 * on the next visit, so the page paints before the first sync returns.
 */
export function Providers({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
      }),
  );
  const [persist] = useState(() => (userId ? persistOptions(userId) : null));
  const inner = (
    <ApiProvider api={api}>
      <RealtimeInvalidation />
      <FlushDeletesOnExit />
      {children}
    </ApiProvider>
  );
  return persist ? (
    <PersistQueryClientProvider client={client} persistOptions={persist}>
      {inner}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={client}>{inner}</QueryClientProvider>
  );
}
