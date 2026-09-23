import { Blocks, Command, FolderOpen, FolderPlus, Layers, Palette, Sparkles, X } from 'lucide-react'
import { useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { useStore } from '@/state/store'
import { Kbd } from '../ui'

export function Welcome() {
  const openFolder = useStore((s) => s.openFolder)
  const newFile = useStore((s) => s.newFile)
  const setPalette = useStore((s) => s.setPalette)
  const openDialog = useStore((s) => s.openDialog)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  const recent = useStore((s) => s.recentProjects)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const removeRecent = useStore((s) => s.removeRecent)
  const workspace = useStore((s) => s.workspace)
  const workspaces = useStore((s) => s.workspaces)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const t = useT()

  const actions = [
    { icon: FolderPlus, label: t('welcome.newProject'), keys: formatBindingsFor('project.new'), run: () => setNewProjectOpen(true) },
    { icon: FolderOpen, label: t('welcome.openFolder'), keys: formatBindingsFor('file.open'), run: () => void openFolder() },
    { icon: Sparkles, label: t('welcome.newFile'), keys: formatBindingsFor('file.new'), run: newFile },
    { icon: Command, label: t('welcome.commandPalette'), keys: formatBindingsFor('view.commandPalette'), run: () => setPalette('commands') },
    { icon: Palette, label: t('welcome.themes'), keys: formatBindingsFor('view.themes'), run: () => openDialog('themes') },
    { icon: Blocks, label: t('welcome.addons'), keys: formatBindingsFor('view.addons'), run: () => openDialog('extensions', 'installed') },
  ]

  return (
    <div className="lm-anim-fade flex h-full items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex items-baseline gap-3">
          <h1 className="lm-glow-text text-[34px] font-light tracking-tight text-fg">Lumen</h1>
          <span className="text-[12px] text-subtle">{t('welcome.tagline')}</span>
        </div>

        <div className="lm-stagger space-y-0.5">
          {actions.map(({ icon: Icon, label, keys, run }) => (
            <button
              key={label}
              onClick={run}
              className="lm-transition lm-lift lm-press flex w-full items-center gap-3 rounded-lumen px-3 py-2 text-left hover:bg-hover"
            >
              <Icon size={15} className="shrink-0 text-accent opacity-80" />
              <span className="flex-1 text-[13px] text-muted">{label}</span>
              {keys && <Kbd>{keys}</Kbd>}
            </button>
          ))}
        </div>

        {workspaces.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {t('shell.dialog.workspaces')}
            </div>
            <div className="lm-stagger grid grid-cols-2 gap-1.5">
              {[...workspaces].sort((a, b) => b.openedAt - a.openedAt).slice(0, 4).map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => void openWorkspace(ws.id)}
                  className="lm-transition lm-lift lm-press relative flex items-center gap-2 overflow-hidden rounded-lumen-sm border border-edge px-3 py-2 text-left hover:bg-hover"
                  title={ws.folders.join('\n')}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: ws.color }} />
                  <Layers size={13} className="shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{ws.name}</span>
                  <span className="shrink-0 text-[10.5px] text-subtle">{t('workspaces.folders', { count: ws.folders.length })}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {t('welcome.recentProjects')}
            </div>
            <div className="lm-stagger space-y-0.5">
              {recent.slice(0, 6).map((p) => (
                <div key={p.path} className="group flex items-center gap-1">
                  <button
                    onClick={() => void setWorkspace(p.path)}
                    className="lm-transition flex min-w-0 flex-1 items-center gap-2.5 rounded-lumen-sm px-3 py-1.5 text-left hover:bg-hover"
                    title={p.path}
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded bg-active font-mono text-[9.5px] font-bold"
                      style={{ color: p.color ?? 'var(--c-text-subtle)' }}
                    >
                      {p.icon ?? '·'}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-muted">{p.name}</span>
                    {p.kind && <span className="shrink-0 text-[10.5px] text-subtle">{p.kind}</span>}
                    <span className="truncate text-[11px] text-subtle">{p.path}</span>
                    {p.path === workspace && <span className="shrink-0 text-[10px] text-accent">{t('welcome.opened')}</span>}
                  </button>
                  <button
                    onClick={() => removeRecent(p.path)}
                    title={t('welcome.removeRecent')}
                    className="lm-transition hidden rounded p-1 text-subtle group-hover:block hover:text-bad"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
