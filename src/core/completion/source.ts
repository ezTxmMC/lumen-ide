/**
 * The merged completion source.
 *
 * A single CodeMirror source with `filter: false`: it matches for itself
 * (error-tolerantly, `matcher.ts`), sorts for itself (`ranking.ts`), and
 * brings together the language server, snippets, language words, document
 * words, words from other tabs and recently accepted suggestions.
 *
 * How it runs:
 * - Local results arrive synchronously, so the list is there immediately.
 * - The server is asked in parallel. Its answer is cached per word start and
 *   reused only while it is complete AND the new word extends the one it was
 *   requested for — a server that filters by prefix (jdtls) gets asked again
 *   after a backspace. A failed or empty answer is never kept as “complete”:
 *   the next keystroke asks again, local sources fill in meanwhile.
 * - When the answer arrives, an empty typing transaction refreshes the open
 *   list through `CompletionResult.update` — no new query, the selection
 *   stays. With the list closed, `startCompletion` opens it.
 * - Incomplete server lists are re-requested, debounced, as typing goes on;
 *   the previous request is cancelled at the server, and until the answer
 *   comes the old list still applies. Should the server return nothing after
 *   a typo, its last suggestions stay — matched error-tolerantly — for as
 *   long as the word start is unchanged.
 */

import {
  completionStatus, pickedCompletion, snippetCompletion, startCompletion,
  type Completion, type CompletionContext, type CompletionResult, type CompletionSource,
} from '@codemirror/autocomplete'
import { Transaction, type EditorState, type Extension, type Text } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { lsp } from '@/core/lsp/manager'
import { registry } from '@/core/registry'
import type { LspClient } from '@/core/lsp/client'
import type { CompletionItem, CompletionList } from '@/core/lsp/protocol'
import {
  completionClient, lspItemDeprecated, lspItemLabel, lspItemToCompletion, offsetToPos, posToOffset,
} from '@/components/editor/lsp-extension'
import { useStore } from '@/state/store'
import { t } from '@/i18n'
import type { LanguageSpec } from '@/core/types'
import { Query, matchRanges, prepare, type Prepared } from './matcher'
import { RankCache, kindClass, lspBoost, proximityBonus, rank, type Origin, type Ranked } from './ranking'
import { recencySignal, recordAccepted } from './recent'
import {
  contextKind, importScope, isTypedContext, listReusable, leadInBefore, localityOf, triggerBefore,
  type ContextKind, type ImportScope,
} from './context'
import { declaredTypeBefore, nameSuggestions } from './naming'
import {
  languageCandidates, scanWords, snippetCandidates, wordRulesFor,
  type CompletionCandidate, type TextScan, type WordRules,
} from './words'

/**
 * No cap: the list holds everything that matches, including every class from
 * the dependencies. CodeMirror renders only a window around the selection.
 */
export const RESULT_LIMIT = Number.POSITIVE_INFINITY
const INCOMPLETE_DEBOUNCE = 50
const MAX_TABS = 12
/** User event of the refresh — counts as typing but changes nothing. */
const REFRESH_EVENT = 'input.type.completion-refresh'

/** Origin and raw label per option — for the badge and for recency. */
const originOf = new WeakMap<Completion, Origin>()
const labelOf = new WeakMap<Completion, string>()
/**
 * Prepared label per option, for highlighting the match.
 *
 * `getMatch` runs for every rendered row on every keystroke, and `prepare`
 * allocates four typed arrays each time — summed over the visible rows that
 * was pure throwaway work. The option objects themselves live on in the
 * cached candidate lists, so the entry outlasts the keystroke.
 */
const preparedLabel = new WeakMap<Completion, Prepared>()

function labelOfCompletion(completion: Completion): Prepared {
  const known = preparedLabel.get(completion)
  if (known) return known
  const fresh = prepare(completion.displayLabel ?? completion.label)
  preparedLabel.set(completion, fresh)
  return fresh
}

export function completionOrigin(completion: Completion): Origin | undefined {
  return originOf.get(completion)
}

/**
 * Record origin and raw label of a candidate list — once per list.
 *
 * The mapping is fixed when the candidate is created and never changes.
 * Previously it ran over the result of every keystroke; in a language with a
 * large server index that meant tens of thousands of map writes per key. The
 * lists themselves are cached, stable objects, so a `WeakSet` is enough to
 * skip them the second time round.
 */
