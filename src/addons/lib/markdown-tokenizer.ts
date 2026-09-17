/**
 * A Markdown tokenizer — and with `mdx: true` also ESM imports, `{ … }`
 * expressions and JSX tags.
 */

import type { StringStream } from '@codemirror/language'
import type { CustomTokenizer, TokenKind } from '@/core/types'
import { createTokenizer } from '@/core/tokenizer'
import { typescriptSpec } from '../builtin/typescript'

const tsTokenizer = createTokenizer(typescriptSpec)

interface MarkdownState {
  /** An open code block with ``` — the content stays text. */
  fence: boolean
  /** An open YAML frontmatter at the start of the file. */
  front: boolean
  /** The first line not yet seen. */
  start: boolean
  /** An ESM line or a `{ … }` expression (MDX only). */
  embed: 'none' | 'esm' | 'expr'
  exprDepth: number
  js: unknown
  inTag: boolean
}

const HEADING = /^ {0,3}#{1,6}\s/
const BLOCKQUOTE = /^ {0,3}>+\s?/
const LIST = /^ {0,3}(?:[-*+]|\d{1,9}[.)])\s/
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const TABLE_ROW = /^ {0,3}\|.*\|\s*$/
const TABLE_SEP = /^ {0,3}\|?[\s:|-]+\|[\s:|-]*$/
const LINK = /^!?\[[^\]]*\]\([^)]*\)/
const REF_LINK = /^!?\[[^\]]*\]\[[^\]]*\]/
const AUTOLINK = /^<(?:https?:\/\/|mailto:)[^>\s]+>/
const BOLD = /^(?:\*\*|__)(?:[^*_]|\*(?!\*)|_(?!_))+(?:\*\*|__)/
const ITALIC = /^(?:\*|_)(?:[^*_\s][^*_]*)?(?:\*|_)/
const STRIKE = /^~~[^~]+~~/
const CODE_SPAN = /^`+[^`]*`+/
const ESM_LINE = /^\s*(?:import|export)\s/
const JSX_TAG = /^<\/?[A-Za-z][\w.:-]*/

export function createMarkdownTokenizer(
  { mdx = false }: { mdx?: boolean } = {},
): CustomTokenizer<MarkdownState> {
  return {
    startState: (): MarkdownState => ({
      fence: false,
      front: false,
      start: true,
      embed: 'none',
      exprDepth: 0,
      js: null,
      inTag: false,
    }),

    copyState: (s) => ({
      ...s,
      js: s.js ? (tsTokenizer.copyState?.(s.js) ?? { ...(s.js as object) }) : null,
    }),

    token(stream: StringStream, state: MarkdownState): TokenKind | null {
      const atLineStart = stream.sol()

      /* -------- YAML frontmatter at the start of the file -------- */
      if (atLineStart && state.start) {
        state.start = false
        if (stream.match(/^---\s*$/)) { state.front = true; return 'meta' }
      }
      if (state.front) {
        if (atLineStart && stream.match(/^---\s*$/)) { state.front = false; return 'meta' }
        stream.skipToEnd()
        return 'meta'
      }

      /* -------- Code blocks -------- */
      if (atLineStart && stream.match(/^ {0,3}(?:```|~~~)/)) {
        state.fence = !state.fence
        stream.skipToEnd()
        return 'meta'
      }
      if (state.fence) {
        stream.skipToEnd()
        return 'string'
      }

      /* -------- MDX: ESM lines and expressions -------- */
      if (mdx) {
        if (atLineStart && stream.match(ESM_LINE, false)) state.embed = 'esm'
        if (state.embed === 'esm') {
          if (stream.eol()) { state.embed = 'none'; return null }
          state.js ??= tsTokenizer.startState()
          const token = tsTokenizer.token(stream, state.js)
          if (stream.eol()) state.embed = 'none'
          return token
        }

        if (state.embed === 'expr') {
          if (stream.peek() === '}') {
            stream.next()
            state.exprDepth--
            if (state.exprDepth <= 0) { state.embed = 'none'; return 'meta' }
            return 'punctuation'
          }
          if (stream.peek() === '{') state.exprDepth++
          state.js ??= tsTokenizer.startState()
          return tsTokenizer.token(stream, state.js)
        }

        if (stream.peek() === '{') {
          stream.next()
          state.embed = 'expr'
          state.exprDepth = 1
          state.js = null
          return 'meta'
        }

        if (state.inTag) {
          if (stream.eatSpace()) return null
          if (stream.match('/>') || stream.match('>')) { state.inTag = false; return 'punctuation' }
          const quote = stream.peek()
          if (quote === '"' || quote === "'") {
            stream.next()
            while (!stream.eol() && !stream.match(quote)) stream.next()
            return 'string'
          }
          if (stream.eat('=')) return 'operator'
          if (stream.match(/^[^\s/>="'<]+/)) return 'attribute'
          stream.next()
          return null
        }

        if (stream.match(JSX_TAG, false)) {
          stream.eat('<')
          stream.eat('/')
          const name = stream.match(/^[A-Za-z][\w.:-]*/) as RegExpMatchArray | null
          state.inTag = true
          return name && /^[A-Z]/.test(name[0]) ? 'type' : 'tag'
        }
      }

      /* -------- Block elements -------- */
      if (atLineStart) {
        if (stream.match(HEADING)) { stream.skipToEnd(); return 'keyword' }
        if (stream.match(RULE)) return 'punctuation'
        if (stream.match(TABLE_SEP)) return 'punctuation'
        if (stream.match(BLOCKQUOTE)) return 'control'
        if (stream.match(LIST)) return 'control'
        if (stream.match(/^ {4,}\S/, false)) { stream.skipToEnd(); return 'string' }
        if (stream.match(TABLE_ROW, false)) { stream.eat('|'); return 'punctuation' }
      }

      /* -------- Inline -------- */
      if (stream.match(CODE_SPAN)) return 'string'
      if (stream.match(LINK) || stream.match(REF_LINK)) return 'function'
      if (stream.match(AUTOLINK)) return 'function'
      if (stream.match(BOLD)) return 'type'
      if (stream.match(STRIKE)) return 'comment'
      if (stream.match(ITALIC)) return 'variable'
      if (stream.peek() === '|') { stream.next(); return 'punctuation' }

      stream.next()
      stream.eatWhile(/[^*_`[\]<>{|~!\\]/)
      return null
    },
  }
}

export const markdownTokenizer = createMarkdownTokenizer()
export const mdxTokenizer = createMarkdownTokenizer({ mdx: true })
