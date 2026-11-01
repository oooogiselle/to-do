import type { PaneId, ZoneId } from "./layout";

/** What's being dragged: work to schedule, a block to move, or a pane to rearrange. */
export type DragItem =
  | {
      kind: "task";
      taskId: string;
      title: string;
      minutes: number;
      color: string;
      listName?: string;
      dueAt: string | null;
    }
  | {
      kind: "step";
      taskId: string;
      stepId: string;
      title: string;
      minutes: number;
      color: string;
      listName?: string;
      dueAt: string | null;
    }
  | {
      kind: "block";
      blockId: string;
      title: string;
      minutes: number;
      color: string;
      listName?: string;
      dueAt: string | null;
      /** Zoom of the pane the block was grabbed in, to turn the grab offset into minutes. */
      sourceHourPx: number;
    }
  | { kind: "pane"; paneId: PaneId; label: string };

export type ScheduleItem = Exclude<DragItem, { kind: "pane" }>;

/**
 * A day column of a calendar pane, as a drop target. Drops are hit-tested from the DOM
 * (`data-col`, `data-day`, `data-hour-px`); this just registers the column with dnd-kit.
 */
export type DayDropData = { kind: "day"; day: string };

export type ZoneDropData = { kind: "zone"; zone: ZoneId };

/** Where a dragged item would land, in minutes from local midnight of `day`. */
export type DropPreview = {
  /** Droppable id of the column, `${paneKey}:${day}`. */
  col: string;
  day: string;
  startMin: number;
  minutes: number;
  past: boolean;
};

export const dayColumnId = (paneKey: string, day: string) => `${paneKey}:${day}`;
