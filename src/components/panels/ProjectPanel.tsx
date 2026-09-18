import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronRight, FolderOpen, FolderPlus, Hammer, Play, FlaskConical, Eraser, Wrench,
  RefreshCw, Loader2, Star, Plus, Trash2, FileCode2, Square, Zap, ZapOff, Download,
  ExternalLink, RotateCw, X, Package, SquareTerminal,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { runTask, stopRun, installServer, defaultTask } from '@/lib/run'
import { statusTone } from '@/lib/status'
import { tr, useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { Button, Empty } from '../ui'
import type { ProjectTask, TaskGroup } from '@/core/types'

/** Quote an argument for the shell when it holds spaces or special characters. */
function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./${}-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

/** `label` is a translation key. */
const GROUPS: { id: TaskGroup; label: string; icon: typeof Hammer }[] = [
  { id: 'build', label: 'project.groups.build', icon: Hammer },
  { id: 'run', label: 'project.groups.run', icon: Play },
  { id: 'test', label: 'project.groups.test', icon: FlaskConical },
  { id: 'clean', label: 'project.groups.clean', icon: Eraser },
  { id: 'other', label: 'project.groups.other', icon: Wrench },
]

function Collapsible({ title, count, children, defaultOpen = true, action }: {
  title: string
  count?: number | string
  children: ReactNode
  defaultOpen?: boolean
  action?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-edge last:border-b-0">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle hover:text-muted"
        >
          <ChevronRight
            size={12}
            className="lm-transition shrink-0"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          />
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="ml-1 font-normal normal-case tracking-normal">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="px-2 pb-2">{children}</div>}
    </section>
  )
}

