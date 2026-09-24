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
 * Applies a language server's `WorkspaceEdit` — to open tabs (the active one
 * through a transaction, so undo works), to closed files directly on disk,
 * along with file operations (create, rename, delete).
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { editorBridge } from '@/lib/editor-bridge';
import { uriToPath, type Position, type TextEdit, type WorkspaceEdit } from '@/core/lsp/protocol';

/** The line starts of a text — for position → offset without CodeMirror. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetOf(starts: number[], text: string, pos: Position): number {
  const line = Math.min(Math.max(pos.line, 0), starts.length - 1);
  const lineStart = starts[line];
  const lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
  return Math.min(lineStart + Math.max(0, pos.character), lineEnd);
}

/** Apply text edits to a string (back to front). */
export function applyTextEdits(text: string, edits: TextEdit[]): string {
  const starts = lineStarts(text);
  const ordered = edits
    .map((e) => ({
      from: offsetOf(starts, text, e.range.start),
      to: offsetOf(starts, text, e.range.end),
      insert: e.newText,
    }))
    .sort((a, b) => b.from - a.from || b.to - a.to);
  let out = text;
  for (const e of ordered) {
    out = out.slice(0, e.from) + e.insert + out.slice(Math.max(e.from, e.to));
  }
  return out;
}

/** Edits grouped per file, plus file operations in order. */
function collect(edit: WorkspaceEdit) {
  const byPath = new Map<string, TextEdit[]>();
  const ops: ({ kind: 'create'; path: string; } | { kind: 'delete'; path: string; } | { kind: 'rename'; from: string; to: string; })[] = [];

  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    const path = uriToPath(uri);
    byPath.set(path, [...(byPath.get(path) ?? []), ...edits]);
  }
  for (const change of edit.documentChanges ?? []) {
    if ('kind' in change) {
      if (change.kind === 'create') {
        ops.push({ kind: 'create', path: uriToPath(change.uri) });
      }
      if (change.kind === 'delete') {
        ops.push({ kind: 'delete', path: uriToPath(change.uri) });
      }
      if (change.kind === 'rename') {
        ops.push({ kind: 'rename', from: uriToPath(change.oldUri), to: uriToPath(change.newUri) });
      }
      continue;
    }
    const path = uriToPath(change.textDocument.uri);
    byPath.set(path, [...(byPath.get(path) ?? []), ...change.edits]);
  }
  return { byPath, ops };
}

type FileOperation = ReturnType<typeof collect>['ops'][number];

async function applyFileOperation(op: FileOperation) {
  if (op.kind === 'create') {
    await window.lumen.fs.create(op.path, false);
    return;
  }
  if (op.kind === 'delete') {
    await window.lumen.fs.remove(op.path);
    useStore.getState().pathDeleted(op.path);
    return;
  }
  await window.lumen.fs.rename(op.from, op.to);
  useStore.getState().pathRenamed(op.from, op.to);
}

export async function applyWorkspaceEdit(edit: WorkspaceEdit, label?: string): Promise<boolean> {
  const store = useStore.getState();
  const { byPath, ops } = collect(edit);
  let touched = 0;

  for (const op of ops) {
    try {
      await applyFileOperation(op);
      touched++;
    } catch (err) {
      store.notify(t('notify.fileOperationFailed', { error: (err as Error).message }), 'error');
      return false;
    }
  }

  for (const [path, edits] of byPath) {
    if (!edits.length) {
      continue;
    }
    const tab = useStore.getState().tabs.find((t) => t.path === path);

    if (tab && editorBridge.tabId === tab.id && editorBridge.view) {
      // The active tab: as a transaction, so undo works.
      const doc = editorBridge.view.state.doc;
      const changes = edits.map((e) => {
        const from = posToOffset(doc.line.bind(doc), doc.lines, e.range.start);
        const to = Math.max(from, posToOffset(doc.line.bind(doc), doc.lines, e.range.end));
        return { from, to, insert: e.newText };
      });
      editorBridge.applyChanges(changes);
      touched++;
      continue;
    }

    if (tab) {
      store.updateContent(tab.id, applyTextEdits(tab.content, edits));
      touched++;
      continue;
    }

    // A closed file: read, change, write.
    try {
      const text = await window.lumen.fs.readFile(path);
      await window.lumen.fs.writeFile(path, applyTextEdits(text, edits));
      touched++;
    } catch (err) {
      store.notify(`${path.split(/[\\/]/).pop()}: ${(err as Error).message}`, 'error');
      return false;
    }
  }

  if (touched && label) {
    store.notify(label, 'success');
  }
  return true;
}

type LineFn = (n: number) => { from: number; to: number; };

function posToOffset(line: LineFn, lines: number, pos: Position): number {
  const n = Math.min(Math.max(pos.line + 1, 1), lines);
  const l = line(n);
  return Math.min(l.from + Math.max(pos.character, 0), l.to);
}
