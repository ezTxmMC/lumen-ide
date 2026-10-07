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
 * Imports that follow when files are renamed or moved in the explorer.
 *
 * Language servers that implement `workspace/willRenameFiles` (TypeScript,
 * Java, …) are asked first: they know their own import rules. Without an
 * answer, relative imports in JavaScript and TypeScript files are retargeted
 * by `core/project/imports.ts`.
 *
 * Usage: `const finish = await planImportUpdates(moves)` before renaming (the
 * server needs the old paths), then `await finish(moves actually done)`.
 */

import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { pathToUri, uriToPath, type TextEdit, type WorkspaceEdit } from '@/core/lsp/protocol';
import { isScriptFile, mapPath, retargetImports, slashed, type PathMove, type SpecifierEdit } from '@/core/project/imports';
import { applyWorkspaceEdit } from '@/lib/editor/workspace-edit';
import { t } from '@/i18n';

/** How long a language server may take to answer before the rename goes ahead without it. */
const SERVER_TIMEOUT_MS = 4000;
/** Files looked at in the fallback, and how many are read at once. */
const MAX_SCANNED = 20000;
const READ_BATCH = 24;

const withTimeout = <T>(work: Promise<T>): Promise<T | null> => Promise.race([
  work,
  new Promise<null>((resolve) => setTimeout(() => resolve(null), SERVER_TIMEOUT_MS)),
]);

/** What the language servers want changed before these files are renamed. */
async function serverEdits(moves: PathMove[]): Promise<WorkspaceEdit[]> {
  const edits: WorkspaceEdit[] = [];
  for (const client of lsp.readyClients()) {
    if (!client.supportsWillRenameFiles()) {
      continue;
    }
    const edit = await withTimeout(client.willRenameFiles(moves)).catch(() => null);
    if (edit) {
      edits.push(edit);
    }
  }
  return edits;
}

const hasChanges = (edit: WorkspaceEdit) =>
  Object.values(edit.changes ?? {}).some((list) => list.length > 0)
  || (edit.documentChanges ?? []).some((change) => 'textDocument' in change && change.edits.length > 0);

/** The edits with their files named by where they are after the moves (the server wrote them for the old places). */
function remapped(edit: WorkspaceEdit, moves: PathMove[]): WorkspaceEdit {
  const uri = (old: string) => pathToUri(mapPath(slashed(uriToPath(old)), moves));
  const changes: Record<string, TextEdit[]> = {};
  for (const [old, list] of Object.entries(edit.changes ?? {})) {
    changes[uri(old)] = [...(changes[uri(old)] ?? []), ...list];
  }
  for (const change of edit.documentChanges ?? []) {
    if ('textDocument' in change) {
      changes[uri(change.textDocument.uri)] = [...(changes[uri(change.textDocument.uri)] ?? []), ...change.edits as TextEdit[]];
    }
  }
  return { changes };
}

/** All servers' edits as one, files named by where they are after the moves. */
function mergedServerEdits(edits: WorkspaceEdit[], moves: PathMove[]): WorkspaceEdit {
  const changes: Record<string, TextEdit[]> = {};
  for (const edit of edits) {
    for (const [uri, list] of Object.entries(remapped(edit, moves).changes ?? {})) {
      changes[uri] = [...(changes[uri] ?? []), ...list];
    }
  }
  return { changes };
}

const lineStartsOf = (text: string) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
};

function toTextEdits(text: string, edits: SpecifierEdit[]): TextEdit[] {
  const starts = lineStartsOf(text);
  const position = (offset: number) => {
    let line = starts.length - 1;
    while (starts[line] > offset) {
      line--;
    }
    return { line, character: offset - starts[line] };
  };
  return edits.map((edit) => ({ range: { start: position(edit.start), end: position(edit.end) }, newText: edit.text }));
}

/** The workspace folder that holds `path`. */
function folderOf(path: string): string | null {
  const state = useStore.getState();
  const folders = [state.workspace, ...state.extraFolders].filter((folder): folder is string => Boolean(folder));
  return folders.map(slashed).find((folder) => path === folder || path.startsWith(`${folder}/`)) ?? null;
}

/** Fallback: scan the project's script files for relative imports that the moves broke. */
async function scanEdits(moves: PathMove[]): Promise<WorkspaceEdit> {
  const roots = new Set<string>();
  for (const move of moves) {
    const root = folderOf(move.to);
    if (root) {
      roots.add(root);
    }
  }
  const changes: Record<string, TextEdit[]> = {};
  for (const root of roots) {
    const all = (await window.lumen.fs.listFiles(root, MAX_SCANNED)).map(slashed);
    const known = new Set(all);
    const scripts = all.filter(isScriptFile);
    for (let i = 0; i < scripts.length; i += READ_BATCH) {
      await Promise.all(scripts.slice(i, i + READ_BATCH).map(async (file) => {
        const text = await window.lumen.fs.readFile(file).catch(() => null);
        if (text === null) {
          return;
        }
        const edits = retargetImports(text, file, moves, (candidate) => known.has(candidate));
        if (edits.length) {
          changes[pathToUri(file)] = toTextEdits(text, edits);
        }
      }));
    }
  }
  return { changes };
}

const countFiles = (edit: WorkspaceEdit) => Object.values(edit.changes ?? {}).filter((list) => list.length > 0).length;

/**
 * Asks the language servers what the rename needs; returns the step to run
 * once the files are renamed, with the moves that really happened.
 */
export async function planImportUpdates(planned: PathMove[]): Promise<(done: PathMove[]) => Promise<void>> {
  const moves = planned.map((move) => ({ from: slashed(move.from), to: slashed(move.to) }));
  const fromServers = moves.length ? await serverEdits(moves) : [];
  return async (done) => {
    const happened = done.map((move) => ({ from: slashed(move.from), to: slashed(move.to) }));
    if (!happened.length) {
      return;
    }
    try {
      // A server's edits were written for all the planned moves — only use them when all of them happened.
      const useServers = happened.length === moves.length && fromServers.some(hasChanges);
      const edit = useServers ? mergedServerEdits(fromServers, happened) : await scanEdits(happened);
      const count = countFiles(edit);
      if (!count) {
        return;
      }
      if (await applyWorkspaceEdit(edit)) {
        useStore.getState().notify(t('explorer.importsUpdated', { count }), 'info');
      }
    } catch (err) {
      useStore.getState().notify(`${t('explorer.importsFailed')}: ${(err as Error).message}`, 'warning');
    }
  };
}
