/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  ChevronRight, FolderOpen, FolderPlus, Hammer, Play, FlaskConical, Eraser, Wrench,
  RefreshCw, Loader2, Star, Plus, Trash2, FileCode2, Square, Zap, ZapOff, Download,
  ExternalLink, RotateCw, X, Package, SquareTerminal, Boxes, ListChecks, Search,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { runTask, stopRun, installServer, defaultTask } from '@/lib/run';
import { statusTone } from '@/lib/status';
import { tr, useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import { Button, Empty } from '../ui';
import type { ProjectModule, ProjectTask, TaskGroup } from '@/core/types';
import { sortedByName } from './Explorer';
import { minecraftIcon } from '@/lib/minecraft-icon';
import { EMPTY_PROJECT_CONFIG } from '@/core/project/config';
import { loadGradleTasks, rootTasks, tasksOfModule, useGradleTasks } from '@/lib/gradle-tasks';

/** Quote an argument for the shell when it holds spaces or special characters. */
function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./${}-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** `label` is a translation key. */
const GROUPS: { id: TaskGroup; label: string; icon: typeof Hammer; }[] = [
  { id: 'build', label: 'project.groups.build', icon: Hammer },
  { id: 'run', label: 'project.groups.run', icon: Play },
  { id: 'test', label: 'project.groups.test', icon: FlaskConical },
  { id: 'clean', label: 'project.groups.clean', icon: Eraser },
  { id: 'other', label: 'project.groups.other', icon: Wrench },
];

function Collapsible({ title, count, children, defaultOpen = true, action }: {
  title: string;
  count?: number | string;
  children: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
  );
}

type StoreState = ReturnType<typeof useStore.getState>;
type Project = NonNullable<StoreState['project']>;
type Config = StoreState['projectConfig'];

function NoProjectView() {
  const t = useT();
  const recent = useStore((s) => s.recentProjects);
  const openFolder = useStore((s) => s.openFolder);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const removeRecent = useStore((s) => s.removeRecent);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
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
  );
}

