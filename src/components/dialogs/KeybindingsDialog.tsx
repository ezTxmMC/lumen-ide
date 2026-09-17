import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Download, Keyboard, Plus, RotateCcw, Search, Upload, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { useDialogVisible } from '@/hooks/usePresence'
import {
  chordFromEvent, chordToString, DOUBLE_SHIFT, formatBinding, keybindings, normalizeBinding,
  presetBindings, PRESETS, type PresetId,
} from '@/core/keybindings'
import { useCommands } from '@/hooks/useCommands'
import { useT } from '@/i18n'
import type { Command } from '@/core/types'
import { Button, Empty } from '../ui'
import { DialogShell, type DialogSection } from './DialogShell'

type Filter = 'all' | 'modified' | 'conflicts' | 'unbound'

const SEQUENCE_WAIT_MS = 1000

/** Records a key combination, two-chord sequences included. */
function Recorder({ onDone, onCancel, compact = false }: {
  onDone: (binding: string) => void
  onCancel: () => void
  compact?: boolean
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [chords, setChords] = useState<string[]>([])
  const timer = useRef(0)

  useEffect(() => {
    ref.current?.focus()
    return () => window.clearTimeout(timer.current)
  }, [])

  const commit = (list: string[]) => {
    window.clearTimeout(timer.current)
    if (!list.length) return
    onDone(list.join(' '))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const native = event.nativeEvent
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      onCancel()
      return
    }
    if (event.key === 'Enter' && chords.length && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      commit(chords)
      return
    }
    const chord = chordFromEvent(native)
    if (!chord) return
    const next = chords.length >= 2 ? [chordToString(chord)] : [...chords, chordToString(chord)]
    setChords(next)
    window.clearTimeout(timer.current)
    if (next.length === 2) {
      commit(next)
      return
    }
    // Without a second chord inside the wait, the first stands alone.
    timer.current = window.setTimeout(() => commit(next), compact ? 0 : SEQUENCE_WAIT_MS)
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-keybinding-recorder
      onKeyDown={onKeyDown}
      onBlur={onCancel}
      className="lm-anim-pop lm-anim-glow flex min-w-[180px] items-center gap-2 rounded-lumen-sm border border-accent bg-input px-2 py-1 outline-none"
      title={t('keybindings.recordingHint')}
    >
      <Keyboard size={12} className="shrink-0 text-accent" />
      <span className="font-mono text-[11.5px] text-fg">
        {chords.length ? formatBinding(chords.join(' ')) : t('keybindings.recording')}
      </span>
    </div>
  )
}

function KeyChip({ binding, conflicts, onRemove, removeLabel }: {
  binding: string
  conflicts: string[]
  onRemove?: () => void
  removeLabel: string
}) {
  const t = useT()
  return (
    <span
      className={[
        'group/chip lm-transition inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10.5px]',
        conflicts.length ? 'border-warn/60 bg-warn/10 text-warn' : 'border-edge bg-input text-muted',
      ].join(' ')}
      title={conflicts.length ? t('keybindings.conflict', { commands: conflicts.join(', ') }) : undefined}
    >
      {conflicts.length > 0 && <AlertTriangle size={9} />}
      {binding === DOUBLE_SHIFT ? t('keybindings.doubleShift') : formatBinding(binding)}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={removeLabel}
          className="lm-transition -mr-0.5 hidden rounded-sm text-subtle hover:text-bad group-hover/chip:inline-flex"
        >
          <X size={9} />
        </button>
      )}
    </span>
  )
}

