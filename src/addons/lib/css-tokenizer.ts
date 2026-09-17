/** A hand-written CSS tokenizer (the selector, the property and the value kept apart). */

import type { StringStream } from '@codemirror/language'
import type { CustomTokenizer, TokenKind } from '@/core/types'

export interface CssState {
  depth: number
  /** After a `:` within a declaration → the value context. */
  value: boolean
  comment: boolean
  string: string | null
}

const AT_RULE = /^@[-\w]+/
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}\b/
const NUMBER = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?(?:%|[a-zA-Z]{1,4})?/
const IDENT = /^-{0,2}[A-Za-z_][-\w]*/
const IMPORTANT = /^!\s*important\b/

export function createCssState(): CssState {
  return { depth: 0, value: false, comment: false, string: null }
}

export const cssTokenizer: CustomTokenizer<CssState> = {
  startState: createCssState,
  copyState: (s) => ({ ...s }),

  token(stream: StringStream, state: CssState): TokenKind | null {
    if (state.comment) {
      while (!stream.eol()) {
        if (stream.match('*/')) { state.comment = false; break }
        stream.next()
      }
      if (state.comment) stream.skipToEnd()
      return 'comment'
    }

    if (state.string) {
      const quote = state.string
      while (!stream.eol()) {
        if (stream.peek() === '\\') { stream.next(); stream.next(); continue }
        if (stream.match(quote)) { state.string = null; break }
        stream.next()
      }
      if (state.string) stream.skipToEnd()
      return 'string'
    }

    if (stream.eatSpace()) return null

    if (stream.match('/*')) {
      state.comment = true
      return this.token!(stream, state)
    }
    if (stream.match('//')) { stream.skipToEnd(); return 'comment' }

    const quote = stream.peek()
    if (quote === '"' || quote === "'") {
      stream.next()
      state.string = quote
      return this.token!(stream, state)
    }

    if (stream.match(AT_RULE)) { state.value = true; return 'meta' }
    if (stream.match(IMPORTANT)) return 'keyword'
    if (stream.match(HEX_COLOR)) return 'number'

    const ch = stream.peek()!

    if (ch === '{') { stream.next(); state.depth++; state.value = false; return 'punctuation' }
    if (ch === '}') { stream.next(); state.depth = Math.max(0, state.depth - 1); state.value = false; return 'punctuation' }
    if (ch === ':') { stream.next(); if (state.depth > 0) state.value = true; return 'operator' }
    if (ch === ';') { stream.next(); state.value = false; return 'punctuation' }
    if (ch === ',' || ch === '(' || ch === ')' || ch === '[' || ch === ']') {
      stream.next()
      return 'punctuation'
    }

    if (ch === '$' || ch === '@') { stream.next(); stream.match(IDENT); return 'variable' }

    if (ch === '.' || ch === '#') {
      stream.next()
      if (stream.match(IDENT)) return 'attribute'
      return 'punctuation'
    }

    if (ch === '&' || ch === '*' || ch === '>' || ch === '+' || ch === '~' || ch === '=') {
      stream.next()
      return 'operator'
    }

    if (stream.match(NUMBER)) return 'number'

    const word = stream.match(IDENT) as RegExpMatchArray | null
    if (word) {
      if (state.depth === 0) return 'tag'                       // Selektor
      if (state.value) {
        return /^\s*\(/.test(stream.string.slice(stream.pos)) ? 'function' : 'constant'
      }
      return 'property'
    }

    stream.next()
    return null
  },
}
