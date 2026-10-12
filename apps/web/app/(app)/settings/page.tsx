import { Suspense } from "react";
import { SettingsView } from "@/components/settings";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
