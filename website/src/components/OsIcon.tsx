import type { Os } from '@/lib/release'

export function OsIcon({ os, size = 19 }: { os: Os; size?: number }) {
  if (os === 'windows') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 5.6 10.2 4.6v6.9H3V5.6Zm8.6-1.2L21 3v8.5h-9.4V4.4ZM3 12.9h7.2v6.8L3 18.6v-5.7Zm8.6 0H21V21l-9.4-1.3v-6.8Z" />
      </svg>
    )
  }
  if (os === 'mac') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.1 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.2 1.3-2.5 1.3-2.5 0-.1-2.5-1-2.5-3.6ZM13.9 5.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5c0 2-1.5 3-1.5 5.5 0 3-2 4.5-2 7 0 2.5 3 4.5 7.5 4.5s7.5-2 7.5-4.5c0-2.5-2-4-2-7C17.5 6.5 16 5.5 16 3.5 16 2 14.5 1 12 1S8 2 8 3.5Z" />
      <circle cx="10" cy="7" r="0.6" fill="currentColor" />
      <circle cx="14" cy="7" r="0.6" fill="currentColor" />
    </svg>
  )
}
