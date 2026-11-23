/** App mark: a calendar page with a folder tab. Same artwork as the app icon. */
export function Logo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--color-brand)" />
      <rect x="14" y="17" width="36" height="33" rx="5" fill="#fff" />
      <rect x="14" y="17" width="36" height="9" rx="4" fill="#dbeafe" />
      <rect x="21" y="12" width="4" height="10" rx="2" fill="#fff" />
      <rect x="39" y="12" width="4" height="10" rx="2" fill="#fff" />
      <path d="M21 33h8l2 2.5h12v8.5a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 21 44z" fill="var(--color-brand)" />
    </svg>
  )
}
