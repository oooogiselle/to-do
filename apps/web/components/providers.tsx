"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider, useRealtimeInvalidation } from "@tt/client";
import { api } from "@/lib/client/api";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function RealtimeInvalidation() {
  const [supabase] = useState(createBrowserSupabase);
  useRealtimeInvalidation(supabase);
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
      <ApiProvider api={api}>
        <RealtimeInvalidation />
        {children}
      </ApiProvider>
    </QueryClientProvider>
  );
}
