import { ApiError, createApiClient } from "@tt/shared";
import { config } from "./config";
import { supabase } from "./supabase";

let signOutReason: string | null = null;

/** Why the app last signed out on its own, once, for the sign-in screen to explain. */
export function takeSignOutReason() {
  const reason = signOutReason;
  signOutReason = null;
  return reason;
}

/** The deployed API, authenticated with the Supabase session's access token. */
export const api = createApiClient({
  baseUrl: config.apiUrl,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  fetch: async (input, init) => {
    const res = await fetch(input, init);
    // 401: the session is gone. 403 also covers per-row checks, so only sign out when the
    // server rejects the account itself (see authenticate() in apps/web/lib/api.ts).
    const rejected =
      res.status === 401 ||
      (res.status === 403 &&
        (
          await res
            .clone()
            .json()
            .catch(() => null)
        )?.error === "This account is not allowed");
    if (rejected) {
      signOutReason =
        res.status === 403
          ? "This account is not allowed."
          : "Your session expired. Sign in again.";
      void supabase.auth.signOut();
    }
    return res;
  },
});

export { ApiError };
