"use client";

import { useEffect } from "react";
import { useBlockRemovalOffer } from "@/lib/client/completion";

const AUTO_DISMISS_MS = 12_000;

export function BlockRemovalBanner() {
  const { offer, accept, dismiss } = useBlockRemovalOffer();
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [offer, dismiss]);
  if (!offer) return null;
  const blocks = offer.count === 1 ? "its upcoming block" : `its ${offer.count} upcoming blocks`;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-lg"
    >
      <span className="min-w-0 flex-1">
        Done with “{offer.label}”. Remove {blocks} from your calendar?
      </span>
      <div className="flex gap-2">
        <button onClick={dismiss} className="rounded-md px-3 py-1.5 text-muted hover:text-ink">
          Keep
        </button>
        <button
          onClick={accept}
          className="rounded-md bg-ink px-3 py-1.5 text-paper hover:opacity-90"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
