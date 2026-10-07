/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useState } from 'react';
import { ChevronRight, FolderOpen, FolderPlus, Hammer, Play, FlaskConical, RefreshCw, Loader2, FileCode2, Square, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { stopRun, defaultTask } from '@/lib/project/run';
import { tr, useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import { Button, Empty } from '../../ui';
import { sortedByName } from '../explorer/folder-chain';
import { minecraftIcon } from '@/lib/files/minecraft-icon';
import { EMPTY_PROJECT_CONFIG } from '@/core/project/config';
import { Collapsible, FactsSection, DependenciesSection, ModulesSection } from './ProjectSections';
import type { Project, Config } from './project-types';
import { TasksSection, QuickAction } from './ProjectTasks';
import { CustomTasks, EnvEditor } from './CustomTasks';
import { LanguageServers } from './LanguageServers';
import { LanguageTools } from './LanguageTools';

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
      <LanguageTools />

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
