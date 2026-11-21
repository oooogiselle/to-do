"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Columns3, Pencil, Plus, Rows3, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { splitLink, type Horizon, type IdeaKind, type List } from "@tt/shared";
import {
  HORIZON_LABEL,
  isTemp,
  setNotice,
  useAddSomeday,
  useModel,
  useResearchTask,
  useSomeday,
  type SomedayKindFilter,
} from "@tt/client";
import { ListEditor, NewListForm } from "@/components/inbox";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useDismiss } from "@/components/ui/use-dismiss";
import { useListParam } from "@/components/use-list-param";
import { SomedayBoard } from "./board";
import { LinkChip } from "./link-chip";
import { SomedayShelves } from "./shelves";

type View = "time" | "kind";
const VIEW_KEY = "someday-view";

/**
 * Someday (DESIGN.md, Layout pieces: Someday): a top bar like My day's, the add box, then one of
 * two views of the same items: By timeframe (a board) or By kind (shelves).
 */
export function SomedayView() {
  const { lists: allLists, isLoading } = useModel();
  const [view, setView] = useState<View>("time");
  const [kind, setKind] = useState<SomedayKindFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [listParam, setListParam] = useListParam();
  // The kind filter only applies to the board; the shelves already split by kind.
  const { lists, items, openCount } = useSomeday({ kind: view === "time" ? kind : "all", showDone });

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "time" || saved === "kind") setView(saved);
  }, []);
  const pickView = (v: View) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const listFilter = lists.some((l) => l.id === listParam) ? listParam : null;
  const shown = useMemo(
    () => (listFilter ? items.filter((i) => i.list.id === listFilter) : items),
    [items, listFilter],
  );
  // Edit the filtered list, or the only one there is.
  const editable = lists.find((l) => l.id === listFilter) ?? (lists.length === 1 ? lists[0] : undefined);
  const filtered = (view === "time" && kind !== "all") || !!listFilter;

  return (
    <div className="flex h-full flex-col">
      <header className="relative z-40 flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
        <div className="min-w-0 leading-tight">
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">Someday</h1>
          <p className="truncate text-[11px] text-muted">
            Goals, things to learn and people to keep in touch with · {openCount} open
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ViewSwitch value={view} onChange={pickView} />
          <ViewMenu
            view={view}
            kind={kind}
            onKind={setKind}
            lists={lists}
            listId={listFilter}
            onList={(id) => {
              setListParam(id);
              setEditing(false);
            }}
            showDone={showDone}
            onShowDone={setShowDone}
            canEdit={!!editable && !isTemp(editable.id)}
            onNewList={() => {
              setCreating(true);
              setEditing(false);
            }}
            onEditList={() => {
              setEditing(true);
              setCreating(false);
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-paper p-2.5 lg:overflow-hidden">
        {creating && (
          <div className="shrink-0 overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-card">
            <NewListForm count={allLists.length} someday onDone={() => setCreating(false)} />
          </div>
        )}
        {editing && editable && (
          <div className="shrink-0 overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-card">
            <ListEditor
              list={editable}
              openCount={shown.filter((i) => i.list.id === editable.id && i.task.status === "open").length}
              onDone={() => setEditing(false)}
            />
          </div>
        )}

        <Capture lists={lists} listId={listFilter} kindFilter={view === "time" ? kind : "all"} />

        {isLoading ? (
          <p className="px-2 text-[13px] text-muted">Loading…</p>
        ) : items.length === 0 && !filtered ? (
          <EmptyState />
        ) : view === "time" ? (
          <SomedayBoard items={shown} />
        ) : (
          <SomedayShelves items={shown} />
        )}
      </div>
    </div>
  );
}

/** By timeframe / By kind: the Segmented look, with an icon on each option. */
function ViewSwitch({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const options: { value: View; label: string; icon: LucideIcon }[] = [
    { value: "time", label: "By timeframe", icon: Columns3 },
    { value: "kind", label: "By kind", icon: Rows3 },
  ];
  return (
    <div role="radiogroup" aria-label="View" className="inline-flex rounded-xl bg-chip p-1">
      {options.map(({ value: v, label, icon: Icon }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
              on ? "bg-ink text-surface" : "text-chip-ink hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

const KIND_OPTIONS: { value: SomedayKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "goal", label: "Goals" },
  { value: "learn", label: "Learn" },
  { value: "people", label: "People" },
  { value: "idea", label: "Ideas" },
];

const menuRow =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-ink hover:bg-row-hover";

/** Show (board only), List, Show done, New list and Edit list, folded into one control. */
function ViewMenu({
  view,
  kind,
  onKind,
  lists,
  listId,
  onList,
  showDone,
  onShowDone,
  canEdit,
  onNewList,
  onEditList,
}: {
  view: View;
  kind: SomedayKindFilter;
  onKind: (k: SomedayKindFilter) => void;
  lists: List[];
  listId: string | null;
  onList: (id: string | null) => void;
  showDone: boolean;
  onShowDone: (v: boolean) => void;
  canEdit: boolean;
  onNewList: () => void;
  onEditList: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const summary = [
    view === "time" && kind !== "all" ? KIND_OPTIONS.find((o) => o.value === kind)?.label : null,
    lists.find((l) => l.id === listId)?.name,
    showDone ? "done shown" : null,
  ].filter(Boolean);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium text-ink transition-colors ${
          open ? "border-line-strong bg-active" : "border-line bg-surface hover:bg-row"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted" aria-hidden />
        View
        {summary.length > 0 && <span className="hidden font-normal text-muted sm:inline">· {summary.join(" · ")}</span>}
        <ChevronDown className="h-3 w-3 text-faint" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="View options"
          className="animate-pop-in absolute top-9 right-0 z-50 w-72 rounded-2xl border border-line-soft bg-surface p-1.5 shadow-pop"
        >
          {view === "time" && (
            <div className="p-2">
              <p className="pb-1.5 text-[11px] text-muted">Show</p>
              <Segmented<SomedayKindFilter> label="Show" size="sm" value={kind} onChange={onKind} options={KIND_OPTIONS} />
            </div>
          )}
          {lists.length > 1 && (
            <div className="border-t border-line-soft p-2 first:border-t-0">
              <label htmlFor="someday-list-filter" className="block pb-1.5 text-[11px] text-muted">
                List
              </label>
              <PickSelect
                id="someday-list-filter"
                value={listId ?? ""}
                onChange={(v) => onList(v || null)}
                className="flex w-full"
                tone="line"
              >
                <option value="">All lists</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </PickSelect>
            </div>
          )}
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-line-soft px-2 py-2.5 text-[12px] font-medium text-ink first:border-t-0">
            Show done
            <Switch checked={showDone} onChange={onShowDone} label="Show done" />
          </label>
          <div className="border-t border-line-soft pt-1">
            <button
              type="button"
              className={menuRow}
              onClick={() => {
                onNewList();
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5 text-muted" aria-hidden />
              New list
            </button>
            {canEdit && (
              <button
                type="button"
                className={menuRow}
                onClick={() => {
                  onEditList();
                  setOpen(false);
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-muted" aria-hidden />
                Edit list
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A native select dressed as a 28px control with a chevron. */
function PickSelect({
  id,
  value,
  onChange,
  children,
  className = "",
  tone = "chip",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  tone?: "chip" | "line";
}) {
  return (
    <span className={`relative ${className || "inline-flex"}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 w-full cursor-pointer appearance-none rounded-lg pr-7 pl-2.5 text-[12px] font-medium ${
          tone === "chip" ? "bg-chip text-chip-ink hover:text-ink" : "border border-line bg-surface text-ink"
        }`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
    </span>
  );
}

/**
 * The add box. A pasted link becomes the item's link (and makes it Learn unless you picked a
 * type); text alongside it becomes the title. New items get web research, except People.
 */
function Capture({
  lists,
  listId,
  kindFilter,
}: {
  lists: List[];
  listId: string | null;
  kindFilter: SomedayKindFilter;
}) {
  const addSomeday = useAddSomeday();
  const research = useResearchTask();
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ text: string; risk?: boolean } | null>(null);
  const [kind, setKind] = useState<IdeaKind | null>(null);
  const [horizon, setHorizon] = useState<Horizon | "none">("none");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => splitLink(text), [text]);
  // The type the item gets: what you picked, else the board's filter, else Learn for a link.
  const filterKind = kindFilter === "all" || kindFilter === "idea" ? null : kindFilter;
  const effectiveKind: IdeaKind | null = kind ?? filterKind ?? (parsed.link_url ? "learn" : null);
  const target = listId ?? lists.find((l) => !isTemp(l.id))?.id;

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await addSomeday(
        {
          title: parsed.title,
          link_url: parsed.link_url,
          idea_kind: effectiveKind,
          horizon: horizon === "none" ? null : horizon,
        },
        {
          listId: target,
          onAdded: (task) => {
            setNotice({ kind: "added", taskId: task.id, label: task.title, listName: "Someday" });
            if (effectiveKind === "people") return;
            research.mutate(task.id, {
              onError: (e) => setNote({ text: `Added, but couldn't find resources: ${e.message}` }),
            });
          },
        },
      );
      setText("");
      setKind(null);
    } catch {
      setNote({ text: "Couldn't create the Someday list. Try again.", risk: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex h-10 items-center gap-1.5 rounded-2xl border border-line-soft bg-surface pr-1.5 pl-4 shadow-card"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
        <label htmlFor="someday-capture" className="sr-only">
          Add a goal, something to learn or someone to keep in touch with
        </label>
        <input
          id="someday-capture"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A goal, a link to something to learn, or someone to keep in touch with…"
          className="ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
        />
        {parsed.link_url && <LinkChip url={parsed.link_url} />}
        <label htmlFor="someday-kind" className="sr-only">
          Type
        </label>
        <PickSelect
          id="someday-kind"
          value={effectiveKind ?? "none"}
          onChange={(v) => setKind(v === "none" ? null : (v as IdeaKind))}
          className="hidden sm:inline-flex"
        >
          <option value="none">Idea</option>
          <option value="goal">Goal</option>
          <option value="learn">Learn</option>
          <option value="people">People</option>
        </PickSelect>
        <label htmlFor="someday-horizon" className="sr-only">
          Timeframe
        </label>
        <PickSelect
          id="someday-horizon"
          value={horizon}
          onChange={(v) => setHorizon(v as Horizon | "none")}
          className="hidden sm:inline-flex"
        >
          <option value="none">Any time</option>
          <option value="month">{HORIZON_LABEL.month}</option>
          <option value="year">{HORIZON_LABEL.year}</option>
          <option value="someday">{HORIZON_LABEL.someday}</option>
        </PickSelect>
        <button
          type="submit"
          disabled={!parsed.title || busy}
          className="h-7 shrink-0 rounded-lg bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {note && (
        <p role={note.risk ? "alert" : "status"} className={`px-4 pt-1.5 text-[11px] ${note.risk ? "text-risk" : "text-muted"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-line-soft bg-surface px-6 py-14 text-center shadow-card">
      <p className="text-[13px] font-semibold text-ink">Nothing parked yet</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-muted">
        Add a goal for this year, someone to keep in touch with, or paste a link to a video or article
        you want to get to later. When you click open time on the calendar, the suggestions can pick from here.
      </p>
    </div>
  );
}
