"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { MessageCircle, X } from "lucide-react";
import { setNotice } from "@tt/client";
import { useAssistant } from "./assistant/assistant-context";

/** Width of a drawer open on the right of the page, which the button moves left of. */
const InsetContext = createContext<{ setInset: (px: number) => void }>({ setInset: () => {} });

export function AskButtonArea({ children }: { children: React.ReactNode }) {
  const [inset, setInset] = useState(0);
  return (
    <InsetContext.Provider value={{ setInset }}>
      {children}
      <AskButton inset={inset} />
    </InsetContext.Provider>
  );
}

/** A page's right drawer reports its width here so Ask tt. doesn't cover it. */
export function useAskButtonInset(px: number) {
  const { setInset } = useContext(InsetContext);
  useEffect(() => {
    setInset(px);
    return () => setInset(0);
  }, [px, setInset]);
}

/* Whether the floating button is hidden: per browser, like the sidebar's collapsed state. */
const HIDDEN_KEY = "tt.ask.hidden";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAskButtonHidden(hidden: boolean) {
  try {
    localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

/** True when the user hid the floating Ask tt. button (it's then only in the sidebar and on ⌘J). */
export function useAskButtonHidden() {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}

/**
 * Ask tt.: a round button floating at the bottom right of the main area (DESIGN.md, Layout
 * pieces). A small × on hover or focus hides it; the sidebar row and ⌘J stay.
 */
function AskButton({ inset }: { inset: number }) {
  const assistant = useAssistant();
  const hidden = useAskButtonHidden();
  if (assistant.open || hidden) return null;
  return (
    <div style={{ right: inset + 24 }} className="group absolute bottom-6 z-30">
      <button
        type="button"
        onClick={assistant.toggle}
        title="Ask tt. (⌘J)"
        aria-label="Ask tt. (⌘J)"
        className="grid h-10 w-10 place-items-center rounded-full bg-ink text-surface shadow-pop transition-colors hover:bg-ink/90 focus-visible:outline-2"
      >
        <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => {
          setAskButtonHidden(true);
          setNotice({ kind: "askHidden" });
        }}
        title="Hide this button"
        aria-label="Hide the Ask tt. button"
        className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-muted opacity-0 shadow-pop transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 [@media(hover:none)]:opacity-100"
      >
        <X className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}
