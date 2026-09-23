import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ExternalLink, Eraser, Plus, SquareTerminal, Trash2, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { terminals } from '@/lib/terminals'
import { useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { Button, Empty } from '../ui'
import { ContextMenu, menuBelow, type MenuItem } from '../ui/ContextMenu'
import { windowOf } from '@/hooks/useOwner'

export function useTerminals() {
  useSyncExternalStore(terminals.subscribe.bind(terminals), terminals.getVersion)
  return { sessions: terminals.list(), activeId: terminals.activeId, shells: terminals.shells, externals: terminals.externals }
}

/** The toolbar in the panel header: sessions, a new shell, open externally. */
export function TerminalToolbar() {
  const t = useT()
  const { sessions, activeId, shells, externals } = useTerminals()
  const openTerminal = useStore((s) => s.openTerminal)
  const openExternalTerminal = useStore((s) => s.openExternalTerminal)
  const [menu, setMenu] = useState<{ kind: 'shells' | 'external'; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => { void terminals.start() }, [])

  const menuItems = (kind: 'shells' | 'external'): MenuItem[] => {
    if (kind === 'shells') {
      const header: MenuItem = { header: t('panels.terminal.newWith') }
      if (!shells.length) return [header, { label: t('panels.terminal.noShell'), disabled: true, run: () => {} }]
      return [header, ...shells.map<MenuItem>((shell) => ({
        label: shell.isDefault ? `${shell.label} (${t('common.default')})` : shell.label,
        icon: SquareTerminal,
        detail: shell.path,
        run: () => void openTerminal({ shell: shell.path }),
      }))]
    }
    const header: MenuItem = { header: t('panels.terminal.external') }
    if (!externals.length) return [header, { label: t('panels.terminal.noExternal'), disabled: true, run: () => {} }]
    return [header, ...externals.map<MenuItem>((ext) => ({
      label: ext.label,
      icon: ExternalLink,
      detail: ext.command,
      run: () => void openExternalTerminal(undefined, ext.id),
    }))]
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {sessions.map((session, i) => (
          <div
            key={session.id}
            className={[
              'lm-transition group flex h-6 shrink-0 items-center gap-1 rounded-lumen-sm pl-2 pr-1 text-[11.5px]',
              session.id === activeId ? 'bg-active text-fg' : 'text-subtle hover:bg-hover hover:text-muted',
            ].join(' ')}
            onClick={() => { terminals.setActive(session.id); terminals.focus(session.id) }}
            onDoubleClick={() => setRenaming(session.id)}
            title={`${session.shell}${session.pid ? ` · PID ${session.pid}` : ''}\n${session.cwd}\n${t('panels.terminal.doubleClickRename')}`}
          >
            <SquareTerminal size={11} className={session.exitCode === null ? 'text-ok' : 'text-subtle'} />
            {renaming === session.id ? (
              <input
                autoFocus
                defaultValue={session.title}
                className="w-24 rounded-sm border border-accent bg-input px-1 text-[11px] outline-none"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { terminals.rename(session.id, e.target.value); setRenaming(null) }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="max-w-[140px] truncate">{i + 1}: {session.title}</span>
            )}
            <button
              title={t('panels.terminal.close')}
              onClick={(e) => { e.stopPropagation(); terminals.close(session.id) }}
              className="lm-transition rounded p-0.5 opacity-0 hover:text-bad group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center">
        <Button size="sm" title={withKeys(t('panels.terminal.new'), 'terminal.new')} onClick={() => void openTerminal()}>
          <Plus size={12} />
        </Button>
        <span onClick={(e) => setMenu({ kind: 'shells', ...menuBelow(e.currentTarget) })}>
          <Button size="sm" title={t('panels.terminal.chooseShell')}>
            <ChevronDown size={11} />
          </Button>
        </span>
        <span onClick={(e) => setMenu({ kind: 'external', ...menuBelow(e.currentTarget) })}>
          <Button size="sm" title={t('explorer.openInExternalTerminal')}>
            <ExternalLink size={12} />
          </Button>
        </span>
        <Button size="sm" title={t('panels.terminal.clear')} onClick={() => terminals.clear(activeId)} disabled={!activeId}>
          <Eraser size={12} />
        </Button>
        <Button size="sm" title={t('panels.terminal.kill')} onClick={() => activeId && terminals.close(activeId)} disabled={!activeId}>
          <Trash2 size={12} />
        </Button>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.kind)} onClose={() => setMenu(null)} />}
      </div>
    </div>
  )
}

/** A title with its shortcut, when the command has one. */
function withKeys(label: string, command: string) {
  const keys = formatBindingsFor(command)
  if (!keys) return label
  return `${label} (${keys})`
}

/** The contents: the active xterm, which survives switching. */
export function TerminalPanel() {
  const t = useT()
  const { sessions, activeId } = useTerminals()
  const host = useRef<HTMLDivElement>(null)
  const themeId = useStore((s) => s.themeId)
  const effects = useStore((s) => s.effects)
  const registryVersion = useStore((s) => s.registryVersion)
  const openTerminal = useStore((s) => s.openTerminal)

  const theme = useMemo(
    () => registry.themes().find((entry) => entry.id === themeId) ?? registry.themes()[0],
    [themeId, registryVersion],
  )

  useEffect(() => {
    if (theme) terminals.configure(theme, effects)
  }, [theme, effects])

  // On a first open with no session, start a shell straight away (as IntelliJ does).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || terminals.list().length > 0 || terminals.pending > 0) return
    started.current = true
    void openTerminal()
  }, [openTerminal])

  useEffect(() => {
    if (!host.current || !activeId) return
    terminals.attach(activeId, host.current)
    terminals.focus(activeId)
  }, [activeId, sessions.length])

  useEffect(() => {
    if (!host.current) return
    // The observer of the window the terminal is in: it may be a pop-out's.
    const observer = new (windowOf(host.current).ResizeObserver)(() => terminals.fit(terminals.activeId))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { terminals.fit(activeId) }, [activeId])

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full overflow-hidden bg-surface px-2 pt-1" />
      {!sessions.length && (
        <div className="absolute inset-0">
          <Empty
            icon={<SquareTerminal size={22} strokeWidth={1.4} />}
            title={t('panels.terminal.empty')}
            hint={t('panels.terminal.emptyHint', { keys: formatBindingsFor('terminal.new') ?? '—' })}
          />
        </div>
      )}
    </div>
  )
}
