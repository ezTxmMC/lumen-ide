/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, File, Search, Terminal, Hash, AtSign, Play, Loader2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLastValue, usePresence } from '@/hooks/usePresence';
import { useCommands } from '@/hooks/useCommands';
import { highlightParts } from '@/lib/fuzzy';
import { IconGlyph } from '../icons/FileIcon';
import { lsp } from '@/core/lsp/manager';
import type { WorkspaceSymbol } from '@/core/lsp/protocol';
import { t, useLanguage } from '@/i18n';
import { Kbd } from '../ui';
import { buildRows, type ActiveMode, type Row } from './palette-rows';

/** Prefixes as in VS Code: `>` commands, `@` symbols, `#` workspace, `!` tasks. */
const PREFIXES: Record<string, ActiveMode> = {
  '>': 'commands', '@': 'symbols', '#': 'workspace-symbols', '!': 'tasks',
};

/** Placeholder keys per mode. */
const PLACEHOLDER: Record<ActiveMode, string> = {
  commands: 'palette.placeholder.commands',
  files: 'palette.placeholder.files',
  symbols: 'palette.placeholder.symbols',
  'workspace-symbols': 'palette.placeholder.workspaceSymbols',
  tasks: 'palette.placeholder.tasks',
};

const MODE_ICON: Record<ActiveMode, typeof Search> = {
  commands: Terminal,
  files: Search,
  symbols: AtSign,
  'workspace-symbols': Hash,
  tasks: Play,
};

function emptyMessage(
  mode: ActiveMode,
  ctx: { workspace: boolean; activePath: boolean; queryLength: number; busy: boolean; },
): string {
  if (mode === 'files' && !ctx.workspace) {
    return t('palette.empty.noFolder');
  }
  if (mode === 'symbols' && !ctx.activePath) {
    return t('palette.empty.noFile');
  }
  if (mode === 'symbols') {
    return t('palette.empty.noSymbols');
  }
  if (mode === 'workspace-symbols' && ctx.queryLength < 2) {
    return t('palette.empty.minTwo');
  }
  if (mode === 'workspace-symbols' && ctx.busy) {
    return t('palette.empty.searching');
  }
  if (mode === 'workspace-symbols') {
    return t('palette.empty.noWorkspaceHits');
  }
  if (mode === 'tasks') {
    return t('palette.empty.noTasks');
  }
  return t('palette.empty.noHits');
}

/** Language server symbols for the `#` mode, debounced. */
function useWorkspaceSymbols(mode: ActiveMode | false, query: string) {
  const [wsSymbols, setWsSymbols] = useState<(WorkspaceSymbol & { server: string; })[]>([]);
  const [wsBusy, setWsBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'workspace-symbols') {
      return;
    }
    const needle = query.trim();
    if (needle.length < 2) { setWsSymbols([]); return; }
    let cancelled = false;
    setWsBusy(true);
    const timer = setTimeout(() => {
      lsp.workspaceSymbols(needle)
        .then((list) => { if (!cancelled) {
          setWsSymbols(list);
        } })
        .catch(() => { if (!cancelled) {
          setWsSymbols([]);
        } })
        .finally(() => { if (!cancelled) {
          setWsBusy(false);
        } });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, query]);
  return { wsSymbols, wsBusy };
}

function PaletteSearchBar({ Icon, busy, query, onQuery, placeholder, onEscape, onMove, onCommit }: {
  Icon: typeof Search;
  busy: boolean;
  query: string;
  onQuery(query: string): void;
  placeholder: string;
  onEscape(): void;
  onMove(delta: number): void;
  onCommit(): void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
      {busy ? <Loader2 size={15} className="lm-anim-spin shrink-0 text-accent" /> : <Icon size={15} className="shrink-0 text-accent" />}
      <input
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] outline-none placeholder:text-subtle"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onEscape();
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
          if (e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
          if (e.key === 'Tab') {
            e.preventDefault();
          }
        }}
      />
      <Kbd>Esc</Kbd>
    </div>
  );
}

function PaletteFooter({ runs, count }: { runs: boolean; count: number; }) {
  return (
    <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10.5px] text-subtle">
      <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('palette.navigate')}</span>
      <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t(runs ? 'palette.run' : 'palette.open')}</span>
      <span className="ml-auto">{t('palette.entries', { count: count })}</span>
    </div>
  );
}

