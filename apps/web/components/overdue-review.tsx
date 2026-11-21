"use client";

import { useEffect, useState } from "react";
import { localDate, STALE_OVERDUE_DAYS, type Task } from "@tt/shared";
import { useDeleteTasksWithUndo, useKeepOverdue, useModel, useStaleOverdue } from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { DueChip } from "@/components/ui/due-chip";

/** Local date the strip was put off until the next day ("Not now"). */
const HIDDEN_KEY = "overdueReview.hiddenOn";

const quietBtn =
  "h-7 rounded-lg px-2.5 text-[12px] font-medium text-chip-ink transition-colors hover:bg-surface/70 hover:text-ink";

/**
 * Asks about to-dos more than 3 days overdue (To-dos, above the lists): keep each one, delete it,
 * or delete them all. Keep stops asking until its due date changes; deletes get one Undo.
 */
export function OverdueReview({ listId, now }: { listId: string | null; now: number }) {
  const { settings, listById } = useModel();
  const tz = settings.timezone;
  const stale = useStaleOverdue(now, listId);
  const keep = useKeepOverdue();
  const deleteTasks = useDeleteTasksWithUndo();
  const openTask = useOpenTask();
  const [open, setOpen] = useState(false);
  const today = localDate(new Date(now), tz);
  const [hiddenOn, setHiddenOn] = useState<string | null>(null);
  useEffect(() => {
    try {
      setHiddenOn(localStorage.getItem(HIDDEN_KEY));
    } catch {}
  }, []);

  if (!stale.length || (hiddenOn === today && !open)) return null;

  const notNow = () => {
    setHiddenOn(today);
    try {
      localStorage.setItem(HIDDEN_KEY, today);
    } catch {}
  };
  const n = stale.length;
  const summary = `${n} to-do${n === 1 ? " is" : "s are"} more than ${STALE_OVERDUE_DAYS} days overdue`;

  return (
    <section aria-label="Overdue to-dos" className="mb-4 rounded-2xl bg-risk-bg px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <span className="grid w-4 shrink-0 place-items-center" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-risk" />
        </span>
        <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">
          {summary}
          {!open && <span className="font-normal text-muted"> · still doing them?</span>}
        </p>
        {!open && (
          <div className="flex gap-1">
            <button type="button" onClick={notNow} className={quietBtn}>
              Not now
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-7 rounded-lg bg-ink px-3 text-[12px] font-medium text-surface"
            >
              Review
            </button>
          </div>
        )}
      </div>

      {open && (
        <>
          <ul className="mt-2 border-t border-risk/15">
            {stale.map((t) => (
              <OverdueRow
                key={t.id}
                task={t}
                listName={t.list_id ? listById.get(t.list_id)?.name : undefined}
                tz={tz}
                now={now}
                onOpen={() => openTask(t.id)}
                onKeep={() => keep(t)}
                onDelete={() => deleteTasks([t])}
              />
            ))}
          </ul>
          <div className="flex justify-end gap-1 pt-2">
            <button type="button" onClick={() => setOpen(false)} className={quietBtn}>
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                deleteTasks(stale);
                setOpen(false);
              }}
              className="h-7 rounded-lg bg-risk px-3 text-[12px] font-medium text-surface"
            >
              {n === 1 ? "Delete it" : `Delete all ${n}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function OverdueRow(props: {
  task: Task;
  listName?: string;
  tz: string;
  now: number;
  onOpen: () => void;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const { task } = props;
  return (
    <li className="flex min-h-[42px] flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-risk/15 py-1.5 pl-[30px]">
      <button
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      >
        <span className="truncate text-[13px] font-medium text-ink hover:underline">
          {task.title}
        </span>
        {props.listName && (
          <span className="shrink-0 text-[11px] text-muted">{props.listName}</span>
        )}
      </button>
      <DueChip dueAt={task.due_at} tz={props.tz} now={props.now} />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={props.onKeep}
          title="Keep it; don't ask again unless its due date changes"
          className={quietBtn}
        >
          Keep
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          className="h-7 rounded-lg px-2.5 text-[12px] font-medium text-risk transition-colors hover:bg-surface/70"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
