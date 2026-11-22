import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { createCookieClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware has already validated the session; this only names whose saved cache to load.
  const supabase = await createCookieClient();
  const { data } = await supabase.auth.getClaims();
  return (
    <Providers userId={data?.claims.sub ?? null}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