function PaletteRow({ row, selected, index, showCategory, onHover, onCommit }: {
  row: Row;
  selected: boolean;
  index: number;
  showCategory: boolean;
  onHover(): void;
  onCommit(): void;
}) {
  return (
    <button
      data-row={index}
      onMouseMove={onHover}
      onClick={onCommit}
      className={[
        'lm-transition flex w-full items-center gap-2.5 rounded-lumen-sm px-2.5 py-1.5 text-left',
        selected ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
      ].join(' ')}
      style={row.indent ? { paddingLeft: 10 + row.indent * 12 } : undefined}
    >
      {row.glyph ? (
        <span className="flex w-4 shrink-0 justify-center">
          <IconGlyph icon={row.glyph} size={13} />
        </span>
      ) : (
        <File size={13} className="shrink-0 opacity-45" />
      )}

      <span className="min-w-0 flex-1 truncate text-[13px]">
        {row.category && showCategory && (
          <span className="text-subtle">{row.category} › </span>
        )}
        {highlightParts(row.title, row.matches).map((part, k) => (
          <span key={k} className={part.hit ? 'font-semibold text-accent' : ''}>
            {part.text}
          </span>
        ))}
      </span>

      {row.subtitle && (
        <span className="max-w-[45%] shrink-0 truncate text-[11px] text-subtle">
          {row.subtitle}
        </span>
      )}
      {selected && <CornerDownLeft size={11} className="shrink-0 text-subtle" />}
    </button>
  );
}

export function CommandPalette() {
  const mode = useStore((s) => s.paletteOpen);
  const setPalette = useStore((s) => s.setPalette);
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const openAt = useStore((s) => s.openAt);
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const commands = useCommands();
  // Subscribes to the language change; `t` is used directly.
  const language = useLanguage();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // A prefix in the search field switches the mode.
  const prefixMode = PREFIXES[query[0] ?? ''];
  const openMode: ActiveMode | false = mode === 'everywhere' ? false : mode;
  const { visible, closing } = usePresence(Boolean(openMode));
  // While fading out, the last mode and its input stay put.
  const lastMode = useLastValue(openMode);
  const paletteMode: ActiveMode | false = visible ? (openMode || lastMode || false) : false;
  const effectiveMode: ActiveMode | false = paletteMode ? (prefixMode ?? paletteMode) : false;
  const effectiveQuery = prefixMode ? query.slice(1) : query;

  useEffect(() => {
    if (!mode) {
      return;
    }
    setQuery('');
    setIndex(0);
  }, [mode]);

  useEffect(() => {
    if (effectiveMode !== 'files' || !workspace) {
      return;
    }
    window.lumen.fs.listFiles(workspace, 5000).then(setFiles).catch(() => setFiles([]));
  }, [effectiveMode, workspace]);

  const { wsSymbols, wsBusy } = useWorkspaceSymbols(effectiveMode, effectiveQuery);

  const rows = useMemo<Row[]>(() => {
    if (!effectiveMode) {
      return [];
    }
    return buildRows({
      mode: effectiveMode, query: effectiveQuery, commands, files, workspace, openFile, openAt, activePath, wsSymbols, project, config,
    });
  }, [effectiveMode, effectiveQuery, commands, files, workspace, openFile, openAt, activePath, wsSymbols, project, config, language]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!paletteMode || !effectiveMode) {
    return null;
  }

  const commit = (row?: Row) => {
    const target = row ?? rows[index];
    setPalette(false);
    target?.run();
  };

  const Icon = MODE_ICON[effectiveMode];
  const empty = emptyMessage(effectiveMode, {
    workspace: Boolean(workspace),
    activePath: Boolean(activePath),
    queryLength: effectiveQuery.trim().length,
    busy: wsBusy,
  });

  return (
    <div
      className={`lm-anim-fade fixed inset-0 z-40 flex items-start justify-center bg-black/35 pt-[12vh] ${closing ? 'lm-closing' : ''}`}
      onClick={() => setPalette(false)}
    >
      <div
        className="lm-glass lm-shadow lm-anim-pop flex max-h-[62vh] w-[min(680px,92vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <PaletteSearchBar
          Icon={Icon}
          busy={wsBusy}
          query={query}
          onQuery={setQuery}
          placeholder={t(PLACEHOLDER[effectiveMode])}
          onEscape={() => setPalette(false)}
          onMove={(delta) => setIndex((i) => Math.max(0, Math.min(rows.length - 1, i + delta)))}
          onCommit={() => commit()}
        />

        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <div className="px-3 py-8 text-center text-[12.5px] text-subtle">{empty}</div>
          )}

          {rows.map((row, i) => (
            <PaletteRow
              key={row.key}
              row={row}
              index={i}
              selected={i === index}
              showCategory={effectiveMode === 'commands' || effectiveMode === 'tasks'}
              onHover={() => setIndex(i)}
              onCommit={() => commit(row)}
            />
          ))}
        </div>

        <PaletteFooter runs={effectiveMode === 'tasks' || effectiveMode === 'commands'} count={rows.length} />
      </div>
    </div>
  );
}
