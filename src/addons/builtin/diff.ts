/**
 * Diffs and patches — what `git diff` and `git show` print, and `.diff` /
 * `.patch` files. Extensions open their diffs in this language
 * (`ui.openDocument(name, text, 'diff')`).
 *
 * A line's first character decides everything, so a tokenizer of its own is
 * simpler than word lists: added lines green, removed lines red, hunk headers
 * and file headers in their own colours.
 */

import type { Addon, CustomTokenizer, TokenKind } from '@/core/types'

/** Line starts and the colour of the whole line. */
const LINE_KINDS: [RegExp, TokenKind][] = [
  [/^(?:diff --git|index |new file mode|deleted file mode|similarity index|rename (?:from|to)|old mode|new mode)/, 'meta'],
  [/^(?:\+\+\+|---)(?: |$)/, 'tag'],
  [/^@@.*@@/, 'keyword'],
  [/^commit [0-9a-f]{7,}/, 'constant'],
  [/^(?:Author|AuthorDate|Commit|CommitDate|Date|Merge):/, 'comment'],
  [/^\+/, 'string'],
  [/^-/, 'invalid'],
  [/^\\ No newline/, 'comment'],
]

const diffTokenizer: CustomTokenizer<null> = {
  startState: () => null,
  token(stream) {
    if (!stream.sol()) {
      stream.skipToEnd()
      return null
    }
    const line = stream.string
    const hit = LINE_KINDS.find(([pattern]) => pattern.test(line))
    stream.skipToEnd()
    return hit?.[1] ?? null
  },
}

export const diffAddon: Addon = {
  id: 'lang.diff',
  name: 'Diff',
  version: '1.0.0',
  description: 'Diffs and patches, as git prints them.',
  icon: '±',
  builtin: true,
  category: 'language',
  languages: [{
    id: 'diff',
    name: 'Diff',
    extensions: ['.diff', '.patch'],
    icon: '±',
    color: '#5ecf8f',
    tokenizer: diffTokenizer as never,
  }],
}
