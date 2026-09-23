import type { ViewTone } from '../../../electron/features/extension-host/contract'

/** Theme colours for the tones an extension may use. */
export const TONE_TEXT: Record<ViewTone, string> = {
  default: 'text-fg', muted: 'text-subtle', accent: 'text-accent', success: 'text-ok', warning: 'text-warn',
  danger: 'text-bad', added: 'text-ok', modified: 'text-warn', deleted: 'text-bad', renamed: 'text-accent',
  untracked: 'text-ok', conflict: 'text-bad',
}
