import { createContext, useContext } from "react";
import type { createApiClient } from "@tt/shared";

export type ApiClient = ReturnType<typeof createApiClient>;

const ApiContext = createContext<ApiClient | null>(null);

/** Supplies the API client: same-origin with cookies on web, Bearer token on iOS. */
export function ApiProvider({ api, children }: { api: ApiClient; children: React.ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}
