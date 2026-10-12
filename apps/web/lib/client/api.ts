import { createApiClient } from "@tt/shared";

/** Same-origin client: the web app authenticates with Supabase cookies. */
export const api = createApiClient({ baseUrl: "" });
