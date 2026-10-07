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
import { Hammer, Play, FlaskConical, Eraser, Wrench, Star, Plus, Trash2, SquareTerminal } from 'lucide-react';
import { useStore } from '@/state/store';
import { runTask } from '@/lib/project/run';
import { tr, useT } from '@/i18n';
import { Button } from '../../ui';
import type { ProjectTask, TaskGroup } from '@/core/types';
import { Collapsible } from './ProjectSections';
import type { Project, Config } from './project-types';
import { TaskForm } from './CustomTasks';

/** Quote an argument for the shell when it holds spaces or special characters. */
function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./${}-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** `label` is a translation key. */
export const GROUPS: { id: TaskGroup; label: string; icon: typeof Hammer; }[] = [
  { id: 'build', label: 'project.groups.build', icon: Hammer },
  { id: 'run', label: 'project.groups.run', icon: Play },
  { id: 'test', label: 'project.groups.test', icon: FlaskConical },
  { id: 'clean', label: 'project.groups.clean', icon: Eraser },
  { id: 'other', label: 'project.groups.other', icon: Wrench },
];

export function TasksSection({ workspace, project, config, readonly = false }: { workspace: string; project: Project | null; config: Config; /** Another folder of a workspace: its detected tasks only, no defaults or custom ones. */ readonly?: boolean; }) {
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

/** One runnable task: run on click, “run in terminal” and extra actions on hover. */
export function TaskRow({ task, root, badge, marker, actions, hint }: {
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

/** Categories Lumen names itself; the others are Gradle groups or plugin prefixes as written. */
const CATEGORY_KEYS: Record<string, string> = {
  '': 'project.custom.uncategorised',
  custom: 'project.custom.scripts',
  profiles: 'project.custom.profiles',
};

export function categoryLabel(category: string, t: (key: string) => string): string {
  const key = CATEGORY_KEYS[category];
  if (key) {
    return t(key);
  }
  return category;
}

export function QuickAction({ icon: Icon, label, hint, task, running, root }: {
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
