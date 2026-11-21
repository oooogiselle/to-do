"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
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

/** Ask tt.: a round button floating at the bottom right of the main area (DESIGN.md, Layout pieces). */
function AskButton({ inset }: { inset: number }) {
  const assistant = useAssistant();
  if (assistant.open) return null;
  return (
    <button
      type="button"
      onClick={assistant.toggle}
      title="Ask tt. (⌘J)"
      aria-label="Ask tt. (⌘J)"
      style={{ right: inset + 24 }}
      className="absolute bottom-6 z-30 grid h-10 w-10 place-items-center rounded-full bg-ink text-surface shadow-pop transition-colors hover:bg-ink/90 focus-visible:outline-2"
    >
      <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}
