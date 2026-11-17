import { Suspense } from "react";
import { SomedayView } from "@/components/someday/someday-view";

export default function SomedayPage() {
  return (
    <Suspense>
      <SomedayView />
    </Suspense>
  );
}
