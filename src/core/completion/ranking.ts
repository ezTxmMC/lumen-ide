/**
 * Ordering the suggestions: the match score plus the source and kind, the
 * server's own order, recently used suggestions, proximity to the cursor and
 * length.
 *
 * No DOM involved — `scripts/check-completion.ts` tests it directly.
 */

import { NO_MATCH, Query, accepts, errorsOfLastMatch, rawScore, type Prepared } from './matcher'

export type Origin =
  | 'lsp' | 'snippet' | 'control' | 'keyword' | 'type' | 'builtin' | 'constant'
  | 'word' | 'document' | 'tab'

export interface Candidate<T = unknown> {
  /** Text used to merge duplicates, without decoration such as “⊘”. */
  readonly label: string
  /** What the match runs against (`filterText`, or the label). */
  readonly filter: Prepared
  readonly origin: Origin
  /** Bonus worked out in advance (the server's order, preselect …). */
  readonly boost: number
  readonly data: T
}

export interface RankSignals {
  /** Bonus for suggestions accepted recently. */
  recency?: (label: string) => number
  /** Bonus for words close to the cursor. */
  proximity?: (label: string) => number
  /** After `.`, `->`, `::` — keywords and snippets do not belong there. */
  memberAccess?: boolean
  /** Only whitespace before the word — keywords fit particularly well. */
  statementStart?: boolean
}

export interface Ranked<T = unknown> {
  candidate: Candidate<T>
  /** Total score, which decides the order. */
  score: number
  /** The match score on its own. */
  match: number
  errors: number
}

/** Base weight per source. */
const ORIGIN_BOOST: Record<Origin, number> = {
  lsp: 6,
  snippet: 3,
  control: 3,
  keyword: 3,
  type: 3,
  builtin: 3,
  constant: 2,
  word: 2,
  document: 0,
  tab: -3,
}

/** Who wins when merging (higher keeps its docs, import and apply). */
const ORIGIN_PRIORITY: Record<Origin, number> = {
  lsp: 5,
  snippet: 4,
  control: 3,
  keyword: 3,
  type: 3,
  builtin: 3,
  constant: 3,
  word: 2,
  document: 1,
  tab: 0,
}

/** Bonus at the start of a statement. */
const STATEMENT_BOOST: Partial<Record<Origin, number>> = {
  control: 5,
  keyword: 4,
  snippet: 3,
}

/** Sources hidden on member access. */
const HIDDEN_ON_MEMBER = new Set<Origin>(['snippet', 'control', 'keyword', 'type', 'constant', 'builtin'])

/** The server's order (sortText) → a bonus of 0…LSP_ORDER. */
export const LSP_ORDER = 8
export const PRESELECT = 10

/** Own variables, parameters and fields (LSP kinds Field 5, Variable 6, Property 10) rank above everything else. */
const OWN_KINDS = new Set([5, 6, 10])
export const OWN_VARIABLE = 14

export function lspBoost(
  index: number, total: number, preselect: boolean, deprecated: boolean, kind?: number,
): number {
  const order = total > 1 ? LSP_ORDER * (1 - index / (total - 1)) : LSP_ORDER
  const own = kind !== undefined && OWN_KINDS.has(kind) ? OWN_VARIABLE : 0
  return order + own + (preselect ? PRESELECT : 0) - (deprecated ? 6 : 0)
}

/** How often and how recently a suggestion was accepted → a bonus. */
export function recencyBonus(count: number, ageMs: number): number {
  if (count <= 0) return 0
  const frequency = Math.min(count, 8) * 1.2
  const fresh = 8 * Math.exp(-Math.max(ageMs, 0) / (2 * 24 * 3600 * 1000))
  return frequency + fresh
}

/** Distance in characters to the cursor → a bonus of 0…12. */
export function proximityBonus(distance: number): number {
  if (distance < 0) return 0
  if (distance < 80) return 12
  return Math.max(0, 12 - Math.log2(distance / 80) * 2.5)
}

