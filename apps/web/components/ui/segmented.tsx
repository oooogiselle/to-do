"use client";

/** A row of mutually exclusive buttons, the selected one filled in ink. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-chip p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-bold transition-colors ${
              size === "sm" ? "px-2.5 py-0.5 text-[12px]" : "px-3 py-1 text-sm"
            } ${active ? "bg-ink text-white" : "text-chip-ink hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
