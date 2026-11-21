"use client";

import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useDueRail } from "@tt/client";
import { useAskButtonInset } from "./ask-button";
import { useNow } from "./use-now";
import { DuePane, savedRange } from "./workspace/due-pane";

const OPEN_KEY = "tt.todos.due";
const TAB_PX = 40;
const OPEN_PX = 320;

/** Whether the drawer is shown at all: it's desktop-only (md and up). */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * The Due pane as a drawer on the right of To-dos: a thin tab with the at-risk count when
 * closed, the full pane when open. Remembers which, per browser.
 */
export function DueDrawer() {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem(OPEN_KEY, was ? "0" : "1");
      } catch {}
      return !was;
    });
  useAskButtonInset(wide ? (open ? OPEN_PX : TAB_PX) : 0);
  if (!wide) return null;
  return open ? <OpenDrawer onClose={toggle} /> : <DrawerTab onOpen={toggle} />;
}

function DrawerTab({ onOpen }: { onOpen: () => void }) {
  const now = useNow();
  const atRisk = useDueRail(now, savedRange()).items.filter((i) => i.atRisk).length;
  const label = `Open Due${atRisk ? `, ${atRisk} at risk` : ""}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={label}
      aria-expanded={false}
      className="flex shrink-0 flex-col items-center gap-3 border-l border-line-soft bg-paper pt-3 text-muted transition-colors hover:text-ink"
      style={{ width: TAB_PX }}
    >
      <PanelRightOpen className="h-4 w-4" strokeWidth={1.75} />
      <span className="text-[12px] font-semibold [writing-mode:vertical-rl]">Due</span>
      {atRisk > 0 && <span className="text-[11px] text-risk tabular-nums">{atRisk}</span>}
    </button>
  );
}

function OpenDrawer({ onClose }: { onClose: () => void }) {
  const now = useNow();
  return (
    <aside
      aria-label="Due"
      className="flex shrink-0 flex-col border-l border-line-soft bg-paper"
      style={{ width: OPEN_PX }}
    >
      <header className="flex items-center justify-between px-3.5 pt-3 pb-1">
        <h2 className="text-[12px] font-semibold text-ink">Due</h2>
        <button
          type="button"
          onClick={onClose}
          title="Close Due"
          aria-label="Close Due"
          aria-expanded
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-row-hover hover:text-ink"
        >
          <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <DuePane pane="todos-due" now={now} draggable={false} />
      </div>
    </aside>
  );
}
