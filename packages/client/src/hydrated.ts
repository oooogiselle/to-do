"use client";

import { useSyncExternalStore } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

const subscribe = () => () => {};

/**
 * False while React hydrates server HTML (in any Suspense boundary, however late), true for
 * every client render after that. React re-renders by itself once it flips. On iOS there is
 * no hydration, so it is always true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * What a query looked like on the server: pending, not fetching, no data. Suspense boundaries
 * hydrate after the saved cache has been restored, so a component there would otherwise
 * render data the server HTML doesn't have, and hydration fails.
 *
 * Built field by field rather than spread from `q`: reading every field of a query result
 * subscribes the component to all of them.
 */
export function asOnServer<T>(q: UseQueryResult<T>): UseQueryResult<T> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    status: "pending",
    fetchStatus: "idle",
    isPending: true,
    isSuccess: false,
    isError: false,
    isLoading: false,
    isInitialLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetching: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isRefetching: false,
    isPaused: false,
    isPlaceholderData: false,
    isStale: true,
    isEnabled: true,
    refetch: q.refetch,
  } as unknown as UseQueryResult<T>;
}
