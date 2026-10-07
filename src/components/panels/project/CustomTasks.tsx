/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo, useState } from 'react';
import { Wrench, Loader2, Plus, Trash2, X, ListChecks, Search } from 'lucide-react';
import { useStore } from '@/state/store';
import { tr, useT } from '@/i18n';
import { Button } from '../../ui';
import type { ProjectTask, TaskGroup } from '@/core/types';
import { loadGradleTasks, rootTasks, useGradleTasks } from '@/lib/project/gradle-tasks';
import { GROUPS, TaskRow, categoryLabel } from './ProjectTasks';
import { Collapsible } from './ProjectSections';
import type { Project } from './project-types';

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
export function CustomTasks() {
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

export function TaskForm({ onSave, onCancel }: { onSave: (task: ProjectTask) => void; onCancel: () => void; }) {
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

export function EnvEditor({ env, onChange }: { env: Record<string, string>; onChange: (env: Record<string, string>) => void; }) {
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
