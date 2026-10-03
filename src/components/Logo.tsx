/**
 * The mark: the reader's focal point — two hairline rails with centre notches
 * framing a single pivot. Uses theme colours so it works in every theme.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.5" fill="var(--raised)" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M7 9.5h18M7 22.5h18" stroke="var(--subtle)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 9.5v3M16 22.5v-3" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="13.6" y="13.6" width="4.8" height="4.8" rx="1.2" fill="var(--accent)" />
    </svg>
  );
}
