import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, File, Search, Terminal, Hash, AtSign, Play, Loader2 } from 'lucide-react'
import { useStore, relativeToWorkspace, type PaletteMode } from '@/state/store'
import { useLastValue, usePresence } from '@/hooks/usePresence'
import { useCommands } from '@/hooks/useCommands'
import { fuzzyMatch, highlightParts } from '@/lib/fuzzy'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph } from './icons/FileIcon'
import { lsp } from '@/core/lsp/manager'
import { SYMBOL_GLYPH, symbolKindLabel, uriToPath, type WorkspaceSymbol } from '@/core/lsp/protocol'
import { symbolStore, flattenSymbols } from '@/lib/symbols'
import { runTask } from '@/lib/run'
import { symbolTone } from './panels/OutlinePanel'
import { t, useLanguage } from '@/i18n'
import { Kbd } from './ui'

interface Row {
  key: string
  title: string
  subtitle?: string
  category?: string
  glyph?: { glyph: string; color: string }
  indent?: number
  matches: number[]
  score: number
  run: () => void
}

/** “Search everywhere” has an interface of its own (SearchEverywhere). */
type ActiveMode = Exclude<PaletteMode, false | 'everywhere'>

/** Prefixes as in VS Code: `>` commands, `@` symbols, `#` workspace, `!` tasks. */
const PREFIXES: Record<string, ActiveMode> = {
  '>': 'commands', '@': 'symbols', '#': 'workspace-symbols', '!': 'tasks',
}

/** Placeholder keys per mode. */
const PLACEHOLDER: Record<ActiveMode, string> = {
  commands: 'palette.placeholder.commands',
  files: 'palette.placeholder.files',
  symbols: 'palette.placeholder.symbols',
  'workspace-symbols': 'palette.placeholder.workspaceSymbols',
  tasks: 'palette.placeholder.tasks',
}

const MODE_ICON: Record<ActiveMode, typeof Search> = {
  commands: Terminal,
  files: Search,
  symbols: AtSign,
  'workspace-symbols': Hash,
  tasks: Play,
}

/** Keys of the task groups. */
const GROUP_LABEL: Record<string, string> = {
  build: 'palette.group.build', run: 'palette.group.run', test: 'palette.group.test',
  clean: 'palette.group.clean', other: 'palette.group.other',
}

function emptyMessage(
  mode: ActiveMode,
  ctx: { workspace: boolean; activePath: boolean; queryLength: number; busy: boolean },
): string {
  if (mode === 'files' && !ctx.workspace) return t('palette.empty.noFolder')
  if (mode === 'symbols' && !ctx.activePath) return t('palette.empty.noFile')
  if (mode === 'symbols') return t('palette.empty.noSymbols')
  if (mode === 'workspace-symbols' && ctx.queryLength < 2) return t('palette.empty.minTwo')
  if (mode === 'workspace-symbols' && ctx.busy) return t('palette.empty.searching')
  if (mode === 'workspace-symbols') return t('palette.empty.noWorkspaceHits')
  if (mode === 'tasks') return t('palette.empty.noTasks')
  return t('palette.empty.noHits')
}

