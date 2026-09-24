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
 * “Search everywhere” as in IntelliJ: Shift twice opens a search over files,
 * symbols, actions, tasks and text. `Tab` moves between tabs, and `File.ts:42`
 * jumps straight to the line.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, CornerDownLeft, FileText, History, Loader2, Search } from 'lucide-react';
import { useStore, type EverywhereTab } from '@/state/store';
import { usePresence } from '@/hooks/usePresence';
import { useCommands } from '@/hooks/useCommands';
import { highlightParts } from '@/lib/fuzzy';
import { IconGlyph } from '../icons/FileIcon';
import { lsp } from '@/core/lsp/manager';
import type { WorkspaceSymbol } from '@/core/lsp/protocol';
import { t, useLanguage } from '@/i18n';
import { Kbd } from '../ui';
import { buildSections, splitLocation, type Item, type Section } from './everywhere-sections';
import type { SearchHit } from '../../../electron/preload';

/** `label` is a key. */
const TABS: { id: EverywhereTab; label: string; }[] = [
  { id: 'all', label: 'palette.everywhere.tabs.all' },
  { id: 'files', label: 'palette.everywhere.tabs.files' },
  { id: 'symbols', label: 'palette.everywhere.tabs.symbols' },
  { id: 'actions', label: 'palette.everywhere.tabs.actions' },
  { id: 'tasks', label: 'palette.everywhere.tabs.tasks' },
  { id: 'text', label: 'palette.everywhere.tabs.text' },
];