/** Shorter candidates win when everything else is equal. */
function lengthPenalty(length: number, patternLength: number): number {
  return Math.min(Math.max(length - patternLength, 0), 48) * 0.3
}

interface PoolCache {
  pattern: string
  maxErrors: number
  firstError: boolean
  indices: Int32Array
  count: number
}

/**
 * Remembers, per candidate list, which entries matched the last query. Typing
 * on then only re-checks that subset.
 */
export class RankCache {
  private pools = new WeakMap<readonly Candidate[], PoolCache>()

  /** Indices worth checking for `q`, or `null` meaning check them all. */
  candidates(pool: readonly Candidate[], q: Query): PoolCache | null {
    const hit = this.pools.get(pool)
    if (!hit) return null
    if (hit.maxErrors !== q.maxErrors || hit.firstError !== q.firstError) return null
    if (!q.text.toLowerCase().startsWith(hit.pattern.toLowerCase())) return null
    return hit
  }

  store(pool: readonly Candidate[], q: Query, indices: Int32Array, count: number) {
    this.pools.set(pool, { pattern: q.text, maxErrors: q.maxErrors, firstError: q.firstError, indices, count })
  }
}

function dedupeKey(candidate: Candidate): string {
  return (candidate.origin === 'snippet' ? 's:' : 'w:') + candidate.label
}

/**
 * Scores every candidate, merges duplicates and returns the best `limit`
 * entries — all of them by default — in descending order.
 */
export function rank<T>(
  pattern: string,
  pools: readonly (readonly Candidate<T>[])[],
  signals: RankSignals = {},
  limit = Number.POSITIVE_INFINITY,
  cache?: RankCache,
): Ranked<T>[] {
  const q = new Query(pattern)
  const best = new Map<string, Ranked<T>>()

  for (const pool of pools) {
    if (!pool.length) continue
    const cached = cache?.candidates(pool, q) ?? null
    const total = cached ? cached.count : pool.length
    const passed = new Int32Array(total)
    let passedCount = 0

    for (let k = 0; k < total; k++) {
      const index = cached ? cached.indices[k] : k
      const candidate = pool[index]
      const raw = rawScore(q, candidate.filter)
      if (raw <= NO_MATCH) continue
      passed[passedCount++] = index
      const errors = errorsOfLastMatch()
      if (signals.memberAccess && HIDDEN_ON_MEMBER.has(candidate.origin)) continue
      if (!accepts(q, raw, errors)) continue

      let value = raw + ORIGIN_BOOST[candidate.origin] + candidate.boost
      if (signals.statementStart) value += STATEMENT_BOOST[candidate.origin] ?? 0
      value += signals.recency?.(candidate.label) ?? 0
      value += signals.proximity?.(candidate.label) ?? 0
      value -= lengthPenalty(candidate.label.length, q.n)
      merge(best, { candidate, score: value, match: raw, errors })
    }
    cache?.store(pool, q, passed, passedCount)
  }

  const out = [...best.values()]
  out.sort(compareRanked)
  return out.length > limit ? out.slice(0, limit) : out
}

function merge<T>(best: Map<string, Ranked<T>>, entry: Ranked<T>) {
  const key = dedupeKey(entry.candidate)
  const current = best.get(key)
  if (!current) {
    best.set(key, entry)
    return
  }
  const winner = ORIGIN_PRIORITY[entry.candidate.origin] > ORIGIN_PRIORITY[current.candidate.origin]
    ? entry : current
  const score = Math.max(entry.score, current.score)
  best.set(key, { ...winner, score })
}

function compareRanked(a: Ranked, b: Ranked): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.candidate.label.length !== b.candidate.label.length) {
    return a.candidate.label.length - b.candidate.label.length
  }
  return a.candidate.label < b.candidate.label ? -1 : 1
}
