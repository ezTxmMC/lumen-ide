/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The project screen — what Lumen shows while no project is open: at start
 * (unless “open last project on start” is on), and after a project closes.
 *
 * Recent projects with a filter (Enter opens the first hit, ↑/↓ choose),
 * workspaces, the ways to begin (new project, open folder), and the switch that
 * skips this screen next time.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Blocks, FolderOpen, FolderPlus, Layers, Search, Settings, SquarePen, X,
} from 'lucide-react';
import { useStore, type RecentProject } from '@/state/store';
import type { WorkspaceDef } from '@/state/types';
import { getLanguage, useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import { Kbd, Toggle } from '../ui';
import { useMissingFolders } from './useMissingFolders';

const MINUTE = 60_000;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * MINUTE], ['month', 30 * 24 * 60 * MINUTE], ['week', 7 * 24 * 60 * MINUTE],
  ['day', 24 * 60 * MINUTE], ['hour', 60 * MINUTE], ['minute', MINUTE],
];

/** “3 hours ago” in the interface language. */
function relativeTime(at: number): string {
  const format = new Intl.RelativeTimeFormat(getLanguage(), { numeric: 'auto' });
  const diff = at - Date.now();
  const unit = UNITS.find(([, size]) => Math.abs(diff) >= size);
  if (!unit) {
    return format.format(0, 'minute');
  }
  return format.format(Math.round(diff / unit[1]), unit[0]);
}