export function CommandPalette() {
  const mode = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)
  const workspace = useStore((s) => s.workspace)
  const openFile = useStore((s) => s.openFile)
  const openAt = useStore((s) => s.openAt)
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null)
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const commands = useCommands()
  // Subscribes to the language change; `t` is used directly.
  const language = useLanguage()

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [wsSymbols, setWsSymbols] = useState<(WorkspaceSymbol & { server: string })[]>([])
  const [wsBusy, setWsBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // A prefix in the search field switches the mode.
  const prefixMode = PREFIXES[query[0] ?? '']
  const openMode: ActiveMode | false = mode === 'everywhere' ? false : mode
  const { visible, closing } = usePresence(Boolean(openMode))
  // While fading out, the last mode and its input stay put.
  const lastMode = useLastValue(openMode)
  const paletteMode: ActiveMode | false = visible ? (openMode || lastMode || false) : false
  const effectiveMode: ActiveMode | false = paletteMode ? (prefixMode ?? paletteMode) : false
  const effectiveQuery = prefixMode ? query.slice(1) : query

  useEffect(() => {
    if (!mode) return
    setQuery('')
    setIndex(0)
  }, [mode])

  useEffect(() => {
    if (effectiveMode !== 'files' || !workspace) return
    window.lumen.fs.listFiles(workspace, 5000).then(setFiles).catch(() => setFiles([]))
  }, [effectiveMode, workspace])

  useEffect(() => {
    if (effectiveMode !== 'workspace-symbols') return
    const needle = effectiveQuery.trim()
    if (needle.length < 2) { setWsSymbols([]); return }
    let cancelled = false
    setWsBusy(true)
    const timer = setTimeout(() => {
      lsp.workspaceSymbols(needle)
        .then((list) => { if (!cancelled) setWsSymbols(list) })
        .catch(() => { if (!cancelled) setWsSymbols([]) })
        .finally(() => { if (!cancelled) setWsBusy(false) })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [effectiveMode, effectiveQuery])

  const rows = useMemo<Row[]>(() => {
    if (!effectiveMode) return []

    let source: Row[]
    switch (effectiveMode) {
      case 'commands':
        source = commands.map((command) => ({
          key: command.id,
          title: command.title,
          category: command.category,
          subtitle: command.keybinding,
          matches: [],
          score: 0,
          run: () => void command.run(),
        }))
        break
      case 'files':
        source = files.map((path) => {
          const name = path.split(/[\\/]/).pop() ?? path
          const relative = relativeToWorkspace(path, workspace)
          return {
            key: path,
            title: name,
            subtitle: relative.slice(0, relative.length - name.length).replace(/\/$/, ''),
            glyph: fileGlyph(name),
            matches: [],
            score: 0,
            run: () => void openFile(path),
          }
        })
        break
      case 'symbols':
        source = flattenSymbols(symbolStore.get(activePath)).map(({ node, depth }) => ({
          key: `${node.name}-${node.range.start.line}-${node.range.start.character}`,
          title: node.name,
          subtitle: `${symbolKindLabel(node.kind)} · ${t('palette.lineShort', { line: String(node.selectionRange.start.line + 1) })}`,
          glyph: { glyph: SYMBOL_GLYPH[node.kind] ?? '·', color: symbolTone(node.kind) },
          indent: depth,
          matches: [],
          score: 0,
          run: () => {
            if (!activePath) return
            void openAt(
              activePath, node.selectionRange.start.line, node.selectionRange.start.character,
              node.selectionRange.end.line, node.selectionRange.end.character,
            )
          },
        }))
        break
      case 'workspace-symbols':
        source = wsSymbols.map((symbol, i) => {
          const uri = symbol.location.uri
          const path = uriToPath(uri)
          const range = 'range' in symbol.location ? symbol.location.range : null
          return {
            key: `${uri}-${i}`,
            title: symbol.name,
            subtitle: `${symbol.containerName ? `${symbol.containerName} · ` : ''}${relativeToWorkspace(path, workspace)}${range ? `:${range.start.line + 1}` : ''}`,
            glyph: { glyph: SYMBOL_GLYPH[symbol.kind] ?? '·', color: symbolTone(symbol.kind) },
            matches: [],
            score: 0,
            run: () => {
              if (!range) {
                void openFile(path)
                return
              }
              void openAt(path, range.start.line, range.start.character, range.end.line, range.end.character)
            },
          }
        })
        break
      case 'tasks':
        source = [...config.tasks, ...(project?.tasks ?? [])].map((task) => ({
          key: task.id,
          title: task.label,
          category: GROUP_LABEL[task.group ?? 'other'] && t(GROUP_LABEL[task.group ?? 'other']),
          subtitle: `${task.command} ${task.args.join(' ')}`.slice(0, 60),
          matches: [],
          score: 0,
          run: () => void runTask(task),
        }))
        break
    }

    const needle = effectiveQuery.trim()
    if (!needle || effectiveMode === 'workspace-symbols') return source.slice(0, 300)

    return source
      .flatMap((row) => {
        const target = row.category ? `${row.category} ${row.title}` : row.title
        const hit = fuzzyMatch(target, needle)
        if (!hit) return []
        const offset = row.category ? row.category.length + 1 : 0
        return [{
          ...row,
          score: hit.score,
          matches: hit.matches.map((m) => m - offset).filter((m) => m >= 0),
        }]
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 300)
  }, [effectiveMode, effectiveQuery, commands, files, workspace, openFile, openAt, activePath, wsSymbols, project, config, language])

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!paletteMode || !effectiveMode) return null

  const commit = (row?: Row) => {
    const target = row ?? rows[index]
    setPalette(false)
    target?.run()
  }

  const Icon = MODE_ICON[effectiveMode]
  const empty = emptyMessage(effectiveMode, {
    workspace: Boolean(workspace),
    activePath: Boolean(activePath),
    queryLength: effectiveQuery.trim().length,
    busy: wsBusy,
  })

  return (
    <div
      className={`lm-anim-fade fixed inset-0 z-40 flex items-start justify-center bg-black/35 pt-[12vh] ${closing ? 'lm-closing' : ''}`}
      onClick={() => setPalette(false)}
    >
      <div
        className="lm-glass lm-shadow lm-anim-pop flex max-h-[62vh] w-[min(680px,92vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
          {wsBusy ? <Loader2 size={15} className="lm-anim-spin shrink-0 text-accent" /> : <Icon size={15} className="shrink-0 text-accent" />}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(PLACEHOLDER[effectiveMode])}
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-subtle"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPalette(false)
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(rows.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Tab') e.preventDefault()
            }}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <div className="px-3 py-8 text-center text-[12.5px] text-subtle">{empty}</div>
          )}

          {rows.map((row, i) => {
            const selected = i === index
            return (
              <button
                key={row.key}
                data-row={i}
                onMouseMove={() => setIndex(i)}
                onClick={() => commit(row)}
                className={[
                  'lm-transition flex w-full items-center gap-2.5 rounded-lumen-sm px-2.5 py-1.5 text-left',
                  selected ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
                ].join(' ')}
                style={row.indent ? { paddingLeft: 10 + row.indent * 12 } : undefined}
              >
                {row.glyph ? (
                  <span className="flex w-4 shrink-0 justify-center">
                    <IconGlyph icon={row.glyph} size={13} />
                  </span>
                ) : (
                  <File size={13} className="shrink-0 opacity-45" />
                )}

                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {row.category && (effectiveMode === 'commands' || effectiveMode === 'tasks') && (
                    <span className="text-subtle">{row.category} › </span>
                  )}
                  {highlightParts(row.title, row.matches).map((part, k) => (
                    <span key={k} className={part.hit ? 'font-semibold text-accent' : ''}>
                      {part.text}
                    </span>
                  ))}
                </span>

                {row.subtitle && (
                  <span className="max-w-[45%] shrink-0 truncate text-[11px] text-subtle">
                    {row.subtitle}
                  </span>
                )}
                {selected && <CornerDownLeft size={11} className="shrink-0 text-subtle" />}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10.5px] text-subtle">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('palette.navigate')}</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t(effectiveMode === 'tasks' || effectiveMode === 'commands' ? 'palette.run' : 'palette.open')}</span>
          <span className="ml-auto">{t('palette.entries', { count: rows.length })}</span>
        </div>
      </div>
    </div>
  )
}