const registeredPools = new WeakSet<readonly CompletionCandidate[]>()

function registerPool(pool: readonly CompletionCandidate[]) {
  if (registeredPools.has(pool)) return
  registeredPools.add(pool)
  for (const candidate of pool) {
    originOf.set(candidate.data, candidate.origin)
    labelOf.set(candidate.data, candidate.label)
  }
}

/* ------------------------------------------------------------------ *
 * Context before the cursor
 * ------------------------------------------------------------------ */

interface CursorWord {
  from: number
  pos: number
  lineBefore: string
  key: string
}

function anchored(rules: WordRules): RegExp {
  return new RegExp(`(?:${rules.before.source})$`, rules.before.flags)
}

/** Word start, the text before it, and the key for the server cache. */
function cursorWord(state: EditorState, pos: number, before: RegExp): CursorWord {
  const line = state.doc.lineAt(pos)
  const text = line.text.slice(0, pos - line.from)
  const match = before.exec(text)
  const from = match ? pos - match[0].length : pos
  const lineBefore = text.slice(0, from - line.from)
  return { from, pos, lineBefore, key: `${line.number}:${lineBefore}` }
}

/* ------------------------------------------------------------------ *
 * Cached pools
 * ------------------------------------------------------------------ */

const snippetCache = new WeakMap<LanguageSpec, { version: number; pool: CompletionCandidate[] }>()

/** The language's snippets plus those other add-ons contribute, cached per registry version. */
function snippetsFor(spec: LanguageSpec): CompletionCandidate[] {
  const version = registry.getVersion()
  const hit = snippetCache.get(spec)
  if (hit && hit.version === version) return hit.pool
  const merged = { ...spec, snippets: [...(spec.snippets ?? []), ...registry.snippetsFor(spec.id)] }
  const pool = snippetCandidates(merged, (s) =>
    snippetCompletion(s.body.replaceAll('$0', '${}'), {
      label: s.label,
      detail: s.detail ?? t('completion.snippet'),
      type: 'snippet',
    }))
  snippetCache.set(spec, { version, pool })
  return pool
}

interface TabWords { content: string; languageId: string | null; pool: CompletionCandidate[] }
const tabCache = new Map<string, TabWords>()

/** Words from other open tabs of the same language, cached per content. */
function tabPools(spec: LanguageSpec, rules: WordRules): CompletionCandidate[][] {
  const state = useStore.getState()
  const live = new Set<string>()
  const out: CompletionCandidate[][] = []
  for (const tab of state.tabs) {
    live.add(tab.id)
    if (tab.id === state.activeTabId || out.length >= MAX_TABS) continue
    let entry = tabCache.get(tab.id)
    if (!entry || entry.content !== tab.content) {
      const languageId = state.languageFor(tab)?.id ?? null
      const pool = languageId === spec.id
        ? scanWords(tab.content, { origin: 'tab', rules }).pool
        : []
      entry = { content: tab.content, languageId, pool }
      tabCache.set(tab.id, entry)
    }
    if (entry.languageId !== spec.id || !entry.pool.length) continue
    out.push(entry.pool)
  }
  for (const id of tabCache.keys()) {
    if (!live.has(id)) tabCache.delete(id)
  }
  return out
}

const docCache = new WeakMap<Text, { from: number; scan: TextScan }>()

function documentScan(state: EditorState, from: number, pos: number, rules: WordRules): TextScan {
  const hit = docCache.get(state.doc)
  if (hit && hit.from === from) return hit.scan
  const scan = scanWords(state.doc.toString(), { origin: 'document', rules, cursor: pos, exclude: from })
  docCache.set(state.doc, { from, scan })
  return scan
}

/* ------------------------------------------------------------------ *
 * Server list
 * ------------------------------------------------------------------ */

interface ServerList {
  key: string
  entries: CompletionCandidate[]
  isIncomplete: boolean
  /** What had been typed when the request went out. */
  pattern: string
  /** Where the filter text starts: the earliest `textEdit` start (`@`, `list.` of a postfix item) or the word start. */
  from: number
}

function sortKey(item: CompletionItem): string {
  return item.sortText ?? item.label
}

/** What tells same-label entries apart: package or detail, signature, kind. */
function identityOf(item: CompletionItem, qualifier: string | undefined): string {
  return `${qualifier ?? ''}\0${item.labelDetails?.detail ?? ''}\0${item.kind ?? 0}`
}