export function ProjectPanel() {
  const t = useT()
  const workspace = useStore((s) => s.workspace)
  const project = useStore((s) => s.project)
  const loading = useStore((s) => s.projectLoading)
  const config = useStore((s) => s.projectConfig)
  const running = useStore((s) => s.runningId !== null)
  const runningLabel = useStore((s) => s.runningLabel)
  const recent = useStore((s) => s.recentProjects)
  const openFolder = useStore((s) => s.openFolder)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const removeRecent = useStore((s) => s.removeRecent)
  const refresh = useStore((s) => s.refreshProject)
  const updateConfig = useStore((s) => s.updateProjectConfig)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  const openFile = useStore((s) => s.openFile)
  const notify = useStore((s) => s.notify)
  const openDependencyDialog = useStore((s) => s.openDependencyDialog)
  const openTerminal = useStore((s) => s.openTerminal)

  const [adding, setAdding] = useState(false)

  const allTasks = useMemo(
    () => [...config.tasks, ...(project?.tasks ?? [])],
    [config.tasks, project?.tasks],
  )

  if (!workspace) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <Empty
          icon={<FolderOpen size={26} strokeWidth={1.4} />}
          title={t('project.noProject')}
          hint={t('project.noProjectHint')}
        />
        <div className="flex flex-col gap-1.5 px-3">
          <Button variant="solid" onClick={() => setNewProjectOpen(true)} className="w-full">
            <FolderPlus size={13} /> {t('explorer.newProject')}
          </Button>
          <Button variant="outline" onClick={() => void openFolder()} className="w-full">
            <FolderOpen size={13} /> {t('explorer.openFolder')}
          </Button>
        </div>
        {recent.length > 0 && (
          <div className="mt-5 px-3">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {t('project.recentOpened')}
            </div>
            {recent.map((p) => (
              <div key={p.path} className="group flex items-center gap-1">
                <button
                  onClick={() => void setWorkspace(p.path)}
                  className="lm-transition flex min-w-0 flex-1 items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
                  title={p.path}
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded bg-active font-mono text-[9px] font-bold"
                    style={{ color: p.color ?? 'var(--c-text-subtle)' }}
                  >
                    {p.icon ?? '·'}
                  </span>
                  <span className="truncate">{p.name}</span>
                  {p.kind && <span className="shrink-0 text-[10px] text-subtle">{p.kind}</span>}
                </button>
                <button
                  onClick={() => removeRecent(p.path)}
                  title={t('project.removeFromList')}
                  className="lm-transition hidden rounded p-0.5 text-subtle group-hover:block hover:text-bad"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const primary = project?.primary
  const build = defaultTask('build')
  const run = defaultTask('run')
  const test = defaultTask('test')

  const openBuildFile = () => {
    const file = project?.meta.buildFile ?? primary?.markers[0]
    if (file) void openFile(`${workspace}/${file}`)
  }

  const setDefault = (group: 'build' | 'run' | 'test', id: string) => {
    void updateConfig({ defaults: { ...config.defaults, [group]: id } })
    notify(t('project.defaultSet', { group: t(GROUPS.find((g) => g.id === group)?.label ?? '') }), 'info')
  }

  // The sentence around the file name, which is inserted as a button.
  const configNote = t('project.configNote').split('{file}')

  const removeCustom = (id: string) => {
    void updateConfig({ tasks: config.tasks.filter((t) => t.id !== id) })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Kopf */}
      <div className="border-b border-edge px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono text-[11px] font-bold"
            style={{ color: primary?.kind.color ?? 'var(--c-accent)' }}
            title={primary ? tr(primary.kind.name) : t('project.noBuildSystem')}
          >
            {primary?.kind.icon ?? '·'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg" title={workspace}>
                {project?.name ?? workspace.split(/[\\/]/).filter(Boolean).pop()}
              </span>
              {project?.meta.version && (
                <span className="shrink-0 font-mono text-[10px] text-subtle">v{project.meta.version}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {loading && <Loader2 size={11} className="lm-anim-spin text-accent" />}
              {project?.kinds.map((k) => (
                <span
                  key={k.kind.id}
                  className="rounded-full border border-edge px-1.5 py-px text-[10px]"
                  style={{ color: k.kind.color }}
                  title={t('project.detectedVia', { markers: k.markers.join(', ') })}
                >
                  {tr(k.kind.name)}
                </span>
              ))}
              {project && project.kinds.length === 0 && !loading && (
                <span className="text-[11px] text-subtle">{t('project.noBuildSystemDetected')}</span>
              )}
            </div>
          </div>
        </div>
        {project?.meta.description && (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-subtle">{project.meta.description}</p>
        )}

        <div className="mt-2 flex items-center gap-1">
          <QuickAction icon={Hammer} label={t('project.groups.build')} hint={formatBindingsFor('project.build')} task={build} running={running} />
          <QuickAction icon={Play} label={t('project.groups.run')} hint={formatBindingsFor('project.run')} task={run} running={running} />
          <QuickAction icon={FlaskConical} label={t('project.groups.test')} hint={formatBindingsFor('project.test')} task={test} running={running} />
          <span className="flex-1" />
          {running ? (
            <Button size="sm" variant="danger" onClick={stopRun} title={t('project.cancelRun', { label: tr(runningLabel ?? '') })}>
              <Square size={11} className="fill-current" />
            </Button>
          ) : null}
          <Button size="sm" title={t('project.openBuildFile')} onClick={openBuildFile} disabled={!project?.meta.buildFile && !primary}>
            <FileCode2 size={13} />
          </Button>
          <Button size="sm" title={t('project.redetect')} onClick={() => void refresh()}>
            <RefreshCw size={13} className={loading ? 'lm-anim-spin' : ''} />
          </Button>
          <Button size="sm" title={t('explorer.newProject')} onClick={() => setNewProjectOpen(true)}>
            <FolderPlus size={13} />
          </Button>
        </div>
      </div>

      {/* Aufgaben */}
      <Collapsible
        title={t('project.tasks')}
        count={allTasks.length}
        action={
          <Button size="sm" title={t('project.customTask')} onClick={() => setAdding((v) => !v)}>
            <Plus size={12} />
          </Button>
        }
      >
        {adding && (
          <TaskForm
            onCancel={() => setAdding(false)}
            onSave={(task) => {
              void updateConfig({ tasks: [...config.tasks.filter((t) => t.id !== task.id), task] })
              setAdding(false)
            }}
          />
        )}
        {allTasks.length === 0 && !adding && (
          <p className="px-1 py-2 text-[11.5px] leading-relaxed text-subtle">
            {t('project.noTasks')}
          </p>
        )}
        {GROUPS.map(({ id, label, icon: Icon }) => {
          const tasks = allTasks.filter((t) => (t.group ?? 'other') === id)
          if (!tasks.length) return null
          return (
            <div key={id} className="mb-1.5">
              <div className="flex items-center gap-1 px-1 py-0.5 text-[10.5px] text-subtle">
                <Icon size={10} /> {t(label)}
              </div>
              {tasks.map((task) => {
                const custom = config.tasks.some((t) => t.id === task.id)
                const isDefault = (id === 'build' || id === 'run' || id === 'test') && config.defaults[id] === task.id
                return (
                  <div
                    key={task.id}
                    className="lm-row lm-transition group text-[12.5px] text-muted hover:bg-hover hover:text-fg"
                    title={task.detail ? tr(task.detail) : `${task.command} ${task.args.join(' ')}`}
                  >
                    <button
                      onClick={() => void runTask(task)}
                      disabled={running}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:opacity-50"
                    >
                      <Play size={10} className="shrink-0 opacity-60" />
                      <span className="truncate">{tr(task.label)}</span>
                      {custom && <span className="shrink-0 text-[9.5px] text-subtle">{t('project.customBadge')}</span>}
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button
                        title={t('project.runInTerminal')}
                        onClick={() => void openTerminal({ cwd: task.cwd ? `${project?.root ?? workspace}/${task.cwd}` : undefined, command: [task.command, ...task.args.map(shellQuote)].join(' '), title: tr(task.label) })}
                        className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
                      >
                        <SquareTerminal size={11} />
                      </button>
                      {(id === 'build' || id === 'run' || id === 'test') && (
                        <button
                          title={isDefault ? t('project.defaultTask') : t('project.setDefault')}
                          onClick={() => setDefault(id, task.id)}
                          className={`lm-transition rounded p-0.5 ${isDefault ? 'text-warn' : 'text-subtle hover:text-fg'}`}
                        >
                          <Star size={11} className={isDefault ? 'fill-current' : ''} />
                        </button>
                      )}
                      {custom && (
                        <button
                          title={t('common.delete')}
                          onClick={() => removeCustom(task.id)}
                          className="lm-transition rounded p-0.5 text-subtle hover:text-bad"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </span>
                    {isDefault && (
                      <Star size={10} className="shrink-0 fill-current text-warn group-hover:hidden" />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </Collapsible>

      {/* Language-Server */}
      <LanguageServers />

      {/* Fakten */}
      {project && (Object.keys(project.meta.facts ?? {}).length > 0 || project.meta.sourceRoots?.length) && (
        <Collapsible title={t('project.facts')}>
          <dl className="space-y-0.5 text-[12px]">
            {Object.entries(project.meta.facts ?? {}).map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-subtle">{tr(key)}</dt>
                <dd className="truncate text-right text-muted" title={value}>{value}</dd>
              </div>
            ))}
            {project.meta.sourceRoots?.length ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-subtle">{t('project.sourceRoots')}</dt>
                <dd className="truncate text-right font-mono text-[11px] text-muted" title={project.meta.sourceRoots.join('\n')}>
                  {project.meta.sourceRoots.join(' · ')}
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-subtle">{t('project.root')}</dt>
              <dd className="truncate text-right font-mono text-[11px] text-muted" title={project.root}>{project.root}</dd>
            </div>
          </dl>
        </Collapsible>
      )}

      {/* Abhängigkeiten */}
      {project && (project.meta.dependencies?.length || project.kinds.some((k) => k.kind.dependencies)) ? (
        <Collapsible
          title={t('project.dependencies')}
          count={project.meta.dependencies?.length ?? 0}
          defaultOpen={false}
          action={project.kinds.some((k) => k.kind.dependencies) ? (
            <Button size="sm" title={t('project.addDependency')} onClick={() => openDependencyDialog()}>
              <Plus size={12} />
            </Button>
          ) : undefined}
        >
          <div className="mb-1.5 flex flex-wrap gap-1 px-1">
            {project.kinds.filter((k) => k.kind.dependencies).map((k) => (
              <button
                key={k.kind.id}
                onClick={() => openDependencyDialog(k.kind.id)}
                className="lm-transition rounded-full border border-edge px-1.5 py-px text-[10px] text-muted hover:border-accent hover:text-fg"
                title={t('project.addVia', { manager: k.kind.dependencies!.manager })}
              >
                + {k.kind.dependencies!.manager}
              </button>
            ))}
          </div>
          <div className="space-y-px">
            {(project.meta.dependencies ?? []).slice(0, 120).map((d, i) => (
              <div key={`${d.name}-${i}`} className="flex items-baseline gap-2 px-1 text-[11.5px]" title={`${d.name}${d.version ? ` ${d.version}` : ''}${d.scope ? ` (${d.scope})` : ''}`}>
                <Package size={9} className="shrink-0 translate-y-px text-subtle" />
                <span className="min-w-0 flex-1 truncate font-mono text-muted">{d.name}</span>
                {d.version && <span className="shrink-0 font-mono text-[10px] text-subtle">{d.version}</span>}
                {d.scope && d.scope !== 'compile' && d.scope !== 'dependency' && (
                  <span className="shrink-0 text-[9.5px] text-subtle">{d.scope}</span>
                )}
              </div>
            ))}
            {(project.meta.dependencies?.length ?? 0) > 120 && (
              <div className="px-1 text-[11px] text-subtle">{t('project.moreDependencies', { count: project.meta.dependencies!.length - 120 })}</div>
            )}
            {!project.meta.dependencies?.length && (
              <div className="px-1 text-[11px] text-subtle">{t('project.noDependencies')}</div>
            )}
          </div>
        </Collapsible>
      ) : null}

      {/* Umgebung */}
      <Collapsible title={t('project.environment')} count={Object.keys(config.env).length || undefined} defaultOpen={Object.keys(config.env).length > 0}>
        <EnvEditor env={config.env} onChange={(env) => void updateConfig({ env })} />
      </Collapsible>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-subtle">
        {configNote[0]}
        <button className="text-muted hover:text-fg" onClick={() => void openFile(`${workspace}/.lumen/project.json`)}>
          .lumen/project.json
        </button>
        {configNote[1]}
      </p>
    </div>
  )
}

function QuickAction({ icon: Icon, label, hint, task, running }: {
  icon: typeof Hammer
  label: string
  hint: string | undefined
  task: ProjectTask | null
  running: boolean
}) {
  const t = useT()
  const taskTitle = () => {
    if (!task) return t('project.quickNoTask', { action: label })
    const text = t('project.quickTask', { action: label, task: tr(task.label) })
    if (!hint) return text
    return `${text} (${hint})`
  }
  return (
    <Button
      size="sm"
      variant={task ? 'outline' : 'ghost'}
      disabled={!task || running}
      onClick={() => task && void runTask(task)}
      title={taskTitle()}
    >
      <Icon size={12} /> {label}
    </Button>
  )
}

function TaskForm({ onSave, onCancel }: { onSave: (task: ProjectTask) => void; onCancel: () => void }) {
  const t = useT()
  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [group, setGroup] = useState<TaskGroup>('build')

  const submit = () => {
    const trimmed = command.trim()
    if (!label.trim() || !trimmed) return
    const [cmd, ...args] = trimmed.match(/"[^"]*"|'[^']*'|\S+/g)?.map((a) => a.replace(/^["']|["']$/g, '')) ?? []
    if (!cmd) return
    onSave({
      id: `custom:${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: label.trim(),
      command: cmd,
      args,
      group,
    })
  }

  const field = 'w-full rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12px] outline-none focus:border-accent'
  return (
    <div className="mb-2 space-y-1.5 rounded-lumen border border-edge p-2">
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('project.taskLabel')} className={field} />
      <input
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder={t('project.commandPlaceholder')}
        className={`${field} font-mono`}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
      />
      <div className="flex items-center gap-1.5">
        <select value={group} onChange={(e) => setGroup(e.target.value as TaskGroup)} className={`${field} w-auto flex-1`}>
          {GROUPS.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
        </select>
        <Button size="sm" variant="solid" onClick={submit}>{t('common.save')}</Button>
        <Button size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
      <p className="text-[10.5px] text-subtle">{t('project.placeholders', { vars: '${file} ${fileStem} ${projectRoot}' })}</p>
    </div>
  )
}

function EnvEditor({ env, onChange }: { env: Record<string, string>; onChange: (env: Record<string, string>) => void }) {
  const t = useT()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const field = 'rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[11.5px] outline-none focus:border-accent'
  const add = () => {
    const k = key.trim()
    if (!k) return
    onChange({ ...env, [k]: value })
    setKey('')
    setValue('')
  }
  return (
    <div className="space-y-1">
      {Object.entries(env).map(([k, v]) => (
        <div key={k} className="group flex items-center gap-1 text-[11.5px]">
          <span className="shrink-0 font-mono text-muted">{k}</span>
          <span className="text-subtle">=</span>
          <span className="min-w-0 flex-1 truncate font-mono text-subtle" title={v}>{v}</span>
          <button onClick={() => { const next = { ...env }; delete next[k]; onChange(next) }} className="lm-transition hidden rounded p-0.5 text-subtle group-hover:block hover:text-bad" title={t('common.remove')}>
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="NAME" className={`${field} w-24`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('project.value')} className={`${field} min-w-0 flex-1`} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" onClick={add} title={t('common.add')}><Plus size={11} /></Button>
      </div>
      <p className="text-[10.5px] text-subtle">{t('project.envNote')}</p>
    </div>
  )
}

const STATE_LABEL = new Set(['idle', 'checking', 'starting', 'ready', 'unavailable', 'failed', 'stopped'])

function LanguageServers() {
  const t = useT()
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const registryVersion = useStore((s) => s.registryVersion)
  const lspVersion = useStore((s) => s.lspVersion)
  const setPreferred = useStore((s) => s.setPreferredLsp)
  const showPanel = useStore((s) => s.showPanel)
  const tabs = useStore((s) => s.tabs)

  const languages = useMemo(() => {
    const ids = new Set<string>(project?.languages ?? [])
    for (const t of tabs) if (t.languageId) ids.add(t.languageId)
    return registry.languages().filter((l) => ids.has(l.id) && l.lsp?.length)
  }, [project?.languages, tabs, registryVersion])

  const servers = useMemo(() => lsp.list(), [lspVersion])

  if (!languages.length) return null

  return (
    <Collapsible title={t('panels.tabs.lsp')} count={languages.length}>
      <div className="space-y-1.5">
        {languages.map((language) => {
          const status = lsp.status(language)
          const entry = servers.find((s) => language.lsp!.some((c) => c.command === s.config.command))
          const preferred = config.lsp[language.id] ?? ''
          const chosen = language.lsp!.find((c) => c.label === (entry?.label ?? preferred)) ?? language.lsp![0]
          const ready = status.status === 'ready'
          return (
            <div key={language.id} className="rounded-lumen-sm border border-edge px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold" style={{ color: language.color }}>{language.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{language.name}</span>
                <span className={`flex items-center gap-1 text-[10.5px] ${statusTone(status.status)}`}>
                  {ready ? <Zap size={9} /> : <ZapOff size={9} />}
                  {STATE_LABEL.has(status.status) && t(`project.state.${status.status}`)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <select
                  value={preferred}
                  onChange={(e) => void setPreferred(language.id, e.target.value || null)}
                  className="min-w-0 flex-1 rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 text-[11px]"
                  title={t('project.preferredServer')}
                >
                  <option value="">{t('project.automaticWith', { label: language.lsp![0].label })}</option>
                  {language.lsp!.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
                {entry && (
                  <Button size="sm" title={t('project.restart')} onClick={() => void lsp.restartClient(entry.id).then(() => showPanel('lsp'))}>
                    <RotateCw size={11} />
                  </Button>
                )}
                {!entry && status.status === 'unavailable' && (
                  <Button size="sm" title={lsp.installHint(chosen) ? t('project.installNamed', { command: lsp.installHint(chosen)! }) : tr(chosen.install)} onClick={() => void installServer(chosen)}>
                    <Download size={11} />
                  </Button>
                )}
                {chosen.docs && (
                  <Button size="sm" title={t('project.docs')} onClick={() => void window.lumen.shell.openExternal(chosen.docs!)}>
                    <ExternalLink size={11} />
                  </Button>
                )}
              </div>
              {status.status === 'unavailable' && chosen.install && (
                <p className="mt-1 text-[10.5px] leading-snug text-subtle">{tr(chosen.install)}</p>
              )}
              {status.busy && <p className="mt-1 truncate text-[10.5px] text-accent">{status.busy}</p>}
            </div>
          )
        })}
      </div>
    </Collapsible>
  )
}
