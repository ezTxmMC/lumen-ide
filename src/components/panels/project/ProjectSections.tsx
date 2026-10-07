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
import { ChevronRight, Plus, FileCode2, Package, Boxes } from 'lucide-react';
import { useStore } from '@/state/store';
import { tr, useT } from '@/i18n';
import { Button } from '../../ui';
import type { ProjectModule } from '@/core/types';
import { tasksOfModule, useGradleTasks } from '@/lib/project/gradle-tasks';
import type { Project } from './project-types';
import { TaskRow } from './ProjectTasks';

export function Collapsible({ title, count, children, defaultOpen = true, action }: {
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

export function FactsSection({ project }: { project: Project; }) {
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

export function DependenciesSection({ project }: { project: Project; }) {
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
export function ModulesSection({ project }: { project: Project; }) {
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
