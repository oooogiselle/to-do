"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  localDate,
  matchImport,
  normalize,
  swatch,
  zonedInstant,
  type ImportCommit,
  type ImportCommitResult,
  type ImportKind,
  type ImportMatch,
  type List,
  type Priority,
  type ProposedTask,
} from "@tt/shared";
import { TZDate } from "@date-fns/tz";
import { api } from "@/lib/client/api";
import { fmtDue, keys, NO_COLOR, PALETTE, useModel } from "@tt/client";
import { Check, CheckCircle2 } from "lucide-react";


const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "No priority" },
  { value: "low", label: "Low" },
  { value: "med", label: "Medium" },
  { value: "high", label: "High" },
];
const NEW_LIST = "__new__";
const NO_LIST = "";

type Row = {
  key: string;
  include: boolean;
  touched: boolean;
  title: string;
  date: string; // YYYY-MM-DD local, "" = no due date
  time: string; // HH:MM local, "" = end of day
  priority: Priority;
  listId: string; // per-row list for free text; ignored for syllabus
  proposed: ProposedTask;
};

function splitLocal(iso: string | null, hasTime: boolean, tz: string) {
  if (!iso) return { date: "", time: "" };
  const z = new TZDate(Date.parse(iso), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${z.getFullYear()}-${p(z.getMonth() + 1)}-${p(z.getDate())}`,
    time: hasTime ? `${p(z.getHours())}:${p(z.getMinutes())}` : "",
  };
}

const rowDueAt = (r: Row, tz: string) =>
  r.date ? zonedInstant(r.date, r.time || "23:59", tz).toISOString() : null;

/** Existing list matching a course code or list hint ("cs 74" ≈ "CS74"). */
function findList(lists: List[], hint: string | null): List | undefined {
  if (!hint) return undefined;
  const h = normalize(hint).replace(/ /g, "");
  return lists.find((l) => normalize(l.name).replace(/ /g, "") === h);
}

/**
 * Review screen for AI-extracted tasks: edit titles and dates, uncheck to skip, pick lists,
 * then Add all. Re-imported syllabi are matched against the target list so changes show as
 * updates instead of duplicates. Nothing is saved until "Add".
 */
export function ImportReview(props: {
  kind: ImportKind;
  name: string;
  tasks: ProposedTask[];
  course?: { code: string | null; title: string | null };
  onCancel: () => void;
}) {
  const { lists, tasks: allTasks, settings } = useModel();
  const tz = settings.timezone;
  const qc = useQueryClient();
  const now = useMemo(() => Date.now(), []);
  const isSyllabus = props.kind === "syllabus";

  // Target list: an existing list matching the course, else a new one named after it.
  const courseName = props.course?.code ?? props.course?.title ?? "";
  const [target, setTarget] = useState<string>(() => {
    if (isSyllabus) return findList(lists, courseName)?.id ?? (courseName ? NEW_LIST : NO_LIST);
    return NO_LIST;
  });
  const [newListName, setNewListName] = useState(courseName);

  const [rows, setRows] = useState<Row[]>(() =>
    props.tasks.map((t) => ({
      key: t.key,
      include: true,
      touched: false,
      title: t.title,
      ...splitLocal(t.due_at, t.has_time, tz),
      priority: t.priority,
      listId: isSyllabus ? NO_LIST : (findList(lists, t.list_hint)?.id ?? NO_LIST),
      proposed: t,
    })),
  );

  // Re-import: compare against tasks already in the target list (syllabus only).
  const { matches, missing } = useMemo(() => {
    const existing =
      isSyllabus && target && target !== NEW_LIST
        ? allTasks.filter((t) => t.list_id === target)
        : [];
    return matchImport(
      rows.map((r) => ({ title: r.title, due_at: rowDueAt(r, tz) })),
      existing,
      (iso) => localDate(new Date(iso), tz),
    );
  }, [rows, allTasks, target, tz, isSyllabus]);

  // Default selection: skip exact repeats and (for syllabi) items already past, unless the
  // user has changed that row's checkbox themselves.
  const effective = rows.map((r, i) => {
    const m = matches[i]!;
    const due = rowDueAt(r, tz);
    const past = isSyllabus && !!due && Date.parse(due) < now;
    const defaultInclude = m.status !== "same" && !past;
    return { row: r, match: m, past, include: r.touched ? r.include : defaultInclude };
  });

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const creates = effective.filter((e) => e.include && e.match.status === "new");
  const updates = effective.filter((e) => e.include && e.match.status === "changed");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const needsTarget = isSyllabus && creates.length > 0 && !target;
  const canSave =
    (creates.length > 0 || updates.length > 0) &&
    !needsTarget &&
    !(target === NEW_LIST && !newListName.trim()) &&
    effective.every((e) => !e.include || e.row.title.trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    const listPayload: ImportCommit["list"] =
      target === NEW_LIST
        ? {
            new: {
              name: newListName.trim(),
              color: PALETTE[lists.length % PALETTE.length]!,
            },
          }
        : target
          ? { id: target }
          : null;
    const payload: ImportCommit = {
      kind: props.kind,
      name: props.name,
      list: listPayload,
      creates: creates.map(({ row }) => ({
        title: row.title.trim(),
        due_at: rowDueAt(row, tz),
        priority: row.priority,
        estimate_min: row.proposed.estimate_min,
        source_quote: row.proposed.source_quote || null,
        list: isSyllabus ? (target ? "target" : null) : row.listId || null,
      })),
      updates: updates.map(({ row, match }) => {
        const changes = (match as Extract<ImportMatch, { status: "changed" }>).changes;
        return {
          id: (match as { taskId: string }).taskId,
          ...(changes.title && { title: row.title.trim() }),
          ...(changes.due_at && { due_at: rowDueAt(row, tz) }),
        };
      }),
    };
    try {
      const res = await api.commitImport(payload);
      await qc.invalidateQueries({ queryKey: keys.sync });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const listName =
      target === NEW_LIST
        ? newListName
        : lists.find((l) => l.id === (result.list_id ?? target))?.name;
    return (
      <div className="animate-pop-in space-y-4 rounded-2xl border border-line bg-white p-6">
        <p className="flex items-center gap-2 text-base font-bold text-ink">
          <CheckCircle2 className="h-5 w-5 text-mint" />
          Added {result.created.length} {result.created.length === 1 ? "task" : "tasks"}
          {result.updated.length ? ` and updated ${result.updated.length}` : ""}
          {listName ? ` in ${listName}` : ""}.
        </p>
        <div className="flex gap-2">
          <Link
            href="/to-dos"
            className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-[#2a2d4a]"
          >
            View in To-dos
          </Link>
          <button
            onClick={props.onCancel}
            className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink hover:bg-paper"
          >
            Import more
          </button>
        </div>
      </div>
    );
  }

  const uncertainCount = effective.filter((e) => e.include && !e.row.proposed.date_certain).length;

  return (
    <div className="space-y-4 rounded-2xl bg-[#e9ebf3] p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-ink">
            {props.tasks.length
              ? `Found ${props.tasks.length} ${props.tasks.length === 1 ? "task" : "tasks"}`
              : "No tasks found"}
          </h2>
          <p className="text-sm text-[#5b6078]">
            {props.tasks.length
              ? "Fix anything that's off, uncheck what to skip, then add them."
              : "Nothing in there looked like something to do. Try pasting more of the text."}
          </p>
        </div>
        {isSyllabus ? (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-[#7a7f96]">Add to</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-semibold text-ink"
            >
              <option value={NO_LIST}>No list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={NEW_LIST}>New list…</option>
            </select>
            {target === NEW_LIST && (
              <input
                aria-label="New list name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name"
                className="w-36 rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-semibold text-ink"
              />
            )}
          </label>
        ) : null}
      </div>

      {uncertainCount > 0 && (
        <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn">
          {uncertainCount === 1 ? "1 date needs" : `${uncertainCount} dates need`} a check.
          They&apos;re highlighted below.
        </p>
      )}

      {props.tasks.length > 0 && (
        <ul className="space-y-2">
          {effective.map(({ row, match, past, include }) => (
            <ReviewRow
              key={row.key}
              row={row}
              match={match}
              past={past}
              include={include}
              lists={lists}
              color={
                (isSyllabus
                  ? lists.find((l) => l.id === target)?.color
                  : lists.find((l) => l.id === row.listId)?.color) ?? NO_COLOR
              }
              perRowList={!isSyllabus}
              tz={tz}
              onChange={(patch) => update(row.key, patch)}
            />
          ))}
        </ul>
      )}

      {isSyllabus && missing.length > 0 && (
        <details className="rounded-xl bg-white px-3 py-2 text-sm">
          <summary className="cursor-pointer font-bold text-muted">
            Not in the new syllabus ({missing.length})
          </summary>
          <p className="mt-2 text-muted">
            These are in the list but weren&apos;t found this time. Nothing will change; delete them
            yourself if they&apos;re gone.
          </p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((m) => (
              <li key={m.id}>
                {m.title}
                {m.due_at && <span className="text-muted">, due {fmtDue(m.due_at, tz)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-3 rounded-b-2xl bg-[#e9ebf3]/95 px-4 py-3 backdrop-blur">
        <button
          disabled={!canSave || saving}
          onClick={save}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2a2d4a] disabled:opacity-40"
        >
          {saving ? "Adding…" : addLabel(creates.length, updates.length)}
        </button>
        <button
          onClick={props.onCancel}
          className="rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-ink"
        >
          Cancel
        </button>
        {needsTarget && <span className="text-sm font-semibold text-warn">Pick a list to add these to.</span>}
        {error && <span className="text-sm font-semibold text-risk">{error}</span>}
      </div>
    </div>
  );
}

function addLabel(creates: number, updates: number) {
  const parts = [];
  if (creates) parts.push(`Add ${creates} ${creates === 1 ? "task" : "tasks"}`);
  if (updates) parts.push(`${creates ? "update" : "Update"} ${updates}`);
  return parts.join(" and ") || "Add tasks";
}

function ReviewRow(props: {
  row: Row;
  match: ImportMatch;
  past: boolean;
  include: boolean;
  lists: List[];
  color: string;
  perRowList: boolean;
  tz: string;
  onChange: (patch: Partial<Row>) => void;
}) {
  const { row, match, tz } = props;
  const [showSource, setShowSource] = useState(false);
  const uncertain = !row.proposed.date_certain;
  const input =
    "rounded-lg border bg-white px-2 py-1 text-[13px] font-semibold text-ink outline-none focus:border-sky";
  const sw = swatch(props.color);
  const dateInput = uncertain ? `${input} border-warn bg-warn-bg` : `${input} border-line`;

  return (
    <li className="space-y-1.5 rounded-xl bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={props.include}
          aria-label={`Include ${row.title}`}
          onClick={() => props.onChange({ include: !props.include, touched: true })}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2"
          style={{ borderColor: sw.solid, background: props.include ? sw.solid : "transparent" }}
        >
          {props.include && <Check className="h-3 w-3" strokeWidth={4} style={{ color: sw.onSolid }} />}
        </button>
        <input
          aria-label="Title"
          value={row.title}
          onChange={(e) => props.onChange({ title: e.target.value })}
          className={`min-w-48 flex-1 ${input} border-transparent !text-sm !font-bold hover:border-line ${props.include ? "" : "opacity-50"}`}
        />
        <StatusBadge match={match} past={props.past} tz={tz} />
      </div>
      <div className={`flex flex-wrap items-center gap-2 pl-7 ${props.include ? "" : "opacity-50"}`}>
        <input
          type="date"
          aria-label="Due date"
          value={row.date}
          onChange={(e) => props.onChange({ date: e.target.value })}
          title={row.proposed.date_note ?? undefined}
          className={dateInput}
        />
        <input
          type="time"
          aria-label="Due time"
          value={row.time}
          disabled={!row.date}
          onChange={(e) => props.onChange({ time: e.target.value })}
          className={`${input} border-line disabled:opacity-40`}
        />
        <select
          aria-label="Priority"
          value={row.priority}
          onChange={(e) => props.onChange({ priority: e.target.value as Priority })}
          className={`${input} border-line`}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {props.perRowList && (
          <select
            aria-label="List"
            value={row.listId}
            onChange={(e) => props.onChange({ listId: e.target.value })}
            className={`${input} border-line`}
          >
            <option value={NO_LIST}>No list</option>
            {props.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {uncertain && (
        <p className="pl-7 text-[12px] font-semibold text-warn">
          Check this date{row.proposed.date_note ? `: ${row.proposed.date_note}` : "."}
        </p>
      )}
      {row.proposed.source_quote && (
        <button
          onClick={() => setShowSource((s) => !s)}
          className={`block max-w-full pl-7 text-left text-[12px] text-muted hover:text-ink ${showSource ? "" : "truncate"}`}
          title={showSource ? undefined : row.proposed.source_quote}
        >
          From: “{row.proposed.source_quote}”
          {row.proposed.source_found === false && " (approximate)"}
        </button>
      )}
    </li>
  );
}

function StatusBadge({ match, past, tz }: { match: ImportMatch; past: boolean; tz: string }) {
  const base = "rounded-md px-1.5 py-0.5 text-[11px] font-bold";
  if (match.status === "same")
    return <span className={`${base} bg-chip text-muted`}>Already added</span>;
  if (match.status === "changed") {
    const c = match.changes;
    const what = [
      c.due_at &&
        `due ${c.due_at[0] ? fmtDue(c.due_at[0], tz) : "none"} → ${c.due_at[1] ? fmtDue(c.due_at[1], tz) : "none"}`,
      c.title && `renamed from “${c.title[0]}”`,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <span className={`${base} bg-grape-bg text-grape-ink`} title={what}>
        Update: {what}
      </span>
    );
  }
  if (past) return <span className={`${base} bg-chip text-muted`}>Already past</span>;
  return <span className={`${base} bg-[#e6f2ec] text-[#2f6b52]`}>New</span>;
}
