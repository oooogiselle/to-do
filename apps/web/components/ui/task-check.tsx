"use client";

import { Check } from "lucide-react";

interface TaskCheckProps {
  done: boolean;
  color: string;
  onToggle: () => void;
  label: string;
  size?: number;
  /** Check color when done (defaults to white). */
  checkColor?: string;
  disabled?: boolean;
}

/** Round checkbox in a list color. */
export function TaskCheck({
  done,
  color,
  onToggle,
  label,
  size = 20,
  checkColor = "#fff",
  disabled,
}: TaskCheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark “${label}” as not done` : `Mark “${label}” as done`}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="grid shrink-0 place-items-center rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
      style={{ width: size, height: size, borderColor: color, background: done ? color : "transparent" }}
    >
      {done && (
        <Check
          strokeWidth={3.5}
          style={{ width: size * 0.6, height: size * 0.6, color: checkColor }}
        />
      )}
    </button>
  );
}
