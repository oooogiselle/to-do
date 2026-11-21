"use client";

import { localDate, swatch, type Step } from "@tt/shared";
import { byLongestGap, isTemp, useCompletion, useModel, type SomedayItem } from "@tt/client";
import { useOpenTask } from "@/components/app-shell";
import { TaskCheck } from "@/components/ui/task-check";
import { ItemAction, ItemMenu, Meta, PaneHead, rowFacts } from "./item-parts";

/**
 * By kind: a shelf per kind, each row shaped like a My day plan row (thread, check, title, one
 * grey line) with the one action that kind needs. People sort by how long since you talked.
 */
export function SomedayShelves({ items }: { items: SomedayItem[] }) {
  const of = (k: SomedayItem["task"]["idea_kind"]) => items.filter((i) => i.task.idea_kind === k);
  const people = of("people").sort((a, b) => byLongestGap(a.task, b.task));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-h-0 flex-col gap-2.5">
        <Shelf title="Goals" items={of("goal")} empty="No goals yet" />
        <Shelf title="Learn" items={of("learn")} empty="Nothing to learn yet" grow />
      </div>
      <div className="flex min-h-0 flex-col gap-2.5">
        <Shelf title="People" items={people} empty="No one to keep in touch with yet" />
        <Shelf title="Ideas" items={of(null)} empty="No unsorted ideas" grow />
      </div>
    </div>
  );
}

function Shelf({ title, items, empty, grow }: { title: string; items: SomedayItem[]; empty: string; grow?: boolean }) {
  const { stepsByTask } = useModel();
  return (
    <section
      aria-label={title}
      className={`flex flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-card ${grow ? "lg:min-h-0 lg:flex-1" : "shrink-0 lg:max-h-[55%]"}`}
    >
      <PaneHead title={title} count={items.filter((i) => i.task.status === "open").length} />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item) => (
          <Row key={item.task.id} item={item} steps={stepsByTask.get(item.task.id) ?? []} />
        ))}
        {items.length === 0 && <li className="px-5 py-3 text-[11px] text-faint">{empty}</li>}
      </ul>
    </section>
  );
}

function Row({ item, steps }: { item: SomedayItem; steps: Step[] }) {
  const { task, list } = item;
  const { settings } = useModel();
  const openTask = useOpenTask();
  const { setTaskDone } = useCompletion();
  const done = task.status === "done";
  const color = swatch(task.color ?? list.color).solid;
  const today = localDate(new Date(), settings.timezone);
  return (
    <li className="group relative grid grid-cols-[16px_minmax(0,1fr)_auto_24px] items-center gap-x-3 border-b border-line-soft py-2 pr-3 pl-5 transition-colors hover:bg-row">
      <span
        aria-hidden
        className={`absolute top-2 bottom-2 left-2 w-[3px] rounded-full ${done ? "opacity-35" : ""}`}
        style={{ background: color }}
      />
      <TaskCheck
        size={16}
        done={done}
        color={color}
        onToggle={() => setTaskDone(task.id, !done)}
        label={task.title}
        disabled={isTemp(task.id)}
      />
      <span className="min-w-0">
        <button
          type="button"
          onClick={() => !isTemp(task.id) && openTask(task.id)}
          className={`block max-w-full truncate text-left text-[13px] font-medium focus-visible:underline ${done ? "text-faint line-through" : "text-ink"}`}
        >
          {task.title}
        </button>
        <Meta parts={rowFacts(item, steps, today)} />
      </span>
      <ItemAction item={item} steps={steps} />
      <ItemMenu
        item={item}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 no-hover:opacity-100"
      />
    </li>
  );
}
