/**
 * The context before the cursor: does a character open the list, and does the
 * word sit behind a member access? No DOM — tested in `check-completion`.
 */

/** Never count as a trigger — do not pop up after whitespace or operators. */
const NEVER_TRIGGER = new Set([' ', '\t', '(', ')', ',', ';', '=', '{', '}', '[', ']', '+', '*', '&', '|', '!', '?', '%', '^', '~'])

/** Ambiguous triggers need the right lead-in. */
const TRIGGER_RULES: Record<string, (before: string) => boolean> = {
  ':': (s) => s.endsWith('::'),
  '>': (s) => s.endsWith('->'),
  '-': () => false,
  '<': (s) => /(^\s*#\s*include\s*|^\s*|[\p{L}\p{N}_$>])<$/u.test(s),
  '/': (s) => !s.endsWith('//') && /["'<`][^"'<>`]*\/$/.test(s),
  '.': (s) => !/(^|[^\p{L}\p{N}_$])\d+\.$/u.test(s) && !s.endsWith('..'),
}

export function triggerBefore(before: string, triggers: readonly string[]): string | null {
  const ch = before.slice(-1)
  if (!ch || NEVER_TRIGGER.has(ch) || !triggers.includes(ch)) return null
  const rule = TRIGGER_RULES[ch]
  if (rule && !rule(before)) return null
  return ch
}

export function isMemberAccess(before: string): boolean {
  if (before.endsWith('..')) return false
  if (/(^|[^\p{L}\p{N}_$])\d+\.$/u.test(before)) return false
  return /(\.|->|::)$/.test(before)
}