function ProjectHeader({ workspace, project, loading, primary: isPrimaryFolder = true, collapsed, onToggle }: {
  workspace: string;
  project: Project | null;
  loading: boolean;
  /** The open project (the default tasks are its own); the other folders of a workspace use their first task per group. */
  primary?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const t = useT();
  const running = useStore((s) => s.runningId !== null);
  const runningLabel = useStore((s) => s.runningLabel);
  const refresh = useStore((s) => s.refreshProject);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  const openFile = useStore((s) => s.openFile);
  const primary = project?.primary;
  const pick = (group: 'build' | 'run' | 'test') => (isPrimaryFolder ? defaultTask(group) : project?.tasks.find((task) => task.group === group) ?? null);
  const build = pick('build');
  const run = pick('run');
  const test = pick('test');
  const image = minecraftIcon(project);

  const openBuildFile = () => {
    const file = project?.meta.buildFile ?? primary?.markers[0];
    if (file) {
      void openFile(`${workspace}/${file}`);
    }
  };

  return (
    <div className="border-b border-edge px-3 py-2.5">
      <div className="flex items-start gap-2">
        {onToggle && (
          <button onClick={onToggle} className="mt-2 shrink-0 text-subtle hover:text-fg" aria-expanded={!collapsed}>
            <ChevronRight size={13} className="lm-transition" style={{ transform: collapsed ? 'none' : 'rotate(90deg)' }} />
          </button>
        )}
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono text-[11px] font-bold"
          style={{ color: primary?.kind.color ?? 'var(--c-accent)' }}
          title={primary ? tr(primary.kind.name) : t('project.noBuildSystem')}
        >
          {image ? <img src={image} width={20} height={20} alt="" draggable={false} /> : (primary?.kind.icon ?? '·')}
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
        <QuickAction icon={Hammer} label={t('project.groups.build')} hint={isPrimaryFolder ? formatBindingsFor('project.build') : undefined} task={build} running={running} root={workspace} />
        <QuickAction icon={Play} label={t('project.groups.run')} hint={isPrimaryFolder ? formatBindingsFor('project.run') : undefined} task={run} running={running} root={workspace} />
        <QuickAction icon={FlaskConical} label={t('project.groups.test')} hint={isPrimaryFolder ? formatBindingsFor('project.test') : undefined} task={test} running={running} root={workspace} />
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
  );
}

function TasksSection({ workspace, project, config, readonly = false }: { workspace: string; project: Project | null; config: Config; /** Another folder of a workspace: its detected tasks only, no defaults or custom ones. */ readonly?: boolean; }) {
  const t = useT();
  const updateConfig = useStore((s) => s.updateProjectConfig);
  const notify = useStore((s) => s.notify);
  const [adding, setAdding] = useState(false);
  const allTasks = useMemo(
    () => [...config.tasks, ...(project?.tasks ?? [])],
    [config.tasks, project?.tasks],
  );

  const setDefault = (group: 'build' | 'run' | 'test', id: string) => {
    void updateConfig({ defaults: { ...config.defaults, [group]: id } });
    notify(t('project.defaultSet', { group: t(GROUPS.find((g) => g.id === group)?.label ?? '') }), 'info');
  };

  const removeCustom = (id: string) => {
    void updateConfig({ tasks: config.tasks.filter((t) => t.id !== id) });
  };

  return (
    <Collapsible
      title={t('project.tasks')}
      count={allTasks.length}
      action={readonly ? undefined : (
        <Button size="sm" title={t('project.customTask')} onClick={() => setAdding((v) => !v)}>
          <Plus size={12} />
        </Button>
      )}
    >
      {adding && (
        <TaskForm
          onCancel={() => setAdding(false)}
          onSave={(task) => {
            void updateConfig({ tasks: [...config.tasks.filter((t) => t.id !== task.id), task] });
            setAdding(false);
          }}
        />
      )}
      {allTasks.length === 0 && !adding && (
        <p className="px-1 py-2 text-[11.5px] leading-relaxed text-subtle">
          {t('project.noTasks')}
        </p>
      )}
      {GROUPS.map(({ id, label, icon: Icon }) => {
        const tasks = allTasks.filter((t) => (t.group ?? 'other') === id);
        if (!tasks.length) {
          return null;
        }
        return (
          <div key={id} className="mb-1.5">
            <div className="flex items-center gap-1 px-1 py-0.5 text-[10.5px] text-subtle">
              <Icon size={10} /> {t(label)}
            </div>
            {tasks.map((task) => {
              const custom = config.tasks.some((t) => t.id === task.id);
              const isDefault = (id === 'build' || id === 'run' || id === 'test') && config.defaults[id] === task.id;
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  root={project?.root ?? workspace}
                  badge={custom ? t('project.customBadge') : undefined}
                  marker={isDefault ? <Star size={10} className="shrink-0 fill-current text-warn group-hover:hidden" /> : undefined}
                  actions={readonly ? undefined : (
                    <>
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
                    </>
                  )}
                />
              );
            })}
          </div>
        );
      })}
    </Collapsible>
  );
}

function FactsSection({ project }: { project: Project; }) {
  const t = useT();
  if (!Object.keys(project.meta.facts ?? {}).length && !project.meta.sourceRoots?.length) {
    return null;
  }
  return (
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
  );
}

function DependenciesSection({ project }: { project: Project; }) {
  const t = useT();
  const openDependencyDialog = useStore((s) => s.openDependencyDialog);
  if (!project.meta.dependencies?.length && !project.kinds.some((k) => k.kind.dependencies)) {
    return null;
  }
  return (
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
  );
}

/** The modules of a multi-module build (from the parent pom's `<modules>`, or Gradle's includes), as a tree. */
function ModulesSection({ project }: { project: Project; }) {
  const t = useT();
  if (project.modules.length === 0) {
    return null;
  }
  return (
    <Collapsible title={t('project.modules.title')} count={countModules(project.modules)}>
      <div className="space-y-px">
        {project.modules.map((module) => (
          <ModuleNode key={module.id} module={module} root={project.root} depth={0} />
        ))}
      </div>
    </Collapsible>
  );
}

/** One project of a workspace: its header (with the fold), and its tasks while unfolded. */
function WorkspaceProject({ folder, project, primary, loading, config }: {
  folder: string;
  project: Project | null;
  primary: boolean;
  loading: boolean;
  config: Config;
}) {
  const [collapsed, setCollapsed] = useState(!primary);
  return (
    <div className="border-b border-edge">
      <ProjectHeader workspace={folder} project={project} loading={loading} primary={primary} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      {!collapsed && <TasksSection workspace={folder} project={project} config={config} readonly={!primary} />}
      {!collapsed && project && <ModulesSection project={project} />}
    </div>
  );
}

