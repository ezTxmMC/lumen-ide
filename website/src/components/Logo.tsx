export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="block">
      <rect x="1.5" y="1.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.6" opacity="0.32" />
      <circle cx="10" cy="10" r="4" fill="#7c8cff" />
    </svg>
  )
}
