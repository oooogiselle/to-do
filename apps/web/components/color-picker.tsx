"use client";

/** Colors lists and tasks can take. */
export const PALETTE = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#64748b"];

/** What a task shows in when neither it nor its list has a color. */
export const NO_COLOR = "#64748b";

/**
 * A row of color swatches. With `inherit`, a leading swatch stands for "no color of its own"
 * and picks null; it shows in `inherit.color`.
 */
export function ColorPicker(props: {
  value: string | null;
  onChange: (c: string | null) => void;
  label: string;
  inherit?: { color: string; label: string };
}) {
  const swatch = (c: string | null, color: string, label: string) => (
    <button
      type="button"
      key={c ?? "inherit"}
      role="radio"
      aria-checked={props.value === c}
      aria-label={label}
      title={label}
      onClick={() => props.onChange(c)}
      className={`size-5 rounded-full ${c === null ? "border-2 border-dashed border-surface" : ""} ${props.value === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
      style={{ background: color }}
    />
  );
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-1.5">
      {props.inherit && swatch(null, props.inherit.color, props.inherit.label)}
      {PALETTE.map((c) => swatch(c, c, c))}
    </div>
  );
}
