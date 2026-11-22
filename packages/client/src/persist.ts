import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";
import { removeOldestQuery } from "@tanstack/react-query-persist-client";

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
 * catches up with a delta sync. The user id is part of the buster, so another account's cache
 * is discarded on restore instead of shown.
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

/** Removes the saved cache. Call on sign-out and account deletion. */
export function clearPersistedCache() {
  try {
    storage()?.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable: nothing was saved.
  }
}
