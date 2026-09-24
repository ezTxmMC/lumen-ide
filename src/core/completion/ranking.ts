/**
 * Ordering the suggestions. The order is tiered (compared top to bottom, the
 * first difference decides), not one summed score:
 *
 *  1. Match tier: exact-case prefix > case-insensitive prefix > camel-hump /
 *     word-boundary (`NPE` → NullPointerException) > substring / fuzzy
 *     subsequence > typo-tolerant match.
 *  2. Deprecated entries after all others of the same tier.
 *  3. Fit: the source, the kind (own variables, lower-case bias), the
 *     server's preselect and sortText order, in coarse buckets.
 *  4. Locality: already imported / same package before not imported
 *     (`Candidate.locality`, from the server's package detail).
 *  5. Recency / frequency per context, plus proximity to the cursor.
 *  6. The finer server order, the raw match score, shorter, alphabetical.
 *
 * Within the two loosest tiers the raw match score comes before step 3, so a
 * sloppy match never wins on the strength of its source alone.
 *
 * Duplicates merge only when label AND identity agree (`Candidate.identity`,
 * e.g. the package): java.util.List and java.awt.List stay two entries.
 *
 * No DOM involved — `scripts/check-completion.ts` tests it directly.
 */

import { NO_MATCH, Query, accepts, errorsOfLastMatch, rawScore, type Prepared } from './matcher'

export type Origin =
  | 'lsp' | 'snippet' | 'control' | 'keyword' | 'type' | 'builtin' | 'constant'
  | 'word' | 'document' | 'tab' | 'name'

export interface Candidate<T = unknown> {
  /** Text used to merge duplicates, without decoration such as “⊘”. */
  readonly label: string
  /** What the match runs against (`filterText`, or the label). */
  readonly filter: Prepared
  readonly origin: Origin
  /** Bonus worked out in advance (the server's order, preselect …). */
  readonly boost: number
  /** What a server entry is, when it says: variables rank up, types down while a lowerCamelCase word is typed. */
  readonly kind?: 'variable' | 'type'
  /**
   * What tells same-label entries apart (package, signature, kind). Entries
   * without one merge into every entry of the same label; entries with
   * different identities never merge.
   */
  readonly identity?: string
  readonly deprecated?: boolean
  /** 1 imported / same package, 0 unknown, -1 known not imported. */
  readonly locality?: number
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
  /** Match tier, 0 (exact-case prefix) … 4 (typo). */
  tier: number
  /** Source, kind and server order together. */
  group: number
  locality: number
  /** Recency plus proximity. */
  signal: number
  deprecated: boolean
}

export const TIER_HUMP = 2
export const TIER_FUZZY = 3
export const TIER_TYPO = 4

/** Which kind of match `p` is for the query (see the tiers above). */
export function matchTier(q: Query, p: Prepared, errors: number): number {
  if (!q.n) return 0
  if (errors > 0) return TIER_TYPO
  if (p.text.length >= q.n) {
    if (p.text.startsWith(q.text)) return 0
    let i = 0
    while (i < q.n && p.lower[i] === q.lower[i]) i++
    if (i === q.n) return 1
  }
  return isHump(q, p) ? TIER_HUMP : TIER_FUZZY
}

/** Every query character continues a run or sits on a word boundary. */
function isHump(q: Query, p: Prepared): boolean {
  let at = -1
  for (let i = 0; i < q.n; i++) {
    if (at + 1 < p.lower.length && p.lower[at + 1] === q.lower[i]) {
      at++
      continue
    }
    let k = at + 1
    while (k < p.lower.length && !(p.flags[k] & 3 && p.lower[k] === q.lower[i])) k++
    if (k >= p.lower.length) return false
    at = k
  }
  return true
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
  name: 14,
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
  name: 6,
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
/** Extra while the word being typed starts in lowercase: a variable is more likely than a type. */
export const VARIABLE_ON_LOWER = 8
export const TYPE_ON_LOWER = -5
const TYPE_KINDS = new Set([7, 8, 9, 13, 22, 25])

/** Whether an LSP completion kind counts as a variable (own or field) or a type. */
export function kindClass(kind: number | undefined): 'variable' | 'type' | undefined {
  if (kind === undefined) return undefined
  if (OWN_KINDS.has(kind)) return 'variable'
  return TYPE_KINDS.has(kind) ? 'type' : undefined
}

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
  return (candidate.origin === 'snippet' ? 's:' : 'w:') + candidate.label + '\0' + (candidate.identity ?? '')
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
  const lowerStart = /^\p{Ll}/u.test(pattern)

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

      let group = ORIGIN_BOOST[candidate.origin] + candidate.boost
      if (signals.statementStart) group += STATEMENT_BOOST[candidate.origin] ?? 0
      if (lowerStart && candidate.kind === 'variable') group += VARIABLE_ON_LOWER
      if (lowerStart && candidate.kind === 'type') group += TYPE_ON_LOWER
      const signal = (signals.recency?.(candidate.label) ?? 0) + (signals.proximity?.(candidate.label) ?? 0)
      const value = raw + group + signal - lengthPenalty(candidate.label.length, q.n)
      merge(best, {
        candidate, score: value, match: raw, errors,
        tier: matchTier(q, candidate.filter, errors),
        group, signal,
        locality: candidate.locality ?? 0,
        deprecated: Boolean(candidate.deprecated),
      })
    }
    cache?.store(pool, q, passed, passedCount)
  }

  const out = dropShadowed(best)
  out.sort(compareRanked)
  return out.length > limit ? out.slice(0, limit) : out
}

/**
 * Entries without identity (words, snippets, keywords) merge into the
 * identified entries of the same label, unless they outrank all of them.
 */
function dropShadowed<T>(best: Map<string, Ranked<T>>): Ranked<T>[] {
  const identified = new Map<string, number>()
  for (const entry of best.values()) {
    if (entry.candidate.identity === undefined) continue
    const top = identified.get(entry.candidate.label) ?? -1
    identified.set(entry.candidate.label, Math.max(top, ORIGIN_PRIORITY[entry.candidate.origin]))
  }
  if (!identified.size) return [...best.values()]
  const out: Ranked<T>[] = []
  for (const entry of best.values()) {
    const top = identified.get(entry.candidate.label)
    const shadowed = entry.candidate.identity === undefined && top !== undefined
      && ORIGIN_PRIORITY[entry.candidate.origin] <= top
    if (!shadowed) out.push(entry)
  }
  return out
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
  best.set(key, { ...winner, score, signal: Math.max(entry.signal, current.signal) })
}

/** Width of a fit bucket: the server's fine order only decides after recency. */
const GROUP_BUCKET = 2

function compareRanked(a: Ranked, b: Ranked): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1
  const loose = a.tier >= TIER_FUZZY
  if (loose && a.match !== b.match) return b.match - a.match
  const bucketA = Math.floor(a.group / GROUP_BUCKET)
  const bucketB = Math.floor(b.group / GROUP_BUCKET)
  if (bucketA !== bucketB) return bucketB - bucketA
  if (a.locality !== b.locality) return b.locality - a.locality
  if (a.signal !== b.signal) return b.signal - a.signal
  if (a.group !== b.group) return b.group - a.group
  if (a.match !== b.match) return b.match - a.match
  if (a.candidate.label.length !== b.candidate.label.length) {
    return a.candidate.label.length - b.candidate.label.length
  }
  return a.candidate.label < b.candidate.label ? -1 : 1
}
