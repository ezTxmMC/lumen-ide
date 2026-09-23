/**
 * “Search everywhere” as in IntelliJ: Shift twice opens a search over files,
 * symbols, actions, tasks and text. `Tab` moves between tabs, and `File.ts:42`
 * jumps straight to the line.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AtSign, CornerDownLeft, FileText, History, Loader2, Play, Search, TextSearch, Zap,
} from 'lucide-react'
import { useStore, relativeToWorkspace, type EverywhereTab } from '@/state/store'
import { usePresence } from '@/hooks/usePresence'
import { useCommands } from '@/hooks/useCommands'
import { fuzzyMatch, highlightParts } from '@/lib/fuzzy'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph } from '../icons/FileIcon'
import { lsp } from '@/core/lsp/manager'
import { SYMBOL_GLYPH, symbolKindLabel, uriToPath, type WorkspaceSymbol } from '@/core/lsp/protocol'
import { flattenSymbols, symbolStore } from '@/lib/symbols'
import { runTask } from '@/lib/run'
import { symbolTone } from '../panels/OutlinePanel'
import { t, useLanguage } from '@/i18n'
import { Kbd } from '../ui'
import type { SearchHit } from '../../../electron/preload'

interface Item {
  key: string
  title: string
  matches: number[]
  subtitle?: string
  hint?: string
  glyph?: { glyph: string; color: string }
  icon?: ReactNode
  score: number
  run: () => void
}

interface Section {
  id: Exclude<EverywhereTab, 'all'> | 'recent'
  label: string
  items: Item[]
  /** Hits in total — more than shown when the “all” tab truncates. */
  total: number
  loading?: boolean
}

/** `label` is a key. */
const TABS: { id: EverywhereTab; label: string }[] = [
  { id: 'all', label: 'palette.everywhere.tabs.all' },
  { id: 'files', label: 'palette.everywhere.tabs.files' },
  { id: 'symbols', label: 'palette.everywhere.tabs.symbols' },
  { id: 'actions', label: 'palette.everywhere.tabs.actions' },
  { id: 'tasks', label: 'palette.everywhere.tabs.tasks' },
  { id: 'text', label: 'palette.everywhere.tabs.text' },
]

const PER_SECTION_IN_ALL = 6
const MAX_ITEMS = 200

/** `File.ts:12:4` → the search text plus line and column, 0-based. */
function splitLocation(query: string): { needle: string; line?: number; column?: number } {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(query.trim())
  if (!m || !m[1]) return { needle: query.trim() }
  return { needle: m[1], line: Number(m[2]) - 1, column: m[3] ? Number(m[3]) - 1 : 0 }
}

function score<T>(entries: T[], needle: string, text: (entry: T) => string, alt?: (entry: T) => string) {
  return entries.flatMap((entry) => {
    const primary = fuzzyMatch(text(entry), needle)
    if (primary) return [{ entry, score: primary.score + 8, matches: primary.matches }]
    const secondary = alt ? fuzzyMatch(alt(entry), needle) : null
    if (!secondary) return []
    return [{ entry, score: secondary.score, matches: [] as number[] }]
  }).sort((a, b) => b.score - a.score)
}

