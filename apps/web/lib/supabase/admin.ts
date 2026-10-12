import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tt/shared";
import { env } from "@/lib/env";

let admin: SupabaseClient<Database> | undefined;

/** Service-role client. Bypasses RLS: always scope queries by user_id explicitly. */
export function adminClient() {
  admin ??= createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
