/** The tt. brand mark: a dark rounded tile with a calendar and a coral check. */
export function AppLogo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label="tt. — tasks on your calendar"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
    >
      <rect width="40" height="40" rx="7" fill="var(--ink)" />
      <rect x="9" y="10.5" width="22" height="20" rx="5" stroke="#fff" strokeWidth="2.2" />
      <path d="M15 7.5v5M25 7.5v5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9.5 16.5h21" stroke="#fff" strokeWidth="2.2" strokeOpacity="0.35" />
      <path
        d="M15 23.6l3.4 3.4 6.4-6.8"
        stroke="var(--tt-coral)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