export function ProjectPanel() {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const project = useStore((s) => s.project);
  const extraFolders = useStore((s) => s.extraFolders);
  const extraProjects = useStore((s) => s.extraProjects);
  const loading = useStore((s) => s.projectLoading);
  const config = useStore((s) => s.projectConfig);
  const updateConfig = useStore((s) => s.updateProjectConfig);

  if (!workspace) {
    return <NoProjectView />;
  }

  // The sentence around the file name, which is inserted as a button.
  const configNote = t('project.configNote').split('{file}');

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {extraFolders.length > 0 && sortedByName([workspace, ...extraFolders]).map((folder) => (
        <WorkspaceProject
          key={folder}
          folder={folder}
          project={folder === workspace ? project : extraProjects[folder] ?? null}
          primary={folder === workspace}
          loading={loading}
          config={folder === workspace ? config : EMPTY_PROJECT_CONFIG}
        />
      ))}

      {extraFolders.length === 0 && (
        <>
          <ProjectHeader workspace={workspace} project={project} loading={loading} />
          <TasksSection workspace={workspace} project={project} config={config} />
        </>
      )}

      {/* Modules */}
      {extraFolders.length === 0 && project && <ModulesSection project={project} />}

      {/* Custom and discovered tasks */}
      {project && <CustomTasks />}

      {/* Language-Server */}
      <LanguageServers />

      {extraFolders.length === 0 && project && <FactsSection project={project} />}

      {extraFolders.length === 0 && project && <DependenciesSection project={project} />}

      {/* Umgebung */}
      <Collapsible title={t('project.environment')} count={Object.keys(config.env).length || undefined} defaultOpen={Object.keys(config.env).length > 0}>
        <EnvEditor env={config.env} onChange={(env) => void updateConfig({ env })} />
      </Collapsible>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-subtle">
        {configNote[0]}
        <button className="text-muted hover:text-fg" onClick={() => void useStore.getState().openProjectConfig()}>
          project.json
        </button>
        {configNote[1]}
      </p>
    </div>
  );
}

/** One runnable task: run on click, “run in terminal” and extra actions on hover. */
function TaskRow({ task, root, badge, marker, actions, hint }: {
  task: ProjectTask;
  root: string;
  badge?: string;
  marker?: ReactNode;
  actions?: ReactNode;
  /** Shown dimmed after the label (a module path, a group). */
  hint?: string;
}) {
  const t = useT();
  const running = useStore((s) => s.runningId !== null);
  const openTerminal = useStore((s) => s.openTerminal);
  const runInTerminal = () => void openTerminal({
    cwd: task.cwd ? `${root}/${task.cwd}` : undefined,
    command: [task.command, ...task.args.map(shellQuote)].join(' '),
    title: tr(task.label),
  });
  return (
    <div
      className="lm-row lm-transition group text-[12.5px] text-muted hover:bg-hover hover:text-fg"
      title={task.detail ? tr(task.detail) : `${task.command} ${task.args.join(' ')}`}
    >
      <button
        onClick={() => void runTask(task, undefined, root)}
        disabled={running}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:opacity-50"
      >
        <Play size={10} className="shrink-0 opacity-60" />
        <span className="truncate">{tr(task.label)}</span>
        {hint && <span className="min-w-0 shrink truncate font-mono text-[10px] text-subtle">{hint}</span>}
        {badge && <span className="shrink-0 text-[9.5px] text-subtle">{badge}</span>}
      </button>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <button
          title={t('project.runInTerminal')}
          onClick={runInTerminal}
          className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
        >
          <SquareTerminal size={11} />
        </button>
        {actions}
      </span>
      {marker}
    </div>
  );
}

function countModules(modules: ProjectModule[]): number {
  return modules.reduce((sum, module) => sum + 1 + countModules(module.modules ?? []), 0);
}

/** Module kinds with a translated name; any other kind (`jar`, `war`) shows as written. */
const MODULE_KINDS = new Set([
  'pom', 'application', 'library', 'spring-boot', 'quarkus', 'minecraft-mod', 'android-app', 'android-library',
  'platform', 'jvm', 'container', 'missing',
]);

