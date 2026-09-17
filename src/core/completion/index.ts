/**
 * Completion in the editor: language server, snippets, language data, and
 * words from the document and other tabs, all in one error-tolerant,
 * self-sorting source (`source.ts`). `Editor.tsx` only wires up
 * `completionExtension`.
 */

import { autocompletion, type Completion } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { lsp } from '@/core/lsp/manager'
import { subscribeLanguage, t } from '@/i18n'
import type { LanguageSpec } from '@/core/types'
import { completionOrigin, createCompletionSource } from './source'
import type { Origin } from './ranking'

export { createCompletionSource } from './source'
export { matchText } from './matcher'

/** The badge on the right of a row — only for sources the icon does not explain. */
const BADGE: Partial<Record<Origin, { text: string; title: string }>> = {
  lsp: { text: 'completion.badge.lsp', title: 'completion.origin.lsp' },
  snippet: { text: 'completion.badge.snippet', title: 'completion.origin.snippet' },
  document: { text: 'completion.badge.document', title: 'completion.origin.document' },
  tab: { text: 'completion.badge.tab', title: 'completion.origin.tab' },
}

/**
 * One template per origin, built once and cloned from then on.
 *
 * `render` runs for every visible option on every keystroke, and
 * `document.createElement` plus two translation lookups per row were a
 * noticeable share of the render time.
 */
const badgeTemplates = new Map<Origin, HTMLSpanElement>()

function badgeTemplate(origin: Origin): HTMLSpanElement | null {
  const known = badgeTemplates.get(origin)
  if (known) return known
  const badge = BADGE[origin]
  if (!badge) return null
  const span = document.createElement('span')
  span.className = 'cm-lumen-completionOrigin'
  span.textContent = t(badge.text)
  span.title = t(badge.title)
  badgeTemplates.set(origin, span)
  return span
}

// Language change: drop the templates so the badges are translated afresh.
subscribeLanguage(() => badgeTemplates.clear())

function renderBadge(completion: Completion): Node | null {
  const origin = completionOrigin(completion)
  if (!origin) return null
  return badgeTemplate(origin)?.cloneNode(true) ?? null
}

const badgeTheme = EditorView.baseTheme({
  '.cm-lumen-completionOrigin': {
    flex: 'none',
    paddingLeft: '10px',
    fontSize: '0.75em',
    lineHeight: '1.6',
    opacity: 0.5,
    fontStyle: 'normal',
  },
})

/** Rendered rows of the suggestion list — a window around the selection. */
export const MAX_RENDERED_OPTIONS = 50

export interface CompletionExtensionOptions {
  /** How many suggestions are rendered at most. */
  maxRenderedOptions?: number
}

export function completionExtension(
  spec: LanguageSpec | null,
  filePath: string | null,
  options: CompletionExtensionOptions = {},
): Extension {
  const withServer = Boolean(filePath && spec?.lsp?.length && lsp.enabled)
  if (!spec && !withServer) return []

  const merged = createCompletionSource({ spec, filePath: withServer ? filePath : null })

  return [
    autocompletion({
      override: [merged.source],
      activateOnTyping: true,
      activateOnTypingDelay: 10,
      updateSyncTime: 25,
      interactionDelay: 40,
      // A window around the selection; the list itself is complete.
      //
      // Deliberately small: CodeMirror rebuilds this window on every
      // keystroke and calls `getMatch` per row, which is a full fuzzy run per
      // option. At 300 rows that sat well beyond a frame, visible as a
      // stuttering suggestion list. Only about twelve are on screen anyway;
      // the rest is scrolling headroom.
      maxRenderedOptions: options.maxRenderedOptions ?? MAX_RENDERED_OPTIONS,
      icons: true,
      closeOnBlur: true,
      // Ctrl+Space goes through the shortcut system (editor.triggerSuggest).
      defaultKeymap: true,
      optionClass: (completion) => {
        const origin = completionOrigin(completion)
        return origin ? `cm-lumen-completion-${origin}` : ''
      },
      addToOptions: [{ render: renderBadge, position: 90 }],
    }),
    merged.extension,
    badgeTheme,
  ]
}
