"use client";

import { useEffect } from "react";
import { useCompletionActions } from "@/lib/client/completion";
import { setNotice, useNotice, type Notice } from "@/lib/client/notice";
import { useOpenTask } from "./app-shell";

const AUTO_DISMISS_MS = 12_000;

const quiet = "rounded-md px-3 py-1.5 text-muted hover:text-ink";
const primary = "rounded-md bg-ink px-3 py-1.5 text-paper hover:opacity-90";
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
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-lg"
    >
      {notice.kind === "added" ? <Added notice={notice} /> : <Completion notice={notice} />}
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
            className="rounded-md px-2 py-1.5 text-muted hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
    </>
  );
}