function moduleKindLabel(kind: string, t: (key: string) => string): string {
  if (!MODULE_KINDS.has(kind)) {
    return kind;
  }
  return t(`project.modules.kinds.${kind}`);
}

/** A module and, when expanded, its tasks and its own modules. */
function ModuleNode({ module, root, depth }: { module: ProjectModule; root: string; depth: number; }) {
  const t = useT();
  const openFile = useStore((s) => s.openFile);
  const [open, setOpen] = useState(false);
  const children = module.modules ?? [];
  // Tasks from `gradle tasks --all` that the build files do not show (plugins, dependencies, convention plugins).
  const loaded = useGradleTasks(root);
  const all = useMemo(() => {
    const known = new Set(module.tasks.map((task) => task.args[task.args.length - 1].split(':').pop()));
    return [...module.tasks, ...tasksOfModule(loaded, module.id).filter((task) => !known.has(task.label))];
  }, [module, loaded]);
  const standard = all.filter((task) => !task.category);
  const custom = all.filter((task) => task.category);
  return (
    <div>
      <div className="lm-row lm-transition group text-[12.5px] text-muted hover:bg-hover hover:text-fg" style={{ paddingLeft: depth * 12 }}>
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={module.path}>
          <ChevronRight size={11} className="lm-transition shrink-0" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
          <Boxes size={11} className="shrink-0 text-accent opacity-80" />
          <span className="truncate text-fg">{module.name}</span>
          {module.path !== module.name && <span className="min-w-0 truncate font-mono text-[10px] text-subtle">{module.path}</span>}
          {module.kind && (
            <span className={`ml-auto shrink-0 rounded-full border border-edge px-1.5 text-[9.5px] ${module.kind === 'missing' ? 'text-bad' : 'text-subtle'}`}>
              {moduleKindLabel(module.kind, t)}
            </span>
          )}
        </button>
        {module.buildFile && (
          <span className="hidden shrink-0 items-center group-hover:flex">
            <button
              title={t('project.openBuildFile')}
              onClick={() => void openFile(`${root}/${module.buildFile}`)}
              className="lm-transition rounded p-0.5 text-subtle hover:text-fg"
            >
              <FileCode2 size={11} />
            </button>
          </span>
        )}
      </div>
      {open && (
        <div style={{ paddingLeft: depth * 12 + 14 }}>
          {!all.length && !children.length && (
            <p className="px-1 py-0.5 text-[11px] text-subtle">{t('project.modules.noTasks')}</p>
          )}
          {standard.map((task) => <TaskRow key={task.id} task={task} root={root} />)}
          {custom.length > 0 && (
            <div className="px-1 pt-1 pb-0.5 text-[10px] text-subtle">{t('project.custom.title')}</div>
          )}
          {custom.map((task) => <TaskRow key={task.id} task={task} root={root} hint={task.category} />)}
          {children.map((child) => <ModuleNode key={child.id} module={child} root={root} depth={0} />)}
        </div>
      )}
    </div>
  );
}

/** How many tasks may show before the rest waits for a filter. */
const CUSTOM_TASK_LIMIT = 200;
/** From this many tasks on, a filter box appears. */
const FILTER_FROM = 8;

type GradleLoad = ReturnType<typeof useGradleTasks>;

/** The custom tasks of the project, the ones matching the filter, and those grouped by category. */
function useCustomTaskGroups(project: Project | null, loaded: GradleLoad, filter: string) {
  const tasks = useMemo(() => {
    const own = project?.customTasks ?? [];
    const known = new Set(own.map((task) => task.args[task.args.length - 1]));
    // With modules, their tasks sit in the module tree; this list keeps the root project's.
    const fetched = project?.modules.length ? rootTasks(loaded) : loaded?.tasks ?? [];
    const all = fetched.filter((task) => !known.has(task.label));
    return [...own, ...all];
  }, [project?.customTasks, project?.modules.length, loaded]);

  const needle = filter.trim().toLowerCase();
  const matching = useMemo(() => {
    if (!needle) {
      return tasks;
    }
    return tasks.filter((task) => `${tr(task.label)} ${task.category ?? ''} ${task.detail ?? ''}`.toLowerCase().includes(needle));
  }, [tasks, needle]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, ProjectTask[]>();
    for (const task of matching.slice(0, CUSTOM_TASK_LIMIT)) {
      const key = task.category ?? '';
      byCategory.set(key, [...(byCategory.get(key) ?? []), task]);
    }
    return [...byCategory.entries()];
  }, [matching]);

  return { tasks, matching, groups, needle };
}

