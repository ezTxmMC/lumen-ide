import type { Snippet } from '@/core/types'
import { tr } from '@/i18n'

/**
 * Snippet details sit in static add-on data, so they hold i18n keys and are
 * translated on read: the completion list then follows a language change
 * without the add-on being rebuilt.
 */
export function localizeSnippets(snippets: Snippet[]): Snippet[] {
  return snippets.map((snippet) => Object.defineProperty({ ...snippet }, 'detail', {
    enumerable: true,
    get: () => tr(snippet.detail),
  }))
}
