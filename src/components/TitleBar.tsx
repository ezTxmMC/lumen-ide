import { useEffect, useState } from 'react'
import {
  Minus, Square, Copy, X, FolderOpen, FolderPlus, Save, Play, Square as StopIcon,
  PanelLeft, TerminalSquare, Command, Hammer, FlaskConical, Search, SquareTerminal,
  ChevronDown, Layers, FolderInput, Settings2, Check,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { runDefault, stopRun, defaultTask } from '@/lib/run'
import { useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { Button } from './ui'
import { ContextMenu, type MenuItem } from './ui/ContextMenu'

/** A label with the command's shortcut, when it has one. */
function withKeys(label: string, commandId: string) {
  const keys = formatBindingsFor(commandId)
  if (!keys) return label
  return `${label} (${keys})`
}

export function TitleBar() {
  const t = useT()
  const [maximized, setMaximized] = useState(false)
  const platform = useStore((s) => s.platform)
  const workspace = useStore((s) => s.workspace)
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const running = useStore((s) => s.runningId !== null)
  const runningLabel = useStore((s) => s.runningLabel)
  const sidebarView = useStore((s) => s.sidebarView)
  const panelOpen = useStore((s) => s.panelOpen)
  const panelTab = useStore((s) => s.panelTab)

  const openFolder = useStore((s) => s.openFolder)
  const saveTab = useStore((s) => s.saveTab)
  const setSidebarView = useStore((s) => s.setSidebarView)
  const togglePanel = useStore((s) => s.togglePanel)
  const setPalette = useStore((s) => s.setPalette)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)

  useEffect(() => {
    void window.lumen.window.isMaximized().then(setMaximized)
    return window.lumen.window.onState((s) => {
      if (typeof s.maximized === 'boolean') setMaximized(s.maximized)
    })
  }, [])

  const projectName = project?.name ?? workspace?.split(/[\\/]/).filter(Boolean).pop()
  const title = [tab?.name, projectName, 'Lumen'].filter(Boolean).join(' — ')
  const isMac = platform === 'darwin'
  // Depends on the project and its configuration — values for the label only.
  void config
  const build = defaultTask('build')
  const run = defaultTask('run')
  const test = defaultTask('test')

  return (
    <header
      className="lm-transition flex h-9 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {isMac && <div className="w-16 shrink-0" />}

      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Button
          onClick={() => setSidebarView(sidebarView ? null : 'explorer')}
          title={withKeys(t('titlebar.toggleSidebar'), 'view.sidebar')}
          size="sm"
        >
          <PanelLeft size={14} />
        </Button>
        <Button onClick={() => void openFolder()} title={withKeys(t('titlebar.openFolder'), 'file.open')} size="sm">
          <FolderOpen size={14} />
        </Button>
        <Button onClick={() => setNewProjectOpen(true)} title={withKeys(t('titlebar.newProject'), 'project.new')} size="sm">
          <FolderPlus size={14} />
        </Button>
        <Button
          onClick={() => void saveTab()}
          title={withKeys(t('common.save'), 'file.save')}
          size="sm"
          disabled={!tab || tab.readonly}
        >
          <Save size={14} />
        </Button>

        <span className="mx-1 h-4 w-px bg-edge" />

        {running ? (
          <Button onClick={stopRun} title={t('titlebar.stop', { label: runningLabel ?? '' })} size="sm" variant="danger">
            <StopIcon size={13} className="fill-current" />
          </Button>
        ) : (
          <>
            <Button
              onClick={() => runDefault('build')}
              title={build ? withKeys(t('titlebar.build', { label: build.label }), 'project.build') : t('titlebar.noBuild')}
              size="sm"
              disabled={!build}
            >
              <Hammer size={14} />
            </Button>
            <Button
              onClick={() => runDefault('run')}
              title={withKeys(run ? t('titlebar.run', { label: run.label }) : t('titlebar.runFile'), 'project.run')}
              size="sm"
            >
              <Play size={14} />
            </Button>
            <Button
              onClick={() => runDefault('test')}
              title={test ? withKeys(t('titlebar.test', { label: test.label }), 'project.test') : t('titlebar.noTest')}
              size="sm"
              disabled={!test}
            >
              <FlaskConical size={14} />
            </Button>
          </>
        )}
        <Button
          onClick={() => useStore.getState().showPanel('terminal')}
          title={withKeys(t('titlebar.terminal'), 'terminal.toggle')}
          size="sm"
          className={panelOpen && panelTab === 'terminal' ? 'text-accent' : ''}
        >
          <SquareTerminal size={14} />
        </Button>
        <Button
          onClick={() => togglePanel()}
          title={withKeys(t('titlebar.togglePanel'), 'view.panel')}
          size="sm"
          className={panelOpen ? 'text-accent' : ''}
        >
          <TerminalSquare size={14} />
        </Button>
      </div>

      <WorkspaceSwitcher />

      <div className="flex flex-1 items-center justify-center overflow-hidden px-2">
        <button
          onClick={() => setPalette('commands')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="lm-transition group flex h-6 max-w-[440px] min-w-0 flex-1 items-center gap-2 rounded-lumen-sm border border-transparent px-2 text-[12px] text-subtle hover:border-edge hover:bg-hover"
          title={withKeys(t('titlebar.commandPalette'), 'view.commandPalette')}
        >
          <Command size={11} className="shrink-0 opacity-60" />
          <span className="truncate">{title}</span>
        </button>
        <button
          onClick={() => useStore.getState().openEverywhere('all')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="lm-transition ml-1 flex h-6 shrink-0 items-center gap-1 rounded-lumen-sm px-1.5 text-[11px] text-subtle hover:bg-hover hover:text-fg"
          title={withKeys(t('titlebar.searchEverywhere'), 'search.everywhere')}
        >
          <Search size={12} />
          <span className="font-mono text-[10px] opacity-70">⇧⇧</span>
        </button>
      </div>

      {!isMac && (
        <div
          className="flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <WindowButton onClick={() => void window.lumen.window.minimize()} label={t('titlebar.minimize')}>
            <Minus size={13} />
          </WindowButton>
          <WindowButton
            onClick={() => void window.lumen.window.toggleMaximize()}
            label={t(maximized ? 'titlebar.restore' : 'titlebar.maximize')}
          >
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </WindowButton>
          <WindowButton
            onClick={() => void window.lumen.window.close()}
            label={t('common.close')}
            danger
          >
            <X size={14} />
          </WindowButton>
        </div>
      )}
    </header>
  )
}

function WindowButton({
  children, onClick, label, danger,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'lm-transition flex h-7 w-10 items-center justify-center rounded-lumen-sm text-muted',
        danger ? 'hover:bg-bad hover:text-white' : 'hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** The workspace switcher in the title bar. */
function WorkspaceSwitcher() {
  const t = useT()
  const workspace = useStore((s) => s.workspace)
  const workspaces = useStore((s) => s.workspaces)
  const current = useStore((s) => s.workspaces.find((w) => w.id === s.currentWorkspaceId) ?? null)
  const extraCount = useStore((s) => s.extraFolders.length)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  if (!workspace && !workspaces.length) return null

  const s = useStore.getState()
  const label = current?.name ?? workspace?.split(/[\\/]/).filter(Boolean).pop() ?? t('workspaces.none')

  const items: MenuItem[] = [
    ...[...workspaces].sort((a, b) => b.openedAt - a.openedAt).slice(0, 10).map<MenuItem>((ws) => ({
      label: ws.name,
      icon: ws.id === current?.id ? Check : Layers,
      hint: t('workspaces.folders', { count: ws.folders.length }),
      run: () => void s.openWorkspace(ws.id),
    })),
    ...(workspaces.length ? ['sep' as const] : []),
    { label: t('workspaces.addFolder'), icon: FolderInput, disabled: !workspace, run: () => void s.addFolderToWorkspace() },
    { label: t('workspaces.new'), icon: Layers, disabled: !workspace, run: () => { s.saveWorkspace(workspace?.split(/[\\/]/).filter(Boolean).pop()) } },
    { label: t('workspaces.manage'), icon: Settings2, run: () => s.openDialog('workspaces') },
  ]

  return (
    <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.left, y: rect.bottom + 4 })
        }}
        title={t('workspaces.switcher')}
        className="lm-transition lm-press flex h-6 max-w-[220px] items-center gap-1.5 rounded-lumen-sm border border-edge px-2 text-[11.5px] text-muted hover:border-edge-strong hover:bg-hover hover:text-fg"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: current?.color ?? 'var(--c-text-subtle)' }} />
        <span className="truncate">{label}</span>
        {extraCount > 0 && <span className="shrink-0 text-[10px] text-subtle">+{extraCount}</span>}
        <ChevronDown size={11} className="shrink-0 opacity-70" />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
