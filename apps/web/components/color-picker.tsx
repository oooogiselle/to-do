"use client";

import { PALETTE } from "@tt/client";
import { HUES, canonicalColor } from "@tt/shared";

const NAMES = Object.fromEntries(
  Object.entries(HUES).map(([name, hex]) => [hex, name[0]!.toUpperCase() + name.slice(1)]),
);

/**
 * A row of color swatches. With `inherit`, a leading swatch stands for "no color of its own"
 * and picks null; it shows in `inherit.color`.
 */
export function ColorPicker(props: {
  value: string | null;
  onChange: (c: string | null) => void;
  label: string;
  inherit?: { color: string; label: string };
  size?: number;
}) {
  const size = props.size ?? 24;
  const current = props.value === null ? null : canonicalColor(props.value);
  const swatch = (c: string | null, color: string, label: string) => {
    const active = current === c;
    return (
      <button
        type="button"
        key={c ?? "inherit"}
        role="radio"
        aria-checked={active}
        aria-label={label}
        title={label}
        onClick={() => props.onChange(c)}
        className={`rounded-lg transition-transform hover:scale-110 ${c === null ? "border-2 border-dashed border-white/80" : ""}`}
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: active ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
        }}
      />
    );
  };
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-1.5 p-1">
      {props.inherit && swatch(null, props.inherit.color, props.inherit.label)}
      {PALETTE.map((c) => swatch(c, c, NAMES[c] ?? c))}
    </div>
  );
}
