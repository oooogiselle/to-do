"use client";

import { useState } from "react";
import { Check, ChevronDown, LayoutTemplate } from "lucide-react";
import { useDismiss } from "@/components/ui/use-dismiss";
import type { LayoutPreset, PresetId } from "./layout";

/** Picks one of the saved layouts; shows "Custom" once the panes have been rearranged. */
export function LayoutMenu({
  presets,
  presetId,
  onApply,
}: {
  presets: LayoutPreset[];
  presetId: PresetId | null;
  onApply: (id: PresetId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const current = presets.find((p) => p.id === presetId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12px] font-extrabold text-ink hover:bg-line-soft"
      >
        <LayoutTemplate className="h-3.5 w-3.5 text-grape" />
        Layout
        <span className="hidden font-semibold text-muted sm:inline">· {current?.name ?? "Custom"}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop-in absolute top-10 right-0 z-50 w-60 rounded-2xl border border-line-soft bg-surface p-1.5 shadow-pop"
        >
          <p className="px-2 pt-1 pb-1 text-[10px] font-extrabold tracking-wider text-faint uppercase">
            Saved layouts
          </p>
          {presets.map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={active}
                type="button"
                onClick={() => {
                  onApply(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left ${active ? "bg-[#efebfa]" : "hover:bg-paper"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12px] font-bold ${active ? "text-grape-ink" : "text-chip-ink"}`}>
                    {p.name}
                  </span>
                  <span className="block text-[11px] text-faint">{p.description}</span>
                </span>
                {active && <Check className="mt-0.5 h-3.5 w-3.5 text-grape-ink" strokeWidth={3} />}
              </button>
            );
          })}
          {!current && (
            <p className="px-2 pt-1.5 pb-1 text-[11px] text-faint">
              You&apos;re on a custom layout. Pick one to reset.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
