/** Presenting server and process states — in one place, rather than scattered conditionals. */

const DOT: Record<string, string> = {
  ready: 'bg-ok',
  failed: 'bg-bad',
  starting: 'lm-anim-pulse bg-warn',
  checking: 'lm-anim-pulse bg-warn',
}

/** The Tailwind class for a language server's status dot. */
export function statusDot(status: string): string {
  return DOT[status] ?? 'bg-subtle'
}

const TONE: Record<string, string> = { ready: 'text-ok', failed: 'text-bad' }

export function statusTone(status: string): string {
  return TONE[status] ?? 'text-subtle'
}
