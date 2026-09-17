/**
 * The generic, spec-driven tokenizer.
 *
 * Turns a declarative `LanguageSpec` — keyword lists and a few regexes — into
 * a CodeMirror `StreamParser`. That is what lets a language add-on get by with
 * no parser code of its own.
 */

import type { StreamParser, StringStream } from '@codemirror/language'
import { Tag } from '@lezer/highlight'
import { TOKEN_KINDS, type LanguageSpec, type StringRule, type TokenKind } from './types'

/** One Lezer tag per token kind — which keeps themes independent of CodeMirror. */
export const tokenTags = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [kind, Tag.define()]),
) as Record<TokenKind, Tag>

/**
 * CodeMirror carries a built-in legacy table that maps `tag`, `type`,
 * `variable`, `property`, `attribute` and `builtin` onto its own Lezer tags,
 * ignoring a parser's `tokenTable`. Outwardly the names from `TokenKind`
 * stand, so they go to CodeMirror with a prefix.
 */
const TOKEN_NAME = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [kind, `lm_${kind}`]),
) as Record<TokenKind, string>

const tokenTable = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [TOKEN_NAME[kind], tokenTags[kind]]),
) as Record<string, Tag>

const DEFAULT_STRINGS: StringRule[] = [
  { start: '"', escapes: true },
  { start: "'", escapes: true },
]