function matches(project: RecentProject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${project.name} ${project.path} ${project.kind ?? ''}`.toLowerCase().includes(needle);
}

function StartActions({ reopen, onContinue }: { reopen: boolean; onContinue(): void; }) {
  const t = useT();
  const store = () => useStore.getState();
  const actions = [
    { icon: FolderPlus, label: t('welcome.newProject'), keys: formatBindingsFor('project.new'), run: () => store().setNewProjectOpen(true), primary: true },
    { icon: FolderOpen, label: t('welcome.openFolder'), keys: formatBindingsFor('file.open'), run: () => void store().openFolder() },
    { icon: Layers, label: t('welcome.screen.workspaces'), keys: null, run: () => store().openDialog('workspaces') },
    { icon: Blocks, label: t('welcome.addons'), keys: formatBindingsFor('view.addons'), run: () => store().openDialog('extensions') },
    { icon: Settings, label: t('shell.dialog.settings'), keys: formatBindingsFor('view.settings'), run: () => store().openDialog('settings') },
  ];

  return (
    <aside className="flex w-[240px] shrink-0 flex-col">
      <h1 className="lm-glow-text text-[34px] font-light tracking-tight text-fg">Lumen</h1>
      <p className="mb-6 text-[12px] text-subtle">{t('welcome.tagline')}</p>

      <div className="lm-stagger space-y-0.5">
        {actions.map(({ icon: Icon, label, keys, run, primary }) => (
          <button
            key={label}
            onClick={run}
            className={[
              'lm-transition lm-press flex w-full items-center gap-3 rounded-lumen px-3 py-2 text-left',
              primary ? 'bg-accent text-accent-fg hover:opacity-90' : 'text-muted hover:bg-hover hover:text-fg',
            ].join(' ')}
          >
            <Icon size={15} className="shrink-0 opacity-90" />
            <span className="flex-1 text-[13px]">{label}</span>
            {keys && !primary && <Kbd>{keys}</Kbd>}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <Toggle
          label={t('settings.general.reopenLastProject')}
          hint={t('welcome.screen.reopenHint')}
          checked={reopen}
          onChange={(value) => store().setEffects({ reopenLastProject: value })}
        />
        <button onClick={onContinue} className="lm-transition mt-2 flex items-center gap-1.5 text-[11.5px] text-subtle hover:text-fg">
          <SquarePen size={11} /> {t('welcome.screen.continueWithout')}
        </button>
      </div>
    </aside>
  );
}

function WorkspaceTiles({ workspaces }: { workspaces: WorkspaceDef[]; }) {
  const t = useT();
  return (
    <div className="mb-4">
      <Heading>{t('welcome.screen.workspaces')}</Heading>
      <div className="grid grid-cols-2 gap-1.5">
        {[...workspaces].sort((a, b) => b.openedAt - a.openedAt).slice(0, 4).map((ws) => (
          <button
            key={ws.id}
            onClick={() => void useStore.getState().openWorkspace(ws.id)}
            className="lm-transition lm-press relative flex items-center gap-2 overflow-hidden rounded-lumen-sm border border-edge px-3 py-2 text-left hover:bg-hover"
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
  );
}

function RecentList({ list, index, missing, onHover, onOpen }: {
  list: RecentProject[];
  index: number;
  missing: Set<string>;
  onHover(index: number): void;
  onOpen(project: RecentProject): void;
}) {
  const t = useT();
  return (
    <div className="lm-stagger space-y-0.5">
      {list.map((project, i) => {
        const gone = missing.has(project.path);
        return (
          <div
            key={project.path}
            onMouseEnter={() => onHover(i)}
            className={`group flex items-center gap-1 rounded-lumen-sm ${i === index ? 'bg-hover' : ''}`}
          >
            <button
              onClick={() => onOpen(project)}
              disabled={gone}
              title={gone ? t('welcome.screen.missing', { path: project.path }) : project.path}
              className="lm-transition flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:opacity-45"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono text-[11px] font-bold"
                style={{ color: project.color ?? 'var(--c-text-subtle)' }}
              >
                {project.icon ?? project.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] text-fg">{project.name}</span>
                  {project.kind && <span className="shrink-0 text-[10.5px] text-subtle">{project.kind}</span>}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-subtle">{project.path}</span>
              </span>
              <span className="shrink-0 text-[10.5px] text-subtle">{gone ? t('welcome.screen.gone') : relativeTime(project.openedAt)}</span>
            </button>
            <button
              onClick={() => useStore.getState().removeRecent(project.path)}
              title={t('welcome.removeRecent')}
              className="lm-transition mr-1 hidden rounded p-1 text-subtle group-hover:block hover:text-bad"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectScreen({ onContinue }: { onContinue: () => void; }) {
  const t = useT();
  const recent = useStore((s) => s.recentProjects);
  const workspaces = useStore((s) => s.workspaces);
  const reopen = useStore((s) => s.effects.reopenLastProject);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const missing = useMissingFolders(recent);

  const list = useMemo(() => [...recent].sort((a, b) => b.openedAt - a.openedAt).filter((project) => matches(project, query)), [recent, query]);
  const index = Math.min(selected, Math.max(0, list.length - 1));
  const store = () => useStore.getState();
  const open = (project: RecentProject | undefined) => {
    if (!project || missing.has(project.path)) {
      return;
    }
    void store().setWorkspace(project.path);
  };

  const onKey = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setSelected(Math.min(list.length - 1, index + 1)),
      ArrowUp: () => setSelected(Math.max(0, index - 1)),
      Enter: () => open(list[index]),
    };
    const handler = keys[event.key];
    if (!handler) {
      return;
    }
    event.preventDefault();
    handler();
  };

  return (
    <div className="lm-anim-fade flex min-h-0 flex-1 overflow-auto bg-bg">
      <div className="m-auto flex w-full max-w-[920px] flex-wrap gap-10 p-8">
        <StartActions reopen={reopen} onContinue={onContinue} />

        <section className="flex min-w-[320px] flex-1 flex-col">
          <label className="mb-3 flex items-center gap-2 rounded-lumen border border-edge bg-input px-3 py-2 focus-within:border-accent">
            <Search size={14} className="shrink-0 text-subtle" />
            <input
              ref={input}
              value={query}
              placeholder={t('welcome.screen.search')}
              spellCheck={false}
              onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
              onKeyDown={onKey}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>

          {workspaces.length > 0 && !query && <WorkspaceTiles workspaces={workspaces} />}

          <Heading>{t('welcome.recentProjects')}</Heading>
          {list.length === 0 && (
            <div className="rounded-lumen border border-dashed border-edge px-4 py-8 text-center">
              <p className="text-[12.5px] text-muted">{t(query ? 'welcome.screen.noMatch' : 'welcome.screen.empty')}</p>
              {!query && <p className="mt-1 text-[11.5px] text-subtle">{t('welcome.screen.emptyHint')}</p>}
            </div>
          )}
          <RecentList list={list} index={index} missing={missing} onHover={setSelected} onOpen={open} />
        </section>
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode; }) {
  return <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{children}</div>;
}
