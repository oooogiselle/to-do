import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