export function KeybindingsDialog() {
  const t = useT()
  const open = useDialogVisible('keybindings')
  const preset = useStore((s) => s.keymapPreset)
  const overrides = useStore((s) => s.keybindingOverrides)
  const setPreset = useStore((s) => s.setKeymapPreset)
  const setKeybinding = useStore((s) => s.setKeybinding)
  const resetKeybindings = useStore((s) => s.resetKeybindings)
  const notify = useStore((s) => s.notify)
  useSyncExternalStore(keybindings.subscribe, keybindings.getVersion)
  const commands = useCommands({ includeHidden: true })

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [recordingFor, setRecordingFor] = useState<{ id: string; replace?: string } | null>(null)
  const [keySearch, setKeySearch] = useState<string | null>(null)
  const [keySearchActive, setKeySearchActive] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setRecordingFor(null)
    setKeySearch(null)
    setKeySearchActive(false)
  }, [open])

  const titleOf = useMemo(() => new Map(commands.map((c) => [c.id, c.title])), [commands])

  const rows = useMemo(() => {
    const unique = new Map<string, Command>()
    for (const command of commands) if (!unique.has(command.id)) unique.set(command.id, command)
    const base = presetBindings(preset)
    return [...unique.values()].map((command) => {
      const bindings = keybindings.bindingsFor(command.id)
      const modified = command.id in overrides
      const conflicts = Object.fromEntries(bindings.map((b) => [
        b,
        keybindings.conflicts(b, command.id).map((id) => titleOf.get(id) ?? id),
      ]))
      const source = sourceOf(modified, command.id in base, bindings.length > 0)
      return { command, bindings, modified, conflicts, source }
    })
  }, [commands, overrides, preset, titleOf])

  if (!open) return null

  const needle = query.trim().toLowerCase()
  const keyNeedle = keySearch ? normalizeBinding(keySearch) : null
  const visible = rows.filter((row) => {
    if (filter === 'modified' && !row.modified) return false
    if (filter === 'conflicts' && !Object.values(row.conflicts).some((list) => list.length)) return false
    if (filter === 'unbound' && row.bindings.length) return false
    if (keyNeedle) return row.bindings.some((b) => normalizeBinding(b) === keyNeedle || normalizeBinding(b).startsWith(`${keyNeedle} `))
    if (!needle) return true
    const haystack = `${row.command.title} ${row.command.id} ${row.command.category ?? ''} ${row.bindings.map(formatBinding).join(' ')}`.toLowerCase()
    return needle.split(/\s+/).every((part) => haystack.includes(part))
  })

  const groups = new Map<string, typeof visible>()
  for (const row of visible) {
    const key = row.command.category ?? '—'
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const counts: Record<Filter, number> = {
    all: rows.length,
    modified: rows.filter((r) => r.modified).length,
    conflicts: rows.filter((r) => Object.values(r.conflicts).some((l) => l.length)).length,
    unbound: rows.filter((r) => !r.bindings.length).length,
  }

  const sections: DialogSection[] = (['all', 'modified', 'conflicts', 'unbound'] as const).map((id) => ({
    id,
    label: t(`keybindings.filter.${id}`),
    badge: String(counts[id]),
  }))

  const applyBinding = (id: string, binding: string, replace?: string) => {
    const current = keybindings.bindingsFor(id)
    const without = replace ? current.filter((b) => normalizeBinding(b) !== normalizeBinding(replace)) : current
    if (without.some((b) => normalizeBinding(b) === normalizeBinding(binding))) return
    setKeybinding(id, [...without, binding])
  }

  const exportKeys = async () => {
    const target = await window.lumen.dialog.saveFile('lumen-keybindings.json')
    if (!target) return
    await window.lumen.fs.writeFile(target, `${JSON.stringify({ preset, overrides }, null, 2)}\n`)
  }

  const importKeys = async () => {
    const picked = await window.lumen.dialog.openFile()
    if (!picked) return
    try {
      const parsed = JSON.parse(picked.content) as { preset?: PresetId; overrides?: Record<string, string[]> }
      if (!parsed.overrides || typeof parsed.overrides !== 'object') throw new Error('invalid')
      if (parsed.preset && PRESETS.some((p) => p.id === parsed.preset)) setPreset(parsed.preset)
      for (const [id, list] of Object.entries(parsed.overrides)) {
        if (Array.isArray(list)) setKeybinding(id, list.filter((b) => typeof b === 'string'))
      }
      notify(t('keybindings.imported'), 'success')
    } catch {
      notify(t('keybindings.invalidImport'), 'error')
    }
  }

  return (
    <DialogShell
      id="keybindings"
      title={t('shell.dialog.keybindings')}
      icon={Keyboard}
      wide
      sections={sections}
      section={filter}
      onSection={(id) => setFilter(id as Filter)}
      search={query}
      onSearch={(value) => { setKeySearch(null); setQuery(value) }}
      searchPlaceholder={t('keybindings.searchPlaceholder')}
      headerExtra={
        <div className="flex items-center gap-1">
          {keySearchActive
            ? (
              <Recorder
                compact
                onDone={(binding) => { setKeySearch(binding); setKeySearchActive(false); setQuery('') }}
                onCancel={() => setKeySearchActive(false)}
              />
            )
            : (
              <Button size="sm" variant={keySearch ? 'solid' : 'ghost'} title={t('keybindings.searchByKeysHint')} onClick={() => { setKeySearch(null); setKeySearchActive(true) }}>
                <Search size={11} /><Keyboard size={12} />
                {keySearch ? formatBinding(keySearch) : t('keybindings.searchByKeys')}
              </Button>
            )}
          <Button size="sm" title={t('keybindings.exportKeys')} onClick={() => void exportKeys()}><Download size={12} /></Button>
          <Button size="sm" title={t('keybindings.importKeys')} onClick={() => void importKeys()}><Upload size={12} /></Button>
        </div>
      }
      footer={
        <>
          <span className="text-[11.5px] text-subtle">{t('keybindings.count', { shown: visible.length, total: rows.length })}</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            disabled={counts.modified === 0}
            onClick={() => { if (confirm(t('keybindings.confirmResetAll'))) resetKeybindings() }}
          >
            <RotateCcw size={11} /> {t('keybindings.resetAll')}
          </Button>
        </>
      }
    >
      <div className="px-5 py-4">
        {/* Presets */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-fg">{t('keybindings.preset')}</span>
            <span className="text-[11.5px] text-subtle">{t('keybindings.presetHint')}</span>
          </div>
          <div className="lm-stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PRESETS.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  setPreset(entry.id)
                  notify(t('keybindings.presetApplied', { preset: entry.name }), 'info')
                }}
                className={[
                  'lm-transition lm-lift lm-press rounded-lumen border px-3 py-2.5 text-left',
                  preset === entry.id ? 'border-accent bg-accent/10' : 'border-edge hover:border-edge-strong hover:bg-hover',
                ].join(' ')}
              >
                <div className={`text-[12.5px] font-medium ${preset === entry.id ? 'text-accent' : 'text-fg'}`}>{entry.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-subtle">
                  {formatBinding(presetBindings(entry.id)['search.everywhere']?.[0] ?? presetBindings(entry.id)['view.commandPalette']?.[0] ?? '')}
                </div>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 && <Empty icon={<Keyboard size={24} strokeWidth={1.4} />} title={t('common.nothingFound')} />}

        {[...groups.entries()].map(([category, list]) => (
          <section key={category} className="mb-3">
            <h4 className="sticky top-0 z-10 mb-1 bg-overlay/95 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle backdrop-blur">
              {category}
            </h4>
            <div className="overflow-hidden rounded-lumen border border-edge">
              {list.map((row) => {
                const recording = recordingFor?.id === row.command.id
                return (
                  <div
                    key={row.command.id}
                    className="lm-transition group flex min-h-[34px] items-center gap-3 border-b border-edge/60 px-3 py-1 last:border-b-0 hover:bg-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-fg" title={row.command.id}>{row.command.title}</div>
                    </div>

                    <div className="flex min-w-[220px] flex-wrap items-center justify-end gap-1">
                      {row.bindings.map((binding) => (
                        recording && recordingFor?.replace === binding
                          ? null
                          : (
                            <button
                              key={binding}
                              onDoubleClick={() => setRecordingFor({ id: row.command.id, replace: binding })}
                              title={t('keybindings.change')}
                            >
                              <KeyChip
                                binding={binding}
                                conflicts={row.conflicts[binding] ?? []}
                                removeLabel={t('keybindings.remove')}
                                onRemove={() => setKeybinding(row.command.id, row.bindings.filter((b) => b !== binding))}
                              />
                            </button>
                          )
                      ))}
                      {!row.bindings.length && !recording && (
                        <span className="text-[11px] text-subtle">{t('keybindings.notBound')}</span>
                      )}
                      {recording && (
                        <Recorder
                          onDone={(binding) => { applyBinding(row.command.id, binding, recordingFor?.replace); setRecordingFor(null) }}
                          onCancel={() => setRecordingFor(null)}
                        />
                      )}
                    </div>

                    <span className={`w-[64px] shrink-0 text-right text-[10.5px] ${row.modified ? 'text-accent' : 'text-subtle'}`}>
                      {t(`keybindings.source.${row.source}`)}
                    </span>

                    <div className="flex w-[52px] shrink-0 justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="sm" title={t('keybindings.add')} onClick={() => setRecordingFor({ id: row.command.id })}>
                        <Plus size={12} />
                      </Button>
                      {row.modified && (
                        <Button size="sm" title={t('keybindings.reset')} onClick={() => setKeybinding(row.command.id, null)}>
                          <RotateCcw size={11} />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </DialogShell>
  )
}

function sourceOf(modified: boolean, inPreset: boolean, bound: boolean): 'user' | 'preset' | 'addon' | 'none' {
  if (modified) return 'user'
  if (inPreset) return 'preset'
  if (bound) return 'addon'
  return 'none'
}