function editStart(item: CompletionItem, doc: Text, lineFrom: number, wordFrom: number): number | null {
  const range = item.textEdit?.range ?? item.textEdit?.replace ?? item.textEdit?.insert
  if (!range) return null
  const start = posToOffset(doc, range.start)
  if (start < lineFrom || start > wordFrom) return null
  return start
}

/** Where a server answer sits in the document. */
interface AnswerSite {
  doc: Text
  wordFrom: number
  scope: ImportScope
  filePath: string
}

/**
 * Take a new answer. Only when the answer is empty (a typo, an error) the
 * last suggestions stay, demoted, and the list counts as incomplete so the
 * next keystroke asks again.
 */
function mergeServerList(
  previous: ServerList | null, list: CompletionList, key: string, pattern: string, client: LspClient,
  site: AnswerSite,
): ServerList {
  const items = list.items
  if (!items.length) {
    const kept = (previous?.entries ?? []).map((entry) => ({ ...entry, boost: Math.max(entry.boost - 4, -12) }))
    return { key, entries: kept, isIncomplete: true, pattern, from: previous?.from ?? site.wordFrom }
  }
  const { doc, wordFrom, scope, filePath } = site
  const lineFrom = doc.lineAt(wordFrom).from
  const starts = items.map((item) => editStart(item, doc, lineFrom, wordFrom))
  let from = wordFrom
  for (const start of starts) {
    if (start !== null && start < from) from = start
  }
  const defaults = (list as { itemDefaults?: { commitCharacters?: string[] } }).itemDefaults?.commitCharacters

  const order = items.map((item, index) => ({ item, index }))
  order.sort((a, b) => {
    const ka = sortKey(a.item)
    const kb = sortKey(b.item)
    if (ka === kb) return a.index - b.index
    return ka < kb ? -1 : 1
  })
  const entries: CompletionCandidate[] = []
  order.forEach(({ item, index: original }, index) => {
    const label = lspItemLabel(item)
    let data = lspItemToCompletion(client, item, filePath)
    const commit = item.commitCharacters ?? defaults
    if (commit?.length && !data.commitCharacters) data = { ...data, commitCharacters: commit }
    const qualifier = item.labelDetails?.description ?? item.detail?.split('\n')[0]
    const start = starts[original] ?? wordFrom
    const lead = from < wordFrom ? doc.sliceString(from, start) : ''
    const filter = item.filterText?.trim() || label
    entries.push({
      label,
      filter: prepare(lead && !filter.startsWith(lead) ? lead + filter : filter),
      origin: 'lsp',
      kind: kindClass(item.kind),
      boost: lspBoost(index, order.length, Boolean(item.preselect), lspItemDeprecated(item), item.kind),
      identity: identityOf(item, qualifier),
      deprecated: lspItemDeprecated(item),
      locality: localityOf(scope, label, qualifier),
      data,
    })
  })
  return { key, entries, isIncomplete: list.isIncomplete, pattern, from }
}

/** Name suggestions for the type in front of the cursor — cached per line start, they only depend on it. */
const nameCache = new Map<string, CompletionCandidate[]>()

function nameCandidates(lineBefore: string, languageId: string | undefined): CompletionCandidate[] {
  const type = declaredTypeBefore(lineBefore, languageId)
  if (!type) return []
  const hit = nameCache.get(type)
  if (hit) return hit
  const names = nameSuggestions(type)
  const pool = names.map((name, index): CompletionCandidate => ({
    label: name,
    filter: prepare(name),
    origin: 'name',
    // The first name is the best fit — the later ones follow in order.
    boost: 8 - index * 1.5,
    data: { label: name, type: 'variable', detail: t('completion.nameSuggestion') },
  }))
  if (nameCache.size > 200) nameCache.clear()
  nameCache.set(type, pool)
  return pool
}

/* ------------------------------------------------------------------ *
 * The source
 * ------------------------------------------------------------------ */

export interface CompletionSourceOptions {
  spec: LanguageSpec | null
  filePath: string | null
}

interface Session {
  from: number
  key: string
  memberAccess: boolean
  kind: ContextKind
  statementStart: boolean
  /** Names that fit the type just written — a declaration's variable name. */
  names: CompletionCandidate[]
  scan: TextScan
  tabs: CompletionCandidate[][]
  cache: RankCache
  recency: (label: string) => number
}

