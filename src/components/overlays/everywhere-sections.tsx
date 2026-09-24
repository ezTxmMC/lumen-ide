/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/*
 * The result sections of “Search everywhere”, one builder per kind of hit.
 */

import type { ReactNode } from 'react';
import { Play, TextSearch, Zap } from 'lucide-react';
import { relativeToWorkspace, type EverywhereTab, type useStore } from '@/state/store';
import type { useCommands } from '@/hooks/useCommands';
import { fuzzyMatch } from '@/lib/fuzzy';
import { fileGlyph } from '@/lib/file-icon';
import { SYMBOL_GLYPH, symbolKindLabel, uriToPath, type WorkspaceSymbol } from '@/core/lsp/protocol';
import { flattenSymbols, symbolStore } from '@/lib/symbols';
import { runTask } from '@/lib/run';
import { symbolTone } from '../panels/OutlinePanel';
import { t } from '@/i18n';
import type { SearchHit } from '../../../electron/preload';

export interface Item {
  key: string;
  title: string;
  matches: number[];
  subtitle?: string;
  hint?: string;
  glyph?: { glyph: string; color: string; };
  icon?: ReactNode;
  score: number;
  run: () => void;
}

export interface Section {
  id: Exclude<EverywhereTab, 'all'> | 'recent';
  label: string;
  items: Item[];
  /** Hits in total — more than shown when the “all” tab truncates. */
  total: number;
  loading?: boolean;
}

const PER_SECTION_IN_ALL = 6;
const MAX_ITEMS = 200;

type StoreState = ReturnType<typeof useStore.getState>;

/** Everything the section builders read; rebuilt whenever one of these changes. */
export interface SectionContext {
  tab: EverywhereTab;
  needle: string;
  line?: number;
  column?: number;
  files: string[];
  symbols: (WorkspaceSymbol & { server: string; })[];
  symbolsBusy: boolean;
  textHits: SearchHit[];
  textBusy: boolean;
  commands: ReturnType<typeof useCommands>;
  recentFiles: string[];
  openTabs: StoreState['tabs'];
  activePath: string | null;
  project: StoreState['project'];
  config: StoreState['projectConfig'];
  workspace: string | null;
  openFile: StoreState['openFile'];
  openAt: StoreState['openAt'];
}

/** `File.ts:12:4` → the search text plus line and column, 0-based. */
export function splitLocation(query: string): { needle: string; line?: number; column?: number; } {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(query.trim());
  if (!m || !m[1]) {
    return { needle: query.trim() };
  }
  return { needle: m[1], line: Number(m[2]) - 1, column: m[3] ? Number(m[3]) - 1 : 0 };
}

