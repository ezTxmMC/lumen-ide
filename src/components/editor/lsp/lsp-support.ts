/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos, posToOffset } from '@/core/completion/apply';
import { lspFormattingOptions, type LanguageFormat } from '@/core/format-settings';
import { EditorView } from '@codemirror/view';
import { EditorSelection, type Text, type TransactionSpec } from '@codemirror/state';
import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { lsp } from '@/core/lsp/manager';
import type { LspClient } from '@/core/lsp/client';
import type { Diagnostic, Range, TextEdit } from '@/core/lsp/protocol';
import { diagnosticParts, diagnosticText } from '@/core/lsp/diagnostic-text';
import { useStore } from '@/state/store';
import { textEditsToChanges } from './lsp-completion';
import { showCodeActions } from './lsp-actions';

export function rangeToOffsets(doc: Text, range: Range) {
  const from = posToOffset(doc, range.start);
  return { from, to: Math.max(from, posToOffset(doc, range.end)) };
}

export function selectionRange(view: EditorView): Range {
  const { from, to } = view.state.selection.main;
  return { start: offsetToPos(view.state.doc, from), end: offsetToPos(view.state.doc, to) };
}

export function readyClient(filePath: string): LspClient | null {
  const client = lsp.clientForPath(filePath);
  return client?.status === 'ready' ? client : null;
}

/** The word under the cursor — for the titles of reference lists. */
export function wordAt(view: EditorView, pos: number): string {
  const word = view.state.wordAt(pos);
  return word ? view.state.sliceDoc(word.from, word.to) : '';
}

const SEVERITY: Record<number, CmDiagnostic['severity']> = {
  1: 'error', 2: 'warning', 3: 'info', 4: 'hint',
};

/** An extra class for deprecated (2) and unnecessary (1) spots. */
function diagnosticMark(tags: (1 | 2)[] | undefined): string | undefined {
  if (tags?.includes(2)) {
    return 'cm-lintRange-deprecated';
  }
  if (tags?.includes(1)) {
    return 'cm-lintRange-unnecessary';
  }
  return undefined;
}

/**
 * The tooltip body: the message, the code (a link where the server gave a
 * `codeDescription`) and the related locations, each of which opens its place.
 */
function renderDiagnostic(diagnostic: Diagnostic): Node {
  const parts = diagnosticParts(diagnostic);
  const root = document.createElement('div');
  const message = document.createElement('span');
  message.textContent = parts.message;
  root.append(message);
  if (parts.code) {
    const code = document.createElement(parts.href ? 'a' : 'span');
    code.className = 'cm-diagnosticCode';
    code.textContent = ` [${parts.code}]`;
    if (parts.href) {
      const href = parts.href;
      code.setAttribute('role', 'link');
      code.style.cursor = 'pointer';
      code.style.textDecoration = 'underline';
      code.addEventListener('mousedown', (event) => {
        event.preventDefault();
        void window.lumen.shell.openExternal(href);
      });
    }
    root.append(code);
  }
  for (const entry of parts.related) {
    const row = document.createElement('div');
    row.className = 'cm-diagnosticRelated';
    row.style.cursor = 'pointer';
    row.style.opacity = '0.8';
    row.textContent = `↳ ${entry.name}:${entry.line + 1}: ${entry.message}`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      void useStore.getState().openAt(entry.path, entry.line, entry.character);
    });
    root.append(row);
  }
  return root;
}

/** The file whose diagnostics were last set on this view. */
export const shownFor = new WeakMap<EditorView, string | undefined>();

export function applyDiagnostics(view: EditorView, diagnostics: Diagnostic[], filePath?: string) {
  // Stale diagnostics — the server still working on an older snapshot — would
  // land beside the text while typing, so it is better to leave the existing
  // ones: CodeMirror moves them along with the changes. On a file switch they
  // always have to be set, or another file's marks would stay behind.
  const sameFile = shownFor.has(view) && shownFor.get(view) === filePath;
  if (filePath && sameFile && !lsp.diagnosticsAreCurrent(filePath)) {
    return;
  }
  shownFor.set(view, filePath);

  const doc = view.state.doc;
  const client = filePath ? readyClient(filePath) : null;
  const canFix = Boolean(client?.supports('codeActionProvider'));

  const mapped: CmDiagnostic[] = diagnostics.map((d) => {
    const { from, to } = rangeToOffsets(doc, d.range);
    const markClass = diagnosticMark(d.tags);
    const entry: CmDiagnostic = {
      from,
      to: to === from ? Math.min(from + 1, doc.length) : to,
      severity: SEVERITY[d.severity ?? 1] ?? 'error',
      message: diagnosticText(d),
      source: d.source,
      markClass,
      renderMessage: () => renderDiagnostic(d),
    };
    if (canFix && filePath) {
      entry.actions = [{
        name: 'Korrektur…',
        apply: (v) => { void showCodeActions(v, filePath, undefined, d.range); },
      }];
    }
    return entry;
  });
  view.dispatch(setDiagnostics(view.state, mapped));
}

export function warn(message: string) {
  console.warn(`[lsp] ${message}`);
  useStore.getState().notify(message, 'warning');
}

/** Format through the language server: whether it changed anything, or `null` when there is no server to ask. */
export async function formatWithLanguageServer(view: EditorView, filePath: string, format: LanguageFormat): Promise<boolean | null> {
  const client = readyClient(filePath);
  if (!client) {
    return null;
  }
  const options = lspFormattingOptions(format);
  const selection = view.state.selection.main;
  const edits = selection.empty || !client.supports('documentRangeFormattingProvider')
    ? await client.formatting(filePath, options)
    : await client.rangeFormatting(filePath, selectionRange(view), options);
  return edits?.length ? applyFormatEdits(view, edits, selection.head) : false;
}

function applyFormatEdits(view: EditorView, edits: TextEdit[], head: number): boolean {
  const changes = textEditsToChanges(view.state.doc, edits);
  const spec: TransactionSpec = { changes, userEvent: 'lsp.format' };
  const tr = view.state.update(spec);
  view.dispatch(tr);
  const mapped = tr.changes.mapPos(head);
  view.dispatch({ selection: EditorSelection.cursor(Math.min(mapped, view.state.doc.length)) });
  return true;
}
