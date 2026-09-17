/**
 * Candidates from language data and from text — the document and other tabs.
 * No DOM — the tests build realistic lists with it.
 */

import type { Completion } from '@codemirror/autocomplete'
import type { LanguageSpec } from '@/core/types'
import { prepare } from './matcher'
import type { Candidate, Origin } from './ranking'

export type CompletionCandidate = Candidate<Completion>

/** Languages where `-` is part of an identifier (`--color-brand`, `flex-row`). */
const DASH_LANGUAGES = new Set(['css', 'scss', 'less', 'sass', 'tailwind'])

export interface WordRules {
  /** The piece of word before the cursor, for `matchBefore`. */
  before: RegExp
  /** Whole words in the text, globally. */
  scan: RegExp
}

const PLAIN_RULES: WordRules = {
  before: /[\p{L}\p{N}_$]+/u,
  scan: /[\p{L}_$][\p{L}\p{N}_$]+/gu,
}

const DASH_RULES: WordRules = {
  before: /[\p{L}\p{N}_$-]+/u,
  scan: /[\p{L}_$-][\p{L}\p{N}_$-]+/gu,
}

export function wordRulesFor(languageId: string | null | undefined): WordRules {
  return languageId && DASH_LANGUAGES.has(languageId) ? DASH_RULES : PLAIN_RULES
}

/* ------------------------------------------------------------------ *
 * Language data
 * ------------------------------------------------------------------ */

const LANGUAGE_GROUPS: [keyof LanguageSpec, Origin, Completion['type']][] = [
  ['controls', 'control', 'keyword'],
  ['keywords', 'keyword', 'keyword'],
  ['types', 'type', 'type'],
  ['builtins', 'builtin', 'function'],
  ['constants', 'constant', 'constant'],
  ['completions', 'word', 'variable'],
]

const languageCache = new WeakMap<LanguageSpec, CompletionCandidate[]>()

/** A language's keywords, types, builtins and so on, cached. */
export function languageCandidates(spec: LanguageSpec): CompletionCandidate[] {
  const hit = languageCache.get(spec)
  if (hit) return hit
  const out: CompletionCandidate[] = []
  const seen = new Set<string>()
  for (const [key, origin, type] of LANGUAGE_GROUPS) {
    const words = spec[key] as string[] | undefined
    for (const label of words ?? []) {
      if (seen.has(label)) continue
      seen.add(label)
      out.push({ label, filter: prepare(label), origin, boost: 0, data: { label, type } })
    }
  }
  languageCache.set(spec, out)
  return out
}

/** Snippets as candidates; `toCompletion` builds the CodeMirror option. */
export function snippetCandidates(
  spec: LanguageSpec,
  toCompletion: (snippet: NonNullable<LanguageSpec['snippets']>[number]) => Completion,
): CompletionCandidate[] {
  return (spec.snippets ?? []).map((s) => ({
    label: s.label,
    filter: prepare(s.label),
    origin: 'snippet' as const,
    boost: 0,
    data: toCompletion(s),
  }))
}

/* ------------------------------------------------------------------ *
 * Words from text
 * ------------------------------------------------------------------ */

const MAX_TEXT = 600_000
const MAX_WORDS = 6000
const MAX_WORD_LENGTH = 80
const PROXIMITY_WINDOW = 20_000

/** Prepared word candidates, shared across documents and tabs. */
const wordCache = new Map<string, CompletionCandidate>()
const WORD_CACHE_LIMIT = 60_000

function wordCandidate(label: string, origin: 'document' | 'tab'): CompletionCandidate {
  const key = origin === 'tab' ? `t:${label}` : `d:${label}`
  const hit = wordCache.get(key)
  if (hit) return hit
  if (wordCache.size > WORD_CACHE_LIMIT) wordCache.clear()
  const candidate: CompletionCandidate = {
    label,
    filter: prepare(label),
    origin,
    boost: 0,
    data: { label, type: 'text' },
  }
  wordCache.set(key, candidate)
  return candidate
}

export interface TextScan {
  pool: CompletionCandidate[]
  /** Smallest distance of an occurrence to the cursor, within the window only. */
  nearest: Map<string, number>
}

export interface ScanOptions {
  origin: 'document' | 'tab'
  rules: WordRules
  /** Cursor position for proximity; `-1` for none. */
  cursor?: number
  /** Start of the word at the cursor — that occurrence does not count. */
  exclude?: number
}

/** Every word of a text, deduplicated and capped, plus proximity to the cursor. */
export function scanWords(text: string, options: ScanOptions): TextScan {
  const cursor = options.cursor ?? -1
  const nearest = new Map<string, number>()
  const pool: CompletionCandidate[] = []
  const counts = new Map<string, number>()
  const slice = sliceAround(text, cursor)
  const re = new RegExp(options.rules.scan.source, options.rules.scan.flags)

  for (const m of slice.text.matchAll(re)) {
    const word = m[0]
    const index = (m.index ?? 0) + slice.offset
    if (index === options.exclude) continue
    if (word.length > MAX_WORD_LENGTH || /^-+$/.test(word)) continue
    const distance = cursor < 0 ? -1 : Math.abs(index - cursor)
    if (distance >= 0 && distance < PROXIMITY_WINDOW) {
      const current = nearest.get(word)
      if (current === undefined || distance < current) nearest.set(word, distance)
    }
    const count = counts.get(word)
    if (count !== undefined) {
      counts.set(word, count + 1)
      continue
    }
    if (pool.length >= MAX_WORDS) continue
    counts.set(word, 1)
    pool.push(wordCandidate(word, options.origin))
  }
  return { pool, nearest }
}

/** Very large texts: only a window around the cursor. */
function sliceAround(text: string, cursor: number): { text: string; offset: number } {
  if (text.length <= MAX_TEXT) return { text, offset: 0 }
  const center = cursor < 0 ? 0 : cursor
  const offset = Math.max(0, Math.min(center - MAX_TEXT / 2, text.length - MAX_TEXT))
  return { text: text.slice(offset, offset + MAX_TEXT), offset }
}
