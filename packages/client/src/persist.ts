import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";
import { removeOldestQuery } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { stripTempRows } from "@tt/shared";
import { keys, type Snapshot } from "./data";

/** Bump whenever SyncResponse or a row shape changes, so old saved caches are thrown away. */
const CACHE_VERSION = "1";

/** Where the cache lives (browser localStorage, or the expo-sqlite one on iOS). */
const CACHE_KEY = "tt-cache";

/** Older saved caches are ignored; the app pulls everything instead. */
const CACHE_MAX_AGE_MS = 7 * 86_400_000;

/** Only the planner data is saved, not assistant chats or anything still loading. */
const PERSISTED = new Set(["sync", "settings", "calendars", "events"]);

const storage = () => (typeof localStorage === "undefined" ? undefined : localStorage);

/**
 * Options for PersistQueryClientProvider: the app paints from the last saved snapshot, then
 * catches up (pass `afterRestore` as the provider's `onSuccess`). The user id is part of the
 * buster, so another account's cache is discarded on restore instead of shown.
 */
export function persistOptions(userId: string): PersistQueryClientProviderProps["persistOptions"] {
  return {
    persister: createAsyncStoragePersister({
      storage: storage(),
      key: CACHE_KEY,
      throttleTime: 1000,
      // Over the storage quota: drop the oldest query (usually an old events week) and retry.
      retry: removeOldestQuery,
    }),
    buster: `${CACHE_VERSION}:${userId}`,
    maxAge: CACHE_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) =>
        q.state.status === "success" && PERSISTED.has(String(q.queryKey[0])),
    },
  };
}

/**
 * Runs once the saved cache is back. Restored queries keep their old fetch time, so one
 * synced under `staleTime` ago wouldn't refetch, and a change saved just before the reload
 * (the cache is written at most once a second) would stay missing. So everything saved is
 * refetched now: a delta sync, plus the event weeks on screen.
 *
 * Optimistic `temp-` rows are dropped first. Their mutations died with the old page, so
 * nothing would swap them for the server's rows, and the sync would add those beside them.
 */
export function afterRestore(qc: QueryClient) {
  const snap = qc.getQueryData<Snapshot>(keys.sync);
  if (snap) {
    const clean = stripTempRows(snap);
    if (clean !== snap) qc.setQueryData(keys.sync, clean);
  }
  return qc.invalidateQueries({ predicate: (q) => PERSISTED.has(String(q.queryKey[0])) });
}

/** Removes the saved cache. Call on sign-out and account deletion. */
export function clearPersistedCache() {
  try {
    storage()?.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable: nothing was saved.
  }
}
