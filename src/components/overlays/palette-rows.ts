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
 * The rows of the command palette, one builder per mode.
 */

import { relativeToWorkspace, type PaletteMode, type useStore } from '@/state/store';
import type { useCommands } from '@/hooks/useCommands';
import { fuzzyMatch } from '@/lib/fuzzy';
import { fileGlyph } from '@/lib/file-icon';
import { SYMBOL_GLYPH, symbolKindLabel, uriToPath, type WorkspaceSymbol } from '@/core/lsp/protocol';
import { symbolStore, flattenSymbols } from '@/lib/symbols';
import { runTask } from '@/lib/run';
import { symbolTone } from '../panels/OutlinePanel';
import { t } from '@/i18n';

export interface Row {
  key: string;
  title: string;
  subtitle?: string;
  category?: string;
  glyph?: { glyph: string; color: string; };
  indent?: number;
  matches: number[];
  score: number;
  run: () => void;
}

/** “Search everywhere” has an interface of its own (SearchEverywhere). */
export type ActiveMode = Exclude<PaletteMode, false | 'everywhere'>;

/** Keys of the task groups. */
const GROUP_LABEL: Record<string, string> = {
  build: 'palette.group.build', run: 'palette.group.run', test: 'palette.group.test',
  clean: 'palette.group.clean', other: 'palette.group.other',
};

type StoreState = ReturnType<typeof useStore.getState>;

export interface RowContext {
  mode: ActiveMode;
  query: string;
  commands: ReturnType<typeof useCommands>;
  files: string[];
  workspace: string | null;
  openFile: StoreState['openFile'];
  openAt: StoreState['openAt'];
  activePath: string | null;
  wsSymbols: (WorkspaceSymbol & { server: string; })[];
  project: StoreState['project'];
  config: StoreState['projectConfig'];
}

function commandRows(c: RowContext): Row[] {
  return c.commands.map((command) => ({
    key: command.id,
    title: command.title,
    category: command.category,
    subtitle: command.keybinding,
    matches: [],
    score: 0,
    run: () => void command.run(),
  }));
}

function fileRows(c: RowContext): Row[] {
  return c.files.map((path) => {
    const name = path.split(/[\\/]/).pop() ?? path;
    const relative = relativeToWorkspace(path, c.workspace);
    return {
      key: path,
      title: name,
      subtitle: relative.slice(0, relative.length - name.length).replace(/\/$/, ''),
      glyph: fileGlyph(name),
      matches: [],
      score: 0,
      run: () => void c.openFile(path),
    };
  });
}

function symbolRows(c: RowContext): Row[] {
  const { activePath } = c;
  return flattenSymbols(symbolStore.get(activePath)).map(({ node, depth }) => ({
    key: `${node.name}-${node.range.start.line}-${node.range.start.character}`,
    title: node.name,
    subtitle: `${symbolKindLabel(node.kind)} · ${t('palette.lineShort', { line: String(node.selectionRange.start.line + 1) })}`,
    glyph: { glyph: SYMBOL_GLYPH[node.kind] ?? '·', color: symbolTone(node.kind) },
    indent: depth,
    matches: [],
    score: 0,
    run: () => {
      if (!activePath) {
        return;
      }
      void c.openAt(
        activePath, node.selectionRange.start.line, node.selectionRange.start.character,
        node.selectionRange.end.line, node.selectionRange.end.character,
      );
    },
  }));
}

function workspaceSymbolRows(c: RowContext): Row[] {
  return c.wsSymbols.map((symbol, i) => {
    const uri = symbol.location.uri;
    const path = uriToPath(uri);
    const range = 'range' in symbol.location ? symbol.location.range : null;
    return {
      key: `${uri}-${i}`,
      title: symbol.name,
      subtitle: `${symbol.containerName ? `${symbol.containerName} · ` : ''}${relativeToWorkspace(path, c.workspace)}${range ? `:${range.start.line + 1}` : ''}`,
      glyph: { glyph: SYMBOL_GLYPH[symbol.kind] ?? '·', color: symbolTone(symbol.kind) },
      matches: [],
      score: 0,
      run: () => {
        if (!range) {
          void c.openFile(path);
          return;
        }
        void c.openAt(path, range.start.line, range.start.character, range.end.line, range.end.character);
      },
    };
  });
}

function taskRows(c: RowContext): Row[] {
  return [...c.config.tasks, ...(c.project?.tasks ?? [])].map((task) => ({
    key: task.id,
    title: task.label,
    category: GROUP_LABEL[task.group ?? 'other'] && t(GROUP_LABEL[task.group ?? 'other']),
    subtitle: `${task.command} ${task.args.join(' ')}`.slice(0, 60),
    matches: [],
    score: 0,
    run: () => void runTask(task),
  }));
}

const SOURCES: Record<ActiveMode, (c: RowContext) => Row[]> = {
  commands: commandRows,
  files: fileRows,
  symbols: symbolRows,
  'workspace-symbols': workspaceSymbolRows,
  tasks: taskRows,
};

/** Fuzzy-filters and ranks the rows against the search text. */
function rank(source: Row[], needle: string): Row[] {
  return source
    .flatMap((row) => {
      const target = row.category ? `${row.category} ${row.title}` : row.title;
      const hit = fuzzyMatch(target, needle);
      if (!hit) {
        return [];
      }
      const offset = row.category ? row.category.length + 1 : 0;
      return [{
        ...row,
        score: hit.score,
        matches: hit.matches.map((m) => m - offset).filter((m) => m >= 0),
      }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 300);
}

export function buildRows(c: RowContext): Row[] {
  const source = SOURCES[c.mode](c);
  const needle = c.query.trim();
  if (!needle || c.mode === 'workspace-symbols') {
    return source.slice(0, 300);
  }
  return rank(source, needle);
}
