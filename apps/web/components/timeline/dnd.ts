/** What's being dragged onto the timeline. */
export type DragItem =
  | { kind: "task"; taskId: string; title: string; minutes: number; color: string }
  | { kind: "step"; taskId: string; stepId: string; title: string; minutes: number; color: string }
  | { kind: "block"; blockId: string; title: string; minutes: number; color: string };

/** Where it would land, in minutes from local midnight of `day`. */
export type DropPreview = { day: string; startMin: number; minutes: number; past: boolean };
