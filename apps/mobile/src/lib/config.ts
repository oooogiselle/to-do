function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy apps/mobile/.env.example to .env.local.`);
  return value;
}

// EXPO_PUBLIC_* are inlined at build time, so each must be read by its literal name.
export const config = {
  apiUrl: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Shows the demo account sign-in, as `NEXT_PUBLIC_DEMO` does on web. */
  demo: process.env.EXPO_PUBLIC_DEMO === "1",
};
