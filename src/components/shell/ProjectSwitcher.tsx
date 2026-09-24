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
 * The project switcher in the title bar: the current project's name, and a
 * dropdown with the recent projects (searchable), “Open Folder…”, “New
 * Project…” and “New Window”. Picking a project goes through
 * `openProject` — this window, a new one, or the question which.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Check, ChevronDown, FolderGit2, FolderOpen, FolderPlus, Search } from 'lucide-react';
import { useStore, type RecentProject } from '@/state/store';
import { useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import { openFolderAsProject, openProject, useProjectSwitcher } from '@/lib/open-project';
import { LAYER } from '../ui/layers';
import { OpenProjectChoice } from './OpenProjectChoice';
import { useMissingFolders } from './useMissingFolders';

const closeSwitcher = () => useProjectSwitcher.setState({ open: false });

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function matches(project: RecentProject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${project.name} ${project.path}`.toLowerCase().includes(needle);
}

export function ProjectSwitcher() {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const project = useStore((s) => s.project);
  const open = useProjectSwitcher((s) => s.open);
  const button = useRef<HTMLButtonElement>(null);

  const label = project?.name ?? (workspace ? baseName(workspace) : t('projectSwitcher.noProject'));

  return (
    <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        ref={button}
        onClick={() => useProjectSwitcher.setState({ open: !open })}
        title={t('projectSwitcher.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-project-switcher=""
        className={[
          'lm-transition lm-press flex h-6 max-w-[220px] items-center gap-1.5 rounded-lumen-sm border px-2 text-[11.5px]',
          open ? 'border-edge-strong bg-hover text-fg' : 'border-edge text-muted hover:border-edge-strong hover:bg-hover hover:text-fg',
        ].join(' ')}
      >
        <FolderGit2 size={12} className="shrink-0 opacity-80" />
        <span className="truncate">{label}</span>
        <ChevronDown size={11} className="shrink-0 opacity-70" />
      </button>
      {open && <SwitcherPopup anchor={button.current} onClose={closeSwitcher} />}
      <OpenProjectChoice />
    </div>
  );
}

/** Where the popup sits: under its button, or centred under the title bar when opened by command. */
function usePopupPosition(anchor: HTMLElement | null, panel: React.RefObject<HTMLDivElement>) {
  const [position, setPosition] = useState<{ left: number; top: number; }>({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
    const width = panel.current?.offsetWidth ?? 380;
    const left = rect ? rect.left : (window.innerWidth - width) / 2;
    setPosition({ left: Math.max(6, Math.min(left, window.innerWidth - width - 6)), top: (rect?.bottom ?? 36) + 4 });
  }, [anchor, panel]);
  return position;
}

/** A click beside the popup, or the window losing focus, closes it. */
function useOutsideClose(panel: React.RefObject<HTMLDivElement>, onClose: () => void) {
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (panel.current?.contains(target)) {
        return;
      }
      if (target?.closest('[data-project-switcher]')) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', onPointer, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, panel]);
}

function SwitcherEntries({ list, index, workspace, missing, onHover, onChoose }: {
  list: RecentProject[];
  index: number;
  workspace: string | null;
  missing: Set<string>;
  onHover(index: number): void;
  onChoose(entry: RecentProject): void;
}) {
  const t = useT();
  return (
      <>
    {list.map((entry, i) => {
      const current = entry.path === workspace;
      const gone = missing.has(entry.path);
      return (
        <button
          key={entry.path}
          data-project-path={entry.path}
          onMouseEnter={() => onHover(i)}
          onClick={() => onChoose(entry)}
          disabled={gone}
          title={gone ? t('projectSwitcher.missing') : entry.path}
          className={[
            'lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1.5 text-left disabled:opacity-40',
            i === index ? 'bg-hover text-fg' : 'text-muted',
          ].join(' ')}
        >
          <span className="w-3 shrink-0 text-accent">{current && <Check size={12} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px]">{entry.name}</span>
            <span className="block truncate font-mono text-[10px] text-subtle">{entry.path}</span>
          </span>
          {current && <span className="shrink-0 text-[10.5px] text-subtle">{t('projectSwitcher.current')}</span>}
        </button>
      );
    })}
      </>
  );
}

function SwitcherActions({ onRun }: { onRun(fn: () => void): () => void; }) {
  const t = useT();
  const actions = [
    { icon: FolderOpen, label: t('projectSwitcher.openFolder'), keys: formatBindingsFor('file.open'), run: () => void openFolderAsProject() },
    { icon: FolderPlus, label: t('projectSwitcher.newProject'), keys: formatBindingsFor('project.new'), run: () => useStore.getState().setNewProjectOpen(true) },
    { icon: AppWindow, label: t('projectSwitcher.newWindow'), keys: formatBindingsFor('window.new'), run: () => void window.lumen.window.openProject() },
  ];

  return (
    <div className="border-t border-edge p-1">
      {actions.map(({ icon: Icon, label, keys, run: action }) => (
        <button
          key={label}
          onClick={onRun(action)}
          className="lm-transition flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1 text-left text-[12.5px] text-muted hover:bg-hover hover:text-fg"
        >
          <Icon size={12} className="shrink-0 opacity-80" />
          <span className="flex-1 truncate">{label}</span>
          {keys && <span className="shrink-0 text-[10.5px] text-subtle">{keys}</span>}
        </button>
      ))}
    </div>
  );
}

function SwitcherPopup({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void; }) {
  const t = useT();
  const recent = useStore((s) => s.recentProjects);
  const workspace = useStore((s) => s.workspace);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const position = usePopupPosition(anchor, panel);

  useEffect(() => { input.current?.focus(); }, []);

  const missing = useMissingFolders(recent);

  useOutsideClose(panel, onClose);

  const list = useMemo(
    () => [...recent].sort((a, b) => b.openedAt - a.openedAt).filter((entry) => matches(entry, query)),
    [recent, query],
  );
  const index = Math.min(selected, Math.max(0, list.length - 1));

  const choose = (entry: RecentProject | undefined) => {
    if (!entry || missing.has(entry.path)) {
      return;
    }
    onClose();
    void openProject(entry.path);
  };
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const onKey = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setSelected(Math.min(index + 1, list.length - 1)),
      ArrowUp: () => setSelected(Math.max(index - 1, 0)),
      Enter: () => choose(list[index]),
      Escape: onClose,
    };
    const handler = keys[event.key];
    if (!handler) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={t('projectSwitcher.title')}
      data-project-switcher-popup=""
      onKeyDown={onKey}
      className={`lm-glass lm-shadow lm-anim-pop fixed ${LAYER.menu} flex w-[min(400px,calc(100vw-12px))] flex-col overflow-hidden rounded-lumen border border-edge`}
      style={{ left: position.left, top: position.top, maxHeight: 'min(520px, calc(100vh - 60px))' }}
    >
      <label className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
        <Search size={13} className="shrink-0 text-subtle" />
        <input
          ref={input}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          placeholder={t('projectSwitcher.search')}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-subtle"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">{t('projectSwitcher.recent')}</div>
        {!list.length && (
          <p className="px-2 py-3 text-[12px] text-subtle">
            {query.trim() ? t('projectSwitcher.noMatch', { query: query.trim() }) : t('projectSwitcher.empty')}
          </p>
        )}
        <SwitcherEntries list={list} index={index} workspace={workspace} missing={missing} onHover={setSelected} onChoose={choose} />
      </div>

      <SwitcherActions onRun={run} />
    </div>,
    document.body,
  );
}
