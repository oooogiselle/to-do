import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Pull-to-refresh: asks the server to resync Google Calendar, then refetches everything. */
export function useRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      // Fails without a Google connection (e.g. the demo account); the refetch still runs.
      await api.refreshCalendars().catch(() => {});
      await qc.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, refresh };
}
