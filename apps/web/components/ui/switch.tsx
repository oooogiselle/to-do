"use client";

/** On/off switch. `color` fills the track when on. */
export function Switch({
  checked,
  onChange,
  label,
  color = "var(--tt-mint)",
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: checked ? color : "#d3d6e2" }}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-5" : "left-1"}`}
      />
    </button>
  );
}