/** Language server symbols, debounced. */
function useSymbolSearch(open: boolean, tab: EverywhereTab, needle: string) {
  const [symbols, setSymbols] = useState<(WorkspaceSymbol & { server: string; })[]>([]);
  const [symbolsBusy, setSymbolsBusy] = useState(false);
  useEffect(() => {
    if (!open || !['all', 'symbols'].includes(tab) || needle.length < 2) {
      setSymbols([]);
      return;
    }
    let cancelled = false;
    setSymbolsBusy(true);
    const timer = setTimeout(() => {
      lsp.workspaceSymbols(needle)
        .then((result) => { if (!cancelled) {
          setSymbols(result);
        } })
        .catch(() => { if (!cancelled) {
          setSymbols([]);
        } })
        .finally(() => { if (!cancelled) {
          setSymbolsBusy(false);
        } });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, tab, needle]);
  return { symbols, symbolsBusy };
}

/** Full text, debounced, from three characters on. */
function useTextSearch(open: boolean, workspace: string | null, tab: EverywhereTab, needle: string) {
  const [textHits, setTextHits] = useState<SearchHit[]>([]);
  const [textBusy, setTextBusy] = useState(false);
  useEffect(() => {
    if (!open || !workspace || !['all', 'text'].includes(tab) || needle.length < 3) {
      setTextHits([]);
      return;
    }
    let cancelled = false;
    setTextBusy(true);
    const timer = setTimeout(() => {
      window.lumen.fs.search(workspace, needle, tab === 'text' ? 300 : 20)
        .then((result) => { if (!cancelled) {
          setTextHits(result);
        } })
        .catch(() => { if (!cancelled) {
          setTextHits([]);
        } })
        .finally(() => { if (!cancelled) {
          setTextBusy(false);
        } });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, tab, needle, workspace]);
  return { textHits, textBusy };
}

function handleKey(event: React.KeyboardEvent, ctx: {
  close(): void;
  switchTab(direction: 1 | -1): void;
  commit(): void;
  last: number;
  setIndex(update: (i: number) => number): void;
}) {
  if (event.key === 'Escape') {
    event.preventDefault();
    ctx.close();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    ctx.switchTab(event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    ctx.setIndex((i) => Math.min(ctx.last, i + 1));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    ctx.setIndex((i) => Math.max(0, i - 1));
    return;
  }
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  ctx.commit();
}

export function SearchEverywhere() {
  const open = useStore((s) => s.paletteOpen === 'everywhere');
  const { visible, closing } = usePresence(open);
  const tab = useStore((s) => s.everywhereTab);
  const setTab = useStore((s) => s.setEverywhereTab);
  const setPalette = useStore((s) => s.setPalette);
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const openAt = useStore((s) => s.openAt);
  const recentFiles = useStore((s) => s.recentFiles);
  const openTabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const commands = useCommands();
  // Subscribes to the language change; `t` is used directly.
  const language = useLanguage();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const { needle, line, column } = splitLocation(query);

  // On opening: select the input (IntelliJ keeps the last search), load the file list.
  useEffect(() => {
    if (!open) {
      return;
    }
    setIndex(0);
    // Select immediately and again after focusing — rAF is unreliable in a hidden window.
    input.current?.select();
    window.setTimeout(() => input.current?.select(), 0);
    if (!workspace) {
      return;
    }
    window.lumen.fs.listFiles(workspace, 20_000).then(setFiles).catch(() => setFiles([]));
  }, [open, workspace]);

  useEffect(() => setIndex(0), [query, tab]);

  const { symbols, symbolsBusy } = useSymbolSearch(open, tab, needle);
  const { textHits, textBusy } = useTextSearch(open, workspace, tab, needle);

  const close = () => setPalette(false);

  const sections = useMemo<Section[]>(() => {
    // While fading out, the list stays put.
    if (!visible) {
      return [];
    }
    return buildSections({
      tab, needle, line, column, files, symbols, symbolsBusy, textHits, textBusy, commands, recentFiles, openTabs,
      activePath, project, config, workspace, openFile, openAt,
    });
  }, [
    visible, tab, needle, line, column, files, symbols, symbolsBusy, textHits, textBusy, commands,
    recentFiles, openTabs, activePath, project, config, workspace, openFile, openAt, language,
  ]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!visible) {
    return null;
  }

  const commit = (item = flat[index]) => {
    if (!item) {
      return;
    }
    close();
    item.run();
  };

  const switchTab = (direction: 1 | -1) => {
    const current = TABS.findIndex((t) => t.id === tab);
    setTab(TABS[(current + direction + TABS.length) % TABS.length].id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => handleKey(event, {
    close, switchTab, commit: () => commit(), last: flat.length - 1, setIndex,
  });

  const loading = sections.some((s) => s.loading);

  return (
    <div className={`lm-anim-fade fixed inset-0 z-40 flex items-start justify-center bg-black/35 pt-[10vh] ${closing ? 'lm-closing' : ''}`} onClick={close}>
      <div
        role="dialog"
        aria-label={t('palette.everywhere.title')}
        className="lm-glass lm-shadow lm-anim-pop flex max-h-[70vh] w-[min(760px,94vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <EverywhereTabs tab={tab} onTab={(id) => { setTab(id); input.current?.focus(); }} />

        <EverywhereSearchBar
          inputRef={input}
          loading={loading}
          query={query}
          onQuery={setQuery}
          onKeyDown={onKeyDown}
          placeholder={placeholder(tab)}
          line={line}
        />

        <div ref={list} className="flex-1 overflow-y-auto p-1.5">
          {flat.length === 0 && !loading && (
            <div className="px-3 py-8 text-center text-[12.5px] text-subtle">{emptyText(tab, needle, Boolean(workspace))}</div>
          )}
          <ResultSections
            sections={sections}
            tab={tab}
            index={index}
            onIndex={setIndex}
            onCommit={commit}
            onShowAll={(id) => { setTab(id); input.current?.focus(); }}
          />
        </div>

        <EverywhereFooter hits={flat.length} />
      </div>
    </div>
  );
}

function EverywhereTabs({ tab, onTab }: { tab: EverywhereTab; onTab(id: EverywhereTab): void; }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-edge px-2 pt-1.5" role="tablist">
      {TABS.map((entry) => (
        <button
          key={entry.id}
          role="tab"
          aria-selected={tab === entry.id}
          onClick={() => onTab(entry.id)}
          className={[
            'lm-transition relative px-2.5 pb-1.5 pt-1 text-[12px]',
            tab === entry.id ? 'text-fg' : 'text-subtle hover:text-muted',
          ].join(' ')}
        >
          {t(entry.label)}
          {tab === entry.id && <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-accent" />}
        </button>
      ))}
      <span className="ml-auto pb-1.5 text-[10.5px] text-subtle">
        <Kbd>⇧</Kbd><Kbd>⇧</Kbd> · <Kbd>Tab</Kbd> {t('palette.everywhere.tabHint')}
      </span>
    </div>
  );
}

function EverywhereSearchBar({ inputRef, loading, query, onQuery, onKeyDown, placeholder, line }: {
  inputRef: React.RefObject<HTMLInputElement>;
  loading: boolean;
  query: string;
  onQuery(query: string): void;
  onKeyDown(event: React.KeyboardEvent): void;
  placeholder: string;
  line?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-edge px-4 py-2.5">
      {loading ? <Loader2 size={15} className="lm-anim-spin shrink-0 text-accent" /> : <Search size={15} className="shrink-0 text-accent" />}
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] outline-none placeholder:text-subtle"
      />
      {line !== undefined && <span className="shrink-0 font-mono text-[11px] text-subtle">{t('palette.jumpToLine', { line: String(line + 1) })}</span>}
    </div>
  );
}

function EverywhereFooter({ hits }: { hits: number; }) {
  return (
    <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10.5px] text-subtle">
      <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('palette.navigate')}</span>
      <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t('palette.open')}</span>
      <span className="flex items-center gap-1"><AtSign size={10} /> <code>{t('palette.everywhere.lineSyntax')}</code> {t('palette.everywhere.lineHint')}</span>
      <span className="ml-auto">{t('palette.everywhere.hits', { count: hits })}</span>
    </div>
  );
}

function ResultSections({ sections, tab, index, onIndex, onCommit, onShowAll }: {
  sections: Section[];
  tab: EverywhereTab;
  index: number;
  onIndex(index: number): void;
  onCommit(item: Item): void;
  onShowAll(id: EverywhereTab): void;
}) {
  let running = 0;
  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className="mb-1">
          {(tab === 'all' || section.id === 'recent') && (
            <div className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {section.id === 'recent' && <History size={10} />}
              {section.label}
              {section.loading && <Loader2 size={9} className="lm-anim-spin" />}
              {tab === 'all' && section.id !== 'recent' && section.total > section.items.length && (
                <button
                  className="ml-auto font-normal normal-case tracking-normal text-accent hover:underline"
                  onClick={() => onShowAll(section.id as EverywhereTab)}
                >
                  {t('palette.everywhere.showAll', { count: section.total })}
                </button>
              )}
            </div>
          )}
          {section.items.map((item) => {
            const i = running++;
            return (
              <ResultRow
                key={item.key}
                item={item}
                index={i}
                selected={i === index}
                mono={section.id === 'text'}
                onHover={() => onIndex(i)}
                onCommit={() => onCommit(item)}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

function ResultRow({ item, index, selected, mono, onHover, onCommit }: {
  item: Item;
  index: number;
  selected: boolean;
  mono: boolean;
  onHover: () => void;
  onCommit: () => void;
}) {
  return (
    <button
      data-index={index}
      onMouseMove={onHover}
      onClick={onCommit}
      className={[
        'lm-transition flex w-full items-center gap-2.5 rounded-lumen-sm px-2.5 py-1.5 text-left',
        selected ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
      ].join(' ')}
    >
      <span className="flex w-4 shrink-0 justify-center">
        {item.glyph
          ? <IconGlyph icon={item.glyph} size={13} />
          : (item.icon ?? <FileText size={12} className="opacity-50" />)}
      </span>
      <span className={`min-w-0 shrink truncate text-[13px] ${mono ? 'font-mono text-[12px]' : ''}`}>
        {highlightParts(item.title, item.matches).map((part, k) => (
          <span key={k} className={part.hit ? 'font-semibold text-accent' : ''}>{part.text}</span>
        ))}
      </span>
      {item.subtitle && <span className="min-w-0 flex-1 truncate text-[11px] text-subtle">{item.subtitle}</span>}
      {!item.subtitle && <span className="flex-1" />}
      {item.hint && <span className="shrink-0 font-mono text-[10.5px] text-subtle">{item.hint}</span>}
      {selected && <CornerDownLeft size={11} className="shrink-0 text-subtle" />}
    </button>
  );
}

function placeholder(tab: EverywhereTab) {
  return t(`palette.everywhere.placeholder.${tab}`);
}

function emptyText(tab: EverywhereTab, needle: string, hasWorkspace: boolean): string {
  if (!hasWorkspace && (tab === 'files' || tab === 'text')) {
    return t('palette.empty.noFolder');
  }
  if (tab === 'symbols' && needle.length < 2) {
    return t('palette.everywhere.empty.symbolsMin');
  }
  if (tab === 'text' && needle.length < 3) {
    return t('palette.everywhere.empty.textMin');
  }
  if (!needle) {
    return t('palette.everywhere.empty.enterTerm');
  }
  return t('palette.everywhere.empty.nothingFor', { query: needle });
}
