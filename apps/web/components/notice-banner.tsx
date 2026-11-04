"use client";

import { useEffect } from "react";
import {
  type Notice,
  setNotice,
  undoDeleteTask,
  useRestoreBlock,
  useCompletionActions,
  useNotice,
} from "@tt/client";
import { X } from "lucide-react";
import { useOpenTask } from "./app-shell";

const AUTO_DISMISS_MS = 12_000;

const quiet = "rounded-lg px-3 py-1.5 font-bold text-white/70 hover:bg-white/10 hover:text-white";
const primary = "rounded-lg bg-surface px-3 py-1.5 font-bold text-ink hover:bg-white/90";
const dismiss = () => setNotice(null);

export function NoticeBanner() {
  const notice = useNotice();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="animate-pop-in fixed bottom-4 left-1/2 z-[60] flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-ink px-4 py-3 text-[13px] font-semibold text-white shadow-sheet"
    >
      {notice.kind === "added" ? (
        <Added notice={notice} />
      ) : notice.kind === "deleted" ? (
        <Deleted notice={notice} />
      ) : notice.kind === "blockRemoved" ? (
        <BlockRemoved notice={notice} />
      ) : (
        <Completion notice={notice} />
      )}
    </div>
  );
}

function Added({ notice }: { notice: Extract<Notice, { kind: "added" }> }) {
  const openTask = useOpenTask();
  const open = (panel?: "schedule") => {
    openTask(notice.taskId, { panel });
    dismiss();
  };
  return (
    <>
      <span className="min-w-0 flex-1">
        Added “{notice.label}”{notice.listName && ` to ${notice.listName}`}.
      </span>
      <div className="flex gap-2">
        <button onClick={() => open()} className={quiet}>
          Open
        </button>
        <button onClick={() => open("schedule")} className={primary}>
          Schedule
        </button>
      </div>
    </>
  );
}

function Deleted({ notice }: { notice: Extract<Notice, { kind: "deleted" }> }) {
  return (
    <>
      <span className="min-w-0 flex-1">Deleted “{notice.label}”.</span>
      <button onClick={() => undoDeleteTask(notice.taskId)} className={primary}>
        Undo
      </button>
    </>
  );
}

function BlockRemoved({ notice }: { notice: Extract<Notice, { kind: "blockRemoved" }> }) {
  const restore = useRestoreBlock();
  return (
    <>
      <span className="min-w-0 flex-1">Removed “{notice.label}” from your calendar.</span>
      <button onClick={() => restore(notice.block)} className={primary}>
        Undo
      </button>
    </>
  );
}

function Completion({ notice }: { notice: Extract<Notice, { kind: "completion" }> }) {
  const { accept, undo } = useCompletionActions(notice);
  const blocks = notice.count === 1 ? "its upcoming block" : `its ${notice.count} upcoming blocks`;
  const removal = notice.count > 0 && `Remove ${blocks} from your calendar?`;
  const message =
    notice.auto === "done"
      ? `All steps done, so “${notice.label}” is done too.`
      : notice.auto === "reopened"
        ? `“${notice.label}” is open again, since a step isn’t done.`
        : `Done with “${notice.label}”.`;
  return (
    <>
      <span className="min-w-0 flex-1">
        {message} {removal}
      </span>
      <div className="flex gap-2">
        {notice.auto && (
          <button onClick={undo} className={quiet}>
            Undo
          </button>
        )}
        {removal ? (
          <>
            <button onClick={dismiss} className={quiet}>
              Keep
            </button>
            <button onClick={accept} className={primary}>
              Remove
            </button>
          </>
        ) : (
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-lg px-2 py-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  );
}