export function SearchEverywhere() {
  const open = useStore((s) => s.paletteOpen === 'everywhere')
  const { visible, closing } = usePresence(open)
  const tab = useStore((s) => s.everywhereTab)
  const setTab = useStore((s) => s.setEverywhereTab)
  const setPalette = useStore((s) => s.setPalette)
  const workspace = useStore((s) => s.workspace)
  const openFile = useStore((s) => s.openFile)
  const openAt = useStore((s) => s.openAt)
  const recentFiles = useStore((s) => s.recentFiles)
  const openTabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null)
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const commands = useCommands()
  // Subscribes to the language change; `t` is used directly.
  const language = useLanguage()

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [symbols, setSymbols] = useState<(WorkspaceSymbol & { server: string })[]>([])
  const [symbolsBusy, setSymbolsBusy] = useState(false)
  const [textHits, setTextHits] = useState<SearchHit[]>([])
  const [textBusy, setTextBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const { needle, line, column } = splitLocation(query)

  // On opening: select the input (IntelliJ keeps the last search), load the file list.
  useEffect(() => {
    if (!open) return
    setIndex(0)
    // Select immediately and again after focusing — rAF is unreliable in a hidden window.
    input.current?.select()
    window.setTimeout(() => input.current?.select(), 0)
    if (!workspace) return
    window.lumen.fs.listFiles(workspace, 20_000).then(setFiles).catch(() => setFiles([]))
  }, [open, workspace])

  useEffect(() => setIndex(0), [query, tab])

  // Language server symbols, debounced.
  useEffect(() => {
    if (!open || !['all', 'symbols'].includes(tab) || needle.length < 2) {
      setSymbols([])
      return
    }
    let cancelled = false
    setSymbolsBusy(true)
    const timer = setTimeout(() => {
      lsp.workspaceSymbols(needle)
        .then((result) => { if (!cancelled) setSymbols(result) })
        .catch(() => { if (!cancelled) setSymbols([]) })
        .finally(() => { if (!cancelled) setSymbolsBusy(false) })
    }, 180)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, tab, needle])

  // Full text, debounced, from three characters on.
  useEffect(() => {
    if (!open || !workspace || !['all', 'text'].includes(tab) || needle.length < 3) {
      setTextHits([])
      return
    }
    let cancelled = false
    setTextBusy(true)
    const timer = setTimeout(() => {
      window.lumen.fs.search(workspace, needle, tab === 'text' ? 300 : 20)
        .then((result) => { if (!cancelled) setTextHits(result) })
        .catch(() => { if (!cancelled) setTextHits([]) })
        .finally(() => { if (!cancelled) setTextBusy(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, tab, needle, workspace])

  const close = () => setPalette(false)

  const sections = useMemo<Section[]>(() => {
    // While fading out, the list stays put.
    if (!visible) return []
    const openFileItem = (path: string, matches: number[], itemScore: number): Item => {
      const name = path.split(/[\\/]/).pop() ?? path
      const relative = relativeToWorkspace(path, workspace)
      return {
        key: `file:${path}`,
        title: name,
        matches,
        subtitle: relative.slice(0, relative.length - name.length).replace(/\/$/, ''),
        hint: line !== undefined ? t('palette.line', { line: String(line + 1) }) : undefined,
        glyph: fileGlyph(name),
        score: itemScore,
        run: () => {
          if (line === undefined) {
            void openFile(path)
            return
          }
          void openAt(path, line, column ?? 0)
        },
      }
    }

    const result: Section[] = []

  // With nothing typed: recently opened files.
    if (!needle && (tab === 'all' || tab === 'files')) {
      const recent = [...new Set([...recentFiles, ...openTabs.map((t) => t.path).filter((p): p is string => Boolean(p))])]
        .filter((p) => !p.includes('://'))
      result.push({ id: 'recent', label: t('palette.everywhere.recent'), items: recent.slice(0, 30).map((p) => openFileItem(p, [], 0)), total: recent.length })
    }

    if (needle && (tab === 'all' || tab === 'files')) {
      const byPath = needle.includes('/')
      const recentBonus = new Map(recentFiles.map((p, i) => [p, Math.max(0, 20 - i)]))
      const scored = score(
        files,
        needle,
        (p) => (byPath ? relativeToWorkspace(p, workspace) : (p.split(/[\\/]/).pop() ?? p)),
        (p) => relativeToWorkspace(p, workspace),
      )
        .map((hit) => ({ ...hit, score: hit.score + (recentBonus.get(hit.entry) ?? 0) }))
        .sort((a, b) => b.score - a.score)
      const nameOffset = (p: string) => (byPath ? relativeToWorkspace(p, workspace).length - (p.split(/[\\/]/).pop() ?? p).length : 0)
      result.push({
        id: 'files',
        label: t('palette.everywhere.tabs.files'),
        items: scored.slice(0, MAX_ITEMS).map((hit) =>
          openFileItem(hit.entry, hit.matches.map((m) => m - nameOffset(hit.entry)).filter((m) => m >= 0), hit.score)),
        total: scored.length,
      })
    }

    if (needle && (tab === 'all' || tab === 'symbols')) {
      const local = flattenSymbols(symbolStore.get(activePath)).map(({ node }) => node)
      const localScored = score(local, needle, (n) => n.name).map(({ entry, matches, score: s }) => ({
        key: `local:${entry.name}:${entry.range.start.line}`,
        title: entry.name,
        matches,
        subtitle: `${symbolKindLabel(entry.kind)} · ${t('palette.everywhere.thisFile')}`,
        hint: t('palette.lineShort', { line: String(entry.selectionRange.start.line + 1) }),
        glyph: { glyph: SYMBOL_GLYPH[entry.kind] ?? '·', color: symbolTone(entry.kind) },
        score: s + 5,
        run: () => {
          if (!activePath) return
          void openAt(activePath, entry.selectionRange.start.line, entry.selectionRange.start.character)
        },
      }))
      const remote = score(symbols, needle, (sym) => sym.name).map(({ entry, matches, score: s }, i) => {
        const path = uriToPath(entry.location.uri)
        const range = 'range' in entry.location ? entry.location.range : null
        return {
          key: `ws:${entry.location.uri}:${entry.name}:${i}`,
          title: entry.name,
          matches,
          subtitle: `${entry.containerName ? `${entry.containerName} · ` : ''}${relativeToWorkspace(path, workspace)}`,
          hint: range ? t('palette.lineShort', { line: String(range.start.line + 1) }) : symbolKindLabel(entry.kind),
          glyph: { glyph: SYMBOL_GLYPH[entry.kind] ?? '·', color: symbolTone(entry.kind) },
          score: s,
          run: () => {
            if (!range) {
              void openFile(path)
              return
            }
            void openAt(path, range.start.line, range.start.character)
          },
        }
      })
      const items = [...localScored, ...remote].sort((a, b) => b.score - a.score)
      result.push({ id: 'symbols', label: t('palette.everywhere.tabs.symbols'), items: items.slice(0, MAX_ITEMS), total: items.length, loading: symbolsBusy })
    }

    if (tab === 'actions' || (tab === 'all' && needle)) {
      const scored = needle
        ? score(commands, needle, (c) => c.title, (c) => `${c.category ?? ''} ${c.title}`)
        : commands.map((entry) => ({ entry, score: 0, matches: [] as number[] }))
      result.push({
        id: 'actions',
        label: t('palette.everywhere.tabs.actions'),
        items: scored.slice(0, MAX_ITEMS).map(({ entry, matches, score: s }) => ({
          key: `cmd:${entry.id}`,
          title: entry.title,
          matches,
          subtitle: entry.category,
          hint: entry.keybinding,
          icon: <Zap size={12} className="text-accent" />,
          score: s,
          run: () => void entry.run(),
        })),
        total: scored.length,
      })
    }

    if (tab === 'tasks' || (tab === 'all' && needle)) {
      const all = [...config.tasks, ...(project?.tasks ?? [])]
      const scored = needle
        ? score(all, needle, (t) => t.label, (t) => `${t.command} ${t.args.join(' ')}`)
        : all.map((entry) => ({ entry, score: 0, matches: [] as number[] }))
      result.push({
        id: 'tasks',
        label: t('palette.everywhere.tabs.tasks'),
        items: scored.slice(0, MAX_ITEMS).map(({ entry, matches, score: s }) => ({
          key: `task:${entry.id}`,
          title: entry.label,
          matches,
          subtitle: `${entry.command} ${entry.args.join(' ')}`.slice(0, 80),
          icon: <Play size={12} className="text-ok" />,
          score: s,
          run: () => void runTask(entry),
        })),
        total: scored.length,
      })
    }

    if (needle.length >= 3 && (tab === 'all' || tab === 'text')) {
      result.push({
        id: 'text',
        label: t('palette.everywhere.tabs.text'),
        items: textHits.map((hit, i) => {
          const at = hit.text.toLowerCase().indexOf(needle.toLowerCase())
          return {
            key: `text:${hit.path}:${hit.line}:${i}`,
            title: hit.text,
            matches: at < 0 ? [] : Array.from({ length: needle.length }, (_, k) => at + k),
            subtitle: `${relativeToWorkspace(hit.path, workspace)}`,
            hint: t('palette.lineShort', { line: String(hit.line) }),
            icon: <TextSearch size={12} className="text-subtle" />,
            score: 0,
            run: () => void openAt(hit.path, hit.line - 1, Math.max(0, at)),
          }
        }),
        total: textHits.length,
        loading: textBusy,
      })
    }

    if (tab !== 'all') return result
    return result
      .map((section) => ({ ...section, items: section.id === 'recent' ? section.items.slice(0, 12) : section.items.slice(0, PER_SECTION_IN_ALL) }))
      .filter((section) => section.items.length > 0 || section.loading)
  }, [
    visible, tab, needle, line, column, files, symbols, symbolsBusy, textHits, textBusy, commands,
    recentFiles, openTabs, activePath, project, config, workspace, openFile, openAt, language,
  ])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!visible) return null

  const commit = (item = flat[index]) => {
    if (!item) return
    close()
    item.run()
  }

  const switchTab = (direction: 1 | -1) => {
    const current = TABS.findIndex((t) => t.id === tab)
    setTab(TABS[(current + direction + TABS.length) % TABS.length].id)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      switchTab(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((i) => Math.min(flat.length - 1, i + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit()
  }

  const loading = sections.some((s) => s.loading)
  let running = 0

  return (
    <div className={`lm-anim-fade fixed inset-0 z-40 flex items-start justify-center bg-black/35 pt-[10vh] ${closing ? 'lm-closing' : ''}`} onClick={close}>
      <div
        role="dialog"
        aria-label={t('palette.everywhere.title')}
        className="lm-glass lm-shadow lm-anim-pop flex max-h-[70vh] w-[min(760px,94vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5 border-b border-edge px-2 pt-1.5" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => { setTab(entry.id); input.current?.focus() }}
              className={[
                'lm-transition relative px-2.5 pb-1.5 pt-1 text-[12px]',
                tab === entry.id ? 'text-fg' : 'text-subtle hover:text-muted',
              ].join(' ')}
            >
              {t(entry.label)}
              {tab === entry.id && <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-accent" />}
            </button>
          ))}
          <span className="ml-auto pb-1.5 text-[10.5px] text-subtle">
            <Kbd>⇧</Kbd><Kbd>⇧</Kbd> · <Kbd>Tab</Kbd> {t('palette.everywhere.tabHint')}
          </span>
        </div>

        <div className="flex items-center gap-2.5 border-b border-edge px-4 py-2.5">
          {loading ? <Loader2 size={15} className="lm-anim-spin shrink-0 text-accent" /> : <Search size={15} className="shrink-0 text-accent" />}
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            placeholder={placeholder(tab)}
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-subtle"
          />
          {line !== undefined && <span className="shrink-0 font-mono text-[11px] text-subtle">{t('palette.jumpToLine', { line: String(line + 1) })}</span>}
        </div>

        <div ref={list} className="flex-1 overflow-y-auto p-1.5">
          {flat.length === 0 && !loading && (
            <div className="px-3 py-8 text-center text-[12.5px] text-subtle">{emptyText(tab, needle, Boolean(workspace))}</div>
          )}
          {sections.map((section) => (
            <div key={section.id} className="mb-1">
              {(tab === 'all' || section.id === 'recent') && (
                <div className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                  {section.id === 'recent' && <History size={10} />}
                  {section.label}
                  {section.loading && <Loader2 size={9} className="lm-anim-spin" />}
                  {tab === 'all' && section.id !== 'recent' && section.total > section.items.length && (
                    <button
                      className="ml-auto font-normal normal-case tracking-normal text-accent hover:underline"
                      onClick={() => { setTab(section.id as EverywhereTab); input.current?.focus() }}
                    >
                      {t('palette.everywhere.showAll', { count: section.total })}
                    </button>
                  )}
                </div>
              )}
              {section.items.map((item) => {
                const i = running++
                const selected = i === index
                return (
                  <button
                    key={item.key}
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => commit(item)}
                    className={[
                      'lm-transition flex w-full items-center gap-2.5 rounded-lumen-sm px-2.5 py-1.5 text-left',
                      selected ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
                    ].join(' ')}
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {item.glyph
                        ? <IconGlyph icon={item.glyph} size={13} />
                        : (item.icon ?? <FileText size={12} className="opacity-50" />)}
                    </span>
                    <span className={`min-w-0 shrink truncate text-[13px] ${section.id === 'text' ? 'font-mono text-[12px]' : ''}`}>
                      {highlightParts(item.title, item.matches).map((part, k) => (
                        <span key={k} className={part.hit ? 'font-semibold text-accent' : ''}>{part.text}</span>
                      ))}
                    </span>
                    {item.subtitle && <span className="min-w-0 flex-1 truncate text-[11px] text-subtle">{item.subtitle}</span>}
                    {!item.subtitle && <span className="flex-1" />}
                    {item.hint && <span className="shrink-0 font-mono text-[10.5px] text-subtle">{item.hint}</span>}
                    {selected && <CornerDownLeft size={11} className="shrink-0 text-subtle" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10.5px] text-subtle">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('palette.navigate')}</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t('palette.open')}</span>
          <span className="flex items-center gap-1"><AtSign size={10} /> <code>{t('palette.everywhere.lineSyntax')}</code> {t('palette.everywhere.lineHint')}</span>
          <span className="ml-auto">{t('palette.everywhere.hits', { count: flat.length })}</span>
        </div>
      </div>
    </div>
  )
}

function placeholder(tab: EverywhereTab) {
  return t(`palette.everywhere.placeholder.${tab}`)
}

function emptyText(tab: EverywhereTab, needle: string, hasWorkspace: boolean): string {
  if (!hasWorkspace && (tab === 'files' || tab === 'text')) return t('palette.empty.noFolder')
  if (tab === 'symbols' && needle.length < 2) return t('palette.everywhere.empty.symbolsMin')
  if (tab === 'text' && needle.length < 3) return t('palette.everywhere.empty.textMin')
  if (!needle) return t('palette.everywhere.empty.enterTerm')
  return t('palette.everywhere.empty.nothingFor', { query: needle })
}