function score<T>(entries: T[], needle: string, text: (entry: T) => string, alt?: (entry: T) => string) {
  return entries.flatMap((entry) => {
    const primary = fuzzyMatch(text(entry), needle);
    if (primary) {
      return [{ entry, score: primary.score + 8, matches: primary.matches }];
    }
    const secondary = alt ? fuzzyMatch(alt(entry), needle) : null;
    if (!secondary) {
      return [];
    }
    return [{ entry, score: secondary.score, matches: [] as number[] }];
  }).sort((a, b) => b.score - a.score);
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function openFileItem(c: SectionContext, path: string, matches: number[], itemScore: number): Item {
  const { line, column } = c;
  const name = baseName(path);
  const relative = relativeToWorkspace(path, c.workspace);
  return {
    key: `file:${path}`,
    title: name,
    matches,
    subtitle: relative.slice(0, relative.length - name.length).replace(/\/$/, ''),
    hint: line !== undefined ? t('palette.line', { line: String(line + 1) }) : undefined,
    glyph: fileGlyph(name),
    score: itemScore,
    run: () => {
      if (line === undefined) {
        void c.openFile(path);
        return;
      }
      void c.openAt(path, line, column ?? 0);
    },
  };
}

/** With nothing typed: recently opened files. */
function recentSection(c: SectionContext): Section {
  const recent = [...new Set([...c.recentFiles, ...c.openTabs.map((tab) => tab.path).filter((p): p is string => Boolean(p))])]
    .filter((p) => !p.includes('://'));
  return {
    id: 'recent',
    label: t('palette.everywhere.recent'),
    items: recent.slice(0, 30).map((p) => openFileItem(c, p, [], 0)),
    total: recent.length,
  };
}

function filesSection(c: SectionContext): Section {
  const { needle, workspace } = c;
  const byPath = needle.includes('/');
  const recentBonus = new Map(c.recentFiles.map((p, i) => [p, Math.max(0, 20 - i)]));
  const scored = score(
    c.files,
    needle,
    (p) => (byPath ? relativeToWorkspace(p, workspace) : baseName(p)),
    (p) => relativeToWorkspace(p, workspace),
  )
    .map((hit) => ({ ...hit, score: hit.score + (recentBonus.get(hit.entry) ?? 0) }))
    .sort((a, b) => b.score - a.score);
  const nameOffset = (p: string) => (byPath ? relativeToWorkspace(p, workspace).length - baseName(p).length : 0);
  return {
    id: 'files',
    label: t('palette.everywhere.tabs.files'),
    items: scored.slice(0, MAX_ITEMS).map((hit) =>
      openFileItem(c, hit.entry, hit.matches.map((m) => m - nameOffset(hit.entry)).filter((m) => m >= 0), hit.score)),
    total: scored.length,
  };
}

function symbolsSection(c: SectionContext): Section {
  const { needle, activePath, workspace } = c;
  const local = flattenSymbols(symbolStore.get(activePath)).map(({ node }) => node);
  const localScored: Item[] = score(local, needle, (n) => n.name).map(({ entry, matches, score: s }) => ({
    key: `local:${entry.name}:${entry.range.start.line}`,
    title: entry.name,
    matches,
    subtitle: `${symbolKindLabel(entry.kind)} · ${t('palette.everywhere.thisFile')}`,
    hint: t('palette.lineShort', { line: String(entry.selectionRange.start.line + 1) }),
    glyph: { glyph: SYMBOL_GLYPH[entry.kind] ?? '·', color: symbolTone(entry.kind) },
    score: s + 5,
    run: () => {
      if (!activePath) {
        return;
      }
      void c.openAt(activePath, entry.selectionRange.start.line, entry.selectionRange.start.character);
    },
  }));
  const remote: Item[] = score(c.symbols, needle, (sym) => sym.name).map(({ entry, matches, score: s }, i) => {
    const path = uriToPath(entry.location.uri);
    const range = 'range' in entry.location ? entry.location.range : null;
    return {
      key: `ws:${entry.location.uri}:${entry.name}:${i}`,
      title: entry.name,
      matches,
      subtitle: `${entry.containerName ? `${entry.containerName} · ` : ''}${relativeToWorkspace(path, workspace)}`,
      hint: range ? t('palette.lineShort', { line: String(range.start.line + 1) }) : symbolKindLabel(entry.kind),
      glyph: { glyph: SYMBOL_GLYPH[entry.kind] ?? '·', color: symbolTone(entry.kind) },
      score: s,
      run: () => {
        if (!range) {
          void c.openFile(path);
          return;
        }
        void c.openAt(path, range.start.line, range.start.character);
      },
    };
  });
  const items = [...localScored, ...remote].sort((a, b) => b.score - a.score);
  return { id: 'symbols', label: t('palette.everywhere.tabs.symbols'), items: items.slice(0, MAX_ITEMS), total: items.length, loading: c.symbolsBusy };
}

function actionsSection(c: SectionContext): Section {
  const { needle } = c;
  const scored = needle
    ? score(c.commands, needle, (cmd) => cmd.title, (cmd) => `${cmd.category ?? ''} ${cmd.title}`)
    : c.commands.map((entry) => ({ entry, score: 0, matches: [] as number[] }));
  return {
    id: 'actions',
    label: t('palette.everywhere.tabs.actions'),
    items: scored.slice(0, MAX_ITEMS).map(({ entry, matches, score: s }) => ({
      key: `cmd:${entry.id}`,
      title: entry.title,
      matches,
      subtitle: entry.category,
      hint: entry.keybinding,
      icon: <Zap size={12} className="text-accent" />,
      score: s,
      run: () => void entry.run(),
    })),
    total: scored.length,
  };
}

function tasksSection(c: SectionContext): Section {
  const { needle } = c;
  const all = [...c.config.tasks, ...(c.project?.tasks ?? [])];
  const scored = needle
    ? score(all, needle, (task) => task.label, (task) => `${task.command} ${task.args.join(' ')}`)
    : all.map((entry) => ({ entry, score: 0, matches: [] as number[] }));
  return {
    id: 'tasks',
    label: t('palette.everywhere.tabs.tasks'),
    items: scored.slice(0, MAX_ITEMS).map(({ entry, matches, score: s }) => ({
      key: `task:${entry.id}`,
      title: entry.label,
      matches,
      subtitle: `${entry.command} ${entry.args.join(' ')}`.slice(0, 80),
      icon: <Play size={12} className="text-ok" />,
      score: s,
      run: () => void runTask(entry),
    })),
    total: scored.length,
  };
}

function textSection(c: SectionContext): Section {
  const { needle } = c;
  return {
    id: 'text',
    label: t('palette.everywhere.tabs.text'),
    items: c.textHits.map((hit, i) => {
      const at = hit.text.toLowerCase().indexOf(needle.toLowerCase());
      return {
        key: `text:${hit.path}:${hit.line}:${i}`,
        title: hit.text,
        matches: at < 0 ? [] : Array.from({ length: needle.length }, (_, k) => at + k),
        subtitle: `${relativeToWorkspace(hit.path, c.workspace)}`,
        hint: t('palette.lineShort', { line: String(hit.line) }),
        icon: <TextSearch size={12} className="text-subtle" />,
        score: 0,
        run: () => void c.openAt(hit.path, hit.line - 1, Math.max(0, at)),
      };
    }),
    total: c.textHits.length,
    loading: c.textBusy,
  };
}

export function buildSections(c: SectionContext): Section[] {
  const { tab, needle } = c;
  const result: Section[] = [];
  if (!needle && (tab === 'all' || tab === 'files')) {
    result.push(recentSection(c));
  }
  if (needle && (tab === 'all' || tab === 'files')) {
    result.push(filesSection(c));
  }
  if (needle && (tab === 'all' || tab === 'symbols')) {
    result.push(symbolsSection(c));
  }
  if (tab === 'actions' || (tab === 'all' && needle)) {
    result.push(actionsSection(c));
  }
  if (tab === 'tasks' || (tab === 'all' && needle)) {
    result.push(tasksSection(c));
  }
  if (needle.length >= 3 && (tab === 'all' || tab === 'text')) {
    result.push(textSection(c));
  }
  if (tab !== 'all') {
    return result;
  }
  return result
    .map((section) => ({ ...section, items: section.id === 'recent' ? section.items.slice(0, 12) : section.items.slice(0, PER_SECTION_IN_ALL) }))
    .filter((section) => section.items.length > 0 || section.loading);
}