export interface MergedCompletion {
  source: CompletionSource
  /** Recency recording and lifecycle — include it alongside the source. */
  extension: Extension
}

export function createCompletionSource(options: CompletionSourceOptions): MergedCompletion {
  const { spec, filePath } = options
  const rules = wordRulesFor(spec?.id)
  const before = anchored(rules)
  const languageKey = spec?.id ?? 'plain'

  let view: EditorView | undefined
  let session: Session | null = null
  let server: ServerList | null = null
  let pendingKey: string | null = null
  let pendingPattern: string | null = null
  let awaitingKey: string | null = null
  /** Opened by us rather than the user — `explicit` then holds only for this word start. */
  let autoOpenKey: string | null = null
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  /** The server request in flight — a new one cancels it. */
  let inflight: AbortController | null = null

  const plugin = ViewPlugin.define((v) => {
    view = v
    return {
      destroy() {
        if (view === v) view = undefined
        if (timer) clearTimeout(timer)
        timer = null
        inflight?.abort()
        inflight = null
        seq++
      },
    }
  })

  function client(): LspClient | null {
    if (!filePath || !spec?.lsp?.length || !lsp.enabled) return null
    return completionClient(filePath)
  }

  function request(c: LspClient, state: EditorState, word: CursorWord, trigger: string | undefined, kind?: 1 | 2 | 3) {
    const id = ++seq
    pendingKey = word.key
    const pattern = state.sliceDoc(word.from, word.pos)
    pendingPattern = pattern
    inflight?.abort()
    const controller = new AbortController()
    inflight = controller
    void c.completion(filePath!, offsetToPos(state.doc, word.pos), trigger, controller.signal, kind).then((list) => (list.failed ? null : list), () => null)
      .then((list) => {
        if (inflight === controller) inflight = null
        if (id !== seq) return
        pendingKey = null
        pendingPattern = null
        const v = view
        if (!v || !v.plugin(plugin)) return
        // An error is not an answer: nothing is cached, the next keystroke asks again.
        if (!list) return
        const current = cursorWord(v.state, v.state.selection.main.head, before)
        if (current.key !== word.key) return
        const site: AnswerSite = { doc: v.state.doc, wordFrom: word.from, scope: importScope(v.state.doc.toString()), filePath: filePath! }
        server = mergeServerList(server?.key === word.key ? server : null, list, word.key, pattern, c, site)
        refresh(v, word.key)
      })
  }

  function scheduleRequest() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const v = view
      const c = client()
      if (!v || !c || !v.plugin(plugin)) return
      request(c, v.state, cursorWord(v.state, v.state.selection.main.head, before), undefined, 3)
    }, INCOMPLETE_DEBOUNCE)
  }

  /** Ask the server unless something valid is already on hand for this word start and pattern. */
  function ensureServer(state: EditorState, word: CursorWord, trigger: string | undefined) {
    const c = client()
    if (!c) return
    const pattern = state.sliceDoc(word.from, word.pos)
    if (server?.key === word.key) {
      if (listReusable(server, pattern)) return
      if (server.pattern === pattern) return
      if (pendingKey === word.key && pendingPattern === pattern) return
      scheduleRequest()
      return
    }
    if (pendingKey === word.key) return
    if (timer) clearTimeout(timer)
    timer = null
    request(c, state, word, trigger)
  }

  /** Answer in: refresh the open list, or open one. */
  function refresh(v: EditorView, key: string) {
    const status = completionStatus(v.state)
    if (status === 'pending') return
    if (status === 'active') {
      v.dispatch({ annotations: Transaction.userEvent.of(REFRESH_EVENT) })
      return
    }
    if (awaitingKey !== key || !v.hasFocus) return
    awaitingKey = null
    autoOpenKey = key
    startCompletion(v)
  }

  function openSession(state: EditorState, word: CursorWord): Session {
    const scan = documentScan(state, word.from, word.pos, rules)
    const kind = contextKind(word.lineBefore)
    return {
      from: word.from,
      key: word.key,
      memberAccess: kind === 'member',
      kind,
      statementStart: word.lineBefore.trim() === '',
      names: nameCandidates(word.lineBefore, spec?.id),
      scan,
      tabs: spec ? tabPools(spec, rules) : [],
      cache: new RankCache(),
      recency: recencySignal(languageKey, kind),
    }
  }

  /** Where the filter text starts — the server may reach back past the word (`@`, a postfix receiver). */
  function filterFrom(s: Session): number {
    return server?.key === s.key ? Math.min(server.from, s.from) : s.from
  }

  function build(state: EditorState, pos: number): CompletionResult | null {
    const s = session
    if (!s) return null
    const from = filterFrom(s)
    const local = from === s.from
    const pattern = state.sliceDoc(from, pos)
    const serverPool = server?.key === s.key ? server.entries : null
    const pools: CompletionCandidate[][] = []
    if (serverPool) pools.push(serverPool)
    const bareMember = s.memberAccess && !pattern && Boolean(client())
    if (!bareMember && local) {
      if (spec && !s.memberAccess) pools.push(snippetsFor(spec), languageCandidates(spec))
      pools.push(s.scan.pool, ...s.tabs)
    }

    if (s.names.length && !s.memberAccess && local) pools.unshift(s.names)

    for (const pool of pools) registerPool(pool)

    const all = rank(pattern, pools, {
      recency: s.recency,
      proximity: (label) => proximityBonus(s.scan.nearest.get(label) ?? -1),
      memberAccess: s.memberAccess,
      statementStart: s.statementStart,
    }, RESULT_LIMIT, s.cache)
    const ranked = withoutWords(all, isTypedContext(s.kind))

    if (!ranked.length) {
      awaitingKey = pendingKey === s.key ? s.key : null
      return null
    }
    awaitingKey = null

    const options: Completion[] = ranked.map((r) => r.candidate.data)

    const query = new Query(pattern)
    const ranges = new Map<Completion, readonly number[]>()
    return {
      from,
      to: pos,
      options,
      filter: false,
      getMatch: (completion) => {
        if (!pattern) return []
        const hit = ranges.get(completion)
        if (hit) return hit
        const found = matchRanges(query, labelOfCompletion(completion))
        ranges.set(completion, found)
        return found
      },
      update,
    }
  }

  /** Typed context (member access, `new`, `import` …) with server entries: plain document and tab words are noise. */
  function withoutWords(ranked: Ranked<Completion>[], typed: boolean): Ranked<Completion>[] {
    if (!typed) return ranked
    if (!ranked.some((r) => r.candidate.origin === 'lsp')) return ranked
    return ranked.filter((r) => r.candidate.origin !== 'document' && r.candidate.origin !== 'tab')
  }

  /** Typing on: re-rank synchronously for as long as the word start holds. */
  function update(
    _current: CompletionResult, from: number, _to: number, context: CompletionContext,
  ): CompletionResult | null {
    const s = session
    if (!s || from !== filterFrom(s)) return null
    const word = cursorWord(context.state, context.pos, before)
    if (word.from !== s.from || word.key !== s.key) return null
    ensureServer(context.state, word, undefined)
    return build(context.state, context.pos)
  }

  const source: CompletionSource = (context) => {
    const { state, pos } = context
    if (context.view) view = context.view
    const word = cursorWord(state, pos, before)
    const text = state.sliceDoc(word.from, pos)
    const c = client()
    const trigger = text ? null : triggerBefore(word.lineBefore, c?.triggerCharacters ?? [])
    // `new `, `import `, `@`, `extends `, `throws ` open the list by themselves when a server can answer.
    const leadIn = !text && c ? leadInBefore(word.lineBefore) : null

    // CodeMirror passes `explicit` down to follow-up queries. After we opened
    // the list ourselves it should not hold at a new word start — after a space, say.
    const explicit = context.explicit && (autoOpenKey === null || autoOpenKey === word.key)
    const names = !text ? nameCandidates(word.lineBefore, spec?.id) : []
    if (!text && !explicit && !trigger && !leadIn && !names.length) return null
    // Do not complete numbers.
    if (/^\p{N}/u.test(text) && !explicit) return null

    session = openSession(state, word)
    ensureServer(state, word, trigger ?? undefined)
    return build(state, pos)
  }

  const extension: Extension = [
    plugin,
    EditorView.updateListener.of((u) => {
      if (autoOpenKey !== null && completionStatus(u.state) === null) autoOpenKey = null
      for (const tr of u.transactions) {
        const picked = tr.annotation(pickedCompletion)
        if (!picked) continue
        recordAccepted(languageKey, labelOf.get(picked) ?? picked.label, session?.kind)
      }
    }),
  ]

  return { source, extension }
}