function TaskFilter({ value, onChange }: { value: string; onChange(value: string): void; }) {
  const t = useT();
  return (
    <div className="mb-1.5 flex items-center gap-1 rounded-lumen-sm border border-edge bg-input px-1.5">
      <Search size={11} className="shrink-0 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('project.custom.filter')}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-[11.5px] outline-none"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-subtle hover:text-fg" title={t('project.custom.clearFilter')}>
          <X size={10} />
        </button>
      )}
    </div>
  );
}

/**
 * Tasks found in the build files beyond the standard ones — Gradle tasks
 * registered in the scripts, Maven plugin goals and profiles — plus, on
 * request, every task `gradle tasks --all` reports, grouped by task group.
 */
function CustomTasks() {
  const t = useT();
  const project = useStore((s) => s.project);
  const env = useStore((s) => s.projectConfig.env);
  const [filter, setFilter] = useState('');
  const loaded = useGradleTasks(project?.root);
  const gradle = project?.kinds.find((k) => k.kind.id === 'gradle' || k.kind.id.endsWith('.gradle'));
  const gradleCommand = gradle?.tasks[0]?.command ?? 'gradle';

  const { tasks, matching, groups, needle } = useCustomTaskGroups(project, loaded, filter);

  if (!project) {
    return null;
  }
  if (!gradle && !tasks.length) {
    return null;
  }

  const errorText = () => {
    if (!loaded?.error) {
      return null;
    }
    if (loaded.error === 'timeout') {
      return t('project.custom.timeout');
    }
    return t('project.custom.failed', { error: loaded.error });
  };

  return (
    <Collapsible
      title={t('project.custom.title')}
      count={tasks.length || undefined}
      defaultOpen={tasks.length > 0}
      action={gradle ? (
        <Button
          size="sm"
          title={t('project.custom.loadGradle')}
          disabled={loaded?.loading}
          onClick={() => void loadGradleTasks(project.root, gradleCommand, env)}
        >
          {loaded?.loading ? <Loader2 size={12} className="lm-anim-spin" /> : <ListChecks size={12} />}
        </Button>
      ) : undefined}
    >
      {tasks.length >= FILTER_FROM && <TaskFilter value={filter} onChange={setFilter} />}
      {loaded?.loading && (
        <p className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-subtle">
          <Loader2 size={10} className="lm-anim-spin" /> {t('project.custom.loading')}
        </p>
      )}
      {errorText() && <p className="px-1 py-1 text-[11px] leading-snug text-bad">{errorText()}</p>}
      {!tasks.length && !loaded?.loading && (
        <p className="px-1 py-1 text-[11.5px] leading-relaxed text-subtle">{t('project.custom.none')}</p>
      )}
      {needle && !matching.length && (
        <p className="px-1 py-1 text-[11.5px] text-subtle">{t('project.custom.noMatch')}</p>
      )}
      {groups.map(([category, list]) => (
        <div key={category || '-'} className="mb-1.5">
          <div className="flex items-center gap-1 px-1 py-0.5 text-[10.5px] text-subtle">
            <Wrench size={10} /> {categoryLabel(category, t)}
            <span className="ml-auto text-[9.5px]">{list.length}</span>
          </div>
          {list.map((task) => <TaskRow key={task.id} task={task} root={project.root} />)}
        </div>
      ))}
      {matching.length > CUSTOM_TASK_LIMIT && (
        <p className="px-1 text-[11px] text-subtle">{t('project.custom.more', { count: matching.length - CUSTOM_TASK_LIMIT })}</p>
      )}
    </Collapsible>
  );
}

/** Categories Lumen names itself; the others are Gradle groups or plugin prefixes as written. */
const CATEGORY_KEYS: Record<string, string> = {
  '': 'project.custom.uncategorised',
  custom: 'project.custom.scripts',
  profiles: 'project.custom.profiles',
};

function categoryLabel(category: string, t: (key: string) => string): string {
  const key = CATEGORY_KEYS[category];
  if (key) {
    return t(key);
  }
  return category;
}

