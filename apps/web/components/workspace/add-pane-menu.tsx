"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useModel } from "@tt/client";
import { useDismiss } from "@/components/ui/use-dismiss";
import { paneColor, paneLabel, type PaneId } from "./layout";

/** "+" next to the tabs: opens a pane that isn't showing anywhere. */
export function AddPaneMenu({ hidden, onOpen }: { hidden: PaneId[]; onOpen: (pane: PaneId) => void }) {
  const { lists } = useModel();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open a pane"
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid h-7 w-7 place-items-center rounded-lg text-[#7d8099] hover:bg-white hover:text-ink"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop-in absolute top-9 left-0 z-50 w-48 rounded-[13px] border border-line-soft bg-white p-1.5 shadow-[0_18px_34px_rgba(21,23,43,0.2)]"
        >
          <p className="px-2 pt-1 pb-1 text-[10px] font-extrabold tracking-wider text-[#9699ac] uppercase">
            Open pane
          </p>
          {hidden.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-faint">Every pane is already open.</p>
          ) : (
            hidden.map((p) => (
              <button
                key={p}
                role="menuitem"
                type="button"
                onClick={() => {
                  onOpen(p);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-bold text-[#4b4e63] hover:bg-paper"
              >
                <span className="h-2 w-2 rounded-[3px]" style={{ background: paneColor(p, lists) }} />
                {paneLabel(p, lists)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
