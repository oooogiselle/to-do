"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { afterRestore, ApiProvider, persistOptions, useRealtimeInvalidation } from "@tt/client";
import { api } from "@/lib/client/api";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function RealtimeInvalidation() {
  const [supabase] = useState(createBrowserSupabase);
  useRealtimeInvalidation(supabase);
  return null;
}

/**
 * React Query for the app. With a user id, the planner is saved to localStorage and restored
 * on the next visit, so the page paints before the first sync returns, then catches up.
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
      {children}
    </ApiProvider>
  );
  return persist ? (
    <PersistQueryClientProvider
      client={client}
      persistOptions={persist}
      onSuccess={() => afterRestore(client)}
    >
      {inner}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={client}>{inner}</QueryClientProvider>
  );
}