function QuickAction({ icon: Icon, label, hint, task, running, root }: {
  root?: string;
  icon: typeof Hammer;
  label: string;
  hint: string | undefined;
  task: ProjectTask | null;
  running: boolean;
}) {
  const t = useT();
  const taskTitle = () => {
    if (!task) {
      return t('project.quickNoTask', { action: label });
    }
    const text = t('project.quickTask', { action: label, task: tr(task.label) });
    if (!hint) {
      return text;
    }
    return `${text} (${hint})`;
  };
  return (
    <Button
      size="sm"
      variant={task ? 'outline' : 'ghost'}
      disabled={!task || running}
      onClick={() => task && void runTask(task, undefined, root)}
      title={taskTitle()}
    >
      <Icon size={12} /> {label}
    </Button>
  );
}

function TaskForm({ onSave, onCancel }: { onSave: (task: ProjectTask) => void; onCancel: () => void; }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [group, setGroup] = useState<TaskGroup>('build');

  const submit = () => {
    const trimmed = command.trim();
    if (!label.trim() || !trimmed) {
      return;
    }
    const [cmd, ...args] = trimmed.match(/"[^"]*"|'[^']*'|\S+/g)?.map((a) => a.replace(/^["']|["']$/g, '')) ?? [];
    if (!cmd) {
      return;
    }
    onSave({
      id: `custom:${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: label.trim(),
      command: cmd,
      args,
      group,
    });
  };

  const field = 'w-full rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12px] outline-none focus:border-accent';
  return (
    <div className="mb-2 space-y-1.5 rounded-lumen border border-edge p-2">
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('project.taskLabel')} className={field} />
      <input
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder={t('project.commandPlaceholder')}
        className={`${field} font-mono`}
        onKeyDown={(e) => { if (e.key === 'Enter') {
          submit();
        } if (e.key === 'Escape') {
          onCancel();
        } }}
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
  );
}

function EnvEditor({ env, onChange }: { env: Record<string, string>; onChange: (env: Record<string, string>) => void; }) {
  const t = useT();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const field = 'rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[11.5px] outline-none focus:border-accent';
  const add = () => {
    const k = key.trim();
    if (!k) {
      return;
    }
    onChange({ ...env, [k]: value });
    setKey('');
    setValue('');
  };
  return (
    <div className="space-y-1">
      {Object.entries(env).map(([k, v]) => (
        <div key={k} className="group flex items-center gap-1 text-[11.5px]">
          <span className="shrink-0 font-mono text-muted">{k}</span>
          <span className="text-subtle">=</span>
          <span className="min-w-0 flex-1 truncate font-mono text-subtle" title={v}>{v}</span>
          <button onClick={() => { const next = { ...env }; delete next[k]; onChange(next); }} className="lm-transition hidden rounded p-0.5 text-subtle group-hover:block hover:text-bad" title={t('common.remove')}>
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
  );
}

const STATE_LABEL = new Set(['idle', 'checking', 'starting', 'ready', 'unavailable', 'failed', 'stopped']);

function LanguageServers() {
  const t = useT();
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const registryVersion = useStore((s) => s.registryVersion);
  const lspVersion = useStore((s) => s.lspVersion);
  const setPreferred = useStore((s) => s.setPreferredLsp);
  const showPanel = useStore((s) => s.showPanel);
  const tabs = useStore((s) => s.tabs);

  const languages = useMemo(() => {
    const ids = new Set<string>(project?.languages ?? []);
    for (const t of tabs) {
      if (t.languageId) {
        ids.add(t.languageId);
      }
    }
    return registry.languages().filter((l) => ids.has(l.id) && l.lsp?.length);
  }, [project?.languages, tabs, registryVersion]);

  const servers = useMemo(() => lsp.list(), [lspVersion]);

  if (!languages.length) {
    return null;
  }

  return (
    <Collapsible title={t('panels.tabs.lsp')} count={languages.length}>
      <div className="space-y-1.5">
        {languages.map((language) => {
          const status = lsp.status(language);
          const entry = servers.find((s) => language.lsp!.some((c) => c.command === s.config.command));
          const preferred = config.lsp[language.id] ?? '';
          const chosen = language.lsp!.find((c) => c.label === (entry?.label ?? preferred)) ?? language.lsp![0];
          const ready = status.status === 'ready';
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
          );
        })}
      </div>
    </Collapsible>
  );
}
