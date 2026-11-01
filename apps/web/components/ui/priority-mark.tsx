import type { Task } from "@tt/shared";

const LEVELS = {
  high: { bars: 3, color: "var(--tt-coral)", label: "High priority" },
  med: { bars: 2, color: "#d6a740", label: "Medium priority" },
  low: { bars: 1, color: "var(--tt-sky)", label: "Low priority" },
} as const;

/** Three rising bars, filled by priority. Renders nothing for "none". */
export function PriorityMark({ priority }: { priority: Task["priority"] }) {
  if (priority === "none") return null;
  const level = LEVELS[priority];
  return (
    <span className="inline-flex items-end gap-[2px]" role="img" aria-label={level.label} title={level.label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{ height: 6 + i * 3, background: i < level.bars ? level.color : "#d9dce8" }}
        />
      ))}
    </span>
  );
}

export const PRIORITY_CHIP = {
  high: { bg: "#faf3df", fg: "#7a5e1e", label: "High" },
  med: { bg: "var(--chip)", fg: "var(--chip-ink)", label: "Med" },
  low: { bg: "var(--chip)", fg: "var(--muted)", label: "Low" },
} as const;