const DEFAULT_NUMBER =
  /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.\d[\d_]*(?:[eE][+-]?\d+)?|\d[\d_]*(?:[eE][+-]?\d+)?)[a-zA-Z_']*/
const DEFAULT_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/
const DEFAULT_OPERATOR = /^[+\-*/%=<>!&|^~?:@#\\]+/
const PUNCTUATION = /^[{}()[\];,.]/
export const DEFAULT_INDENT_OPEN = /[{[(]\s*$/
export const DEFAULT_INDENT_CLOSE = /^\s*[}\])]/

interface GenericState {
  /** An open block comment. */
  block: boolean
  /** An open multi-line string. */
  string: StringRule | null
}

function toSet(words: string[] | undefined, lower: boolean): Set<string> {
  if (!words?.length) return new Set()
  return new Set(lower ? words.map((w) => w.toLowerCase()) : words)
}

type StringOutcome =
  | 'closed'        // schließendes Trennzeichen gefunden
  | 'interpolate'   // Interpolation beginnt an der aktuellen Position
  | 'eol'           // Zeilenende erreicht

/** Eats a string's contents up to its end, an interpolation, or the end of the line. */
function consumeString(stream: StringStream, rule: StringRule): StringOutcome {
  const end = rule.end ?? rule.start
  const escapes = rule.escapes !== false
  while (!stream.eol()) {
    if (escapes && stream.peek() === '\\') {
      stream.next()
      stream.next()
      continue
    }
    if (rule.interpolate && stream.match(rule.interpolate, false)) return 'interpolate'
    if (stream.match(end)) return 'closed'
    stream.next()
  }
  return 'eol'
}

/** Eats `${ … }` along with nested braces. */
function consumeInterpolation(stream: StringStream) {
  let depth = 1
  while (!stream.eol() && depth > 0) {
    const ch = stream.next()
    if (ch === '{') depth++
    if (ch === '}') depth--
  }
}

type AnyTokenizer = {
  startState(): unknown
  copyState?(state: unknown): unknown
  token(stream: StringStream, state: unknown): TokenKind | null
}

/**
 * The tokenizer of a language proper — it yields `TokenKind` names. Useful
 * when one language embeds another (HTML → CSS/JS).
 */
export function createTokenizer(spec: LanguageSpec): AnyTokenizer {
  if (spec.tokenizer) return spec.tokenizer as unknown as AnyTokenizer

  const ci = spec.caseInsensitive === true
  const keywords = toSet(spec.keywords, ci)
  const controls = toSet(spec.controls, ci)
  const types = toSet(spec.types, ci)
  const builtins = toSet(spec.builtins, ci)
  const constants = toSet(spec.constants, ci)

  const strings = spec.strings ?? DEFAULT_STRINGS
  const numbers = spec.numbers ?? DEFAULT_NUMBER
  const identifier = spec.identifier ?? DEFAULT_IDENT
  const operators = spec.operators ?? DEFAULT_OPERATOR
  const lineComment = spec.comments?.line
  const blockComment = spec.comments?.block

  function classifyWord(word: string, afterDot: boolean, stream: StringStream): TokenKind {
    const key = ci ? word.toLowerCase() : word
    if (controls.has(key)) return 'control'
    if (keywords.has(key)) return 'keyword'
    if (types.has(key)) return 'type'
    if (constants.has(key)) return 'constant'
    if (builtins.has(key)) return 'builtin'
    if (afterDot) {
      // A method call, as opposed to a plain field access.
      return /^\s*\(/.test(stream.string.slice(stream.pos)) ? 'function' : 'property'
    }
    if (/^\s*\(/.test(stream.string.slice(stream.pos))) return 'function'
    if (spec.capitalizedAsType && /^[A-Z]/.test(word)) return 'type'
    if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) return 'constant'
    return 'variable'
  }

  return {
    startState: (): GenericState => ({ block: false, string: null }),
    copyState: (s) => ({ ...(s as GenericState) }),

    token(stream, state) {
      const st = state as GenericState

      // Continuation of an open string — multi-line, or interrupted by an
      // interpolation.
      if (st.string) {
        const rule = st.string
        if (rule.interpolate && stream.match(rule.interpolate)) {
          consumeInterpolation(stream)
          return 'meta'
        }
        const outcome = consumeString(stream, rule)
        if (outcome === 'closed' || (outcome === 'eol' && !rule.multiline)) st.string = null
        return rule.kind ?? 'string'
      }
      if (st.block && blockComment) {
        while (!stream.eol()) {
          if (stream.match(blockComment[1])) { st.block = false; break }
          stream.next()
        }
        if (st.block) stream.skipToEnd()
        return 'comment'
      }

      if (stream.eatSpace()) return null

      // Directives (#include, @media …)
      if (spec.meta) {
        const at = stream.pos
        if (stream.match(spec.meta)) {
          if (stream.pos > at) return 'meta'
        }
      }

      if (lineComment && stream.match(lineComment)) {
        stream.skipToEnd()
        return 'comment'
      }

      if (blockComment && stream.match(blockComment[0])) {
        while (!stream.eol()) {
          if (stream.match(blockComment[1])) return 'comment'
          stream.next()
        }
        st.block = true
        return 'comment'
      }

      for (const rule of strings) {
        if (stream.match(rule.start)) {
          st.string = rule
          const outcome = consumeString(stream, rule)
          if (outcome === 'closed' || (outcome === 'eol' && !rule.multiline)) st.string = null
          return rule.kind ?? 'string'
        }
      }

      if (stream.match(numbers)) return 'number'

      const afterDot = stream.pos > 0 && stream.string[stream.pos - 1] === '.'
      const word = stream.match(identifier) as RegExpMatchArray | null
      if (word) return classifyWord(word[0], afterDot, stream)

      if (stream.match(PUNCTUATION)) return 'punctuation'
      if (stream.match(operators)) return 'operator'

      stream.next()
      return null
    },
  }
}

/** Wraps the tokenizer for CodeMirror: name prefix and metadata. */
export function buildStreamParser(spec: LanguageSpec): StreamParser<unknown> {
  const tokenizer = createTokenizer(spec)
  return {
    name: spec.id,
    tokenTable,
    startState: () => tokenizer.startState(),
    copyState: tokenizer.copyState
      ? (state) => tokenizer.copyState!(state)
      : undefined,
    languageData: languageDataFor(spec),
    token: (stream, state) => {
      const kind = tokenizer.token(stream, state)
      return kind ? TOKEN_NAME[kind] : null
    },
  }
}

function languageDataFor(spec: LanguageSpec) {
  const data: Record<string, unknown> = {}
  const line = spec.comments?.line
  const block = spec.comments?.block
  if (line || block) {
    data.commentTokens = {
      ...(line ? { line } : {}),
      ...(block ? { block: { open: block[0], close: block[1] } } : {}),
    }
  }
  data.closeBrackets = { brackets: ['(', '[', '{', "'", '"', '`'] }
  data.indentOnInput = spec.indentClose ?? DEFAULT_INDENT_CLOSE
  data.wordChars = '$_'
  return data
}

